#!/usr/bin/env node
// Composition root (design §3). Sequencing + exit policy + output routing
// only — zero domain logic (module boundary rule, root CLAUDE.md), and it
// never re-words an error produced by a lower module (design §5 invariant).
import { fileURLToPath } from "node:url";
import { Command, CommanderError, Option } from "commander";
import pkg from "../package.json" with { type: "json" };
import { loadConfig, resolveToken, ConfigError, type Config } from "./config.js";
import { renderAppliedDetail, renderConfigEcho, renderParsedSummary, renderPlanDetail, renderWarningsCounter } from "./cli-verbose.js";
import { GithubClientError, assertAuth, createClient } from "./github/index.js";
import { PrdParseError, parsePrd } from "./parser/index.js";
import { renderMarkdown, renderText } from "./report/index.js";
import { sync } from "./sync/index.js";

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: NodeJS.ProcessEnv;
}

export interface CliDeps {
  readonly loadConfig: typeof loadConfig;
  readonly parsePrd: typeof parsePrd;
  readonly createClient: typeof createClient;
  readonly assertAuth: typeof assertAuth;
  readonly sync: typeof sync;
  readonly renderText: typeof renderText;
  readonly renderMarkdown: typeof renderMarkdown;
}

const defaultDeps: CliDeps = { loadConfig, parsePrd, createClient, assertAuth, sync, renderText, renderMarkdown };

interface SyncFlags {
  readonly dryRun: boolean;
  readonly config: string;
  readonly verbose: boolean;
  readonly format: "text" | "markdown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runSync(flags: SyncFlags, io: CliIo, deps: CliDeps): Promise<number> {
  try {
    const config: Config = await deps.loadConfig(flags.config);
    const token = resolveToken(io.env);

    if (flags.verbose) {
      io.stderr(renderConfigEcho(config, { configPath: flags.config, cwd: process.cwd(), env: io.env }));
    }

    const prds = await deps.parsePrd(config.sources);
    if (flags.verbose) io.stderr(renderParsedSummary(prds));

    const ctx = deps.createClient({
      auth: token,
      repo: config.repo,
      queue: config.throttleMs === undefined ? undefined : { throttleMs: config.throttleMs },
    });
    await deps.assertAuth(ctx);
    if (flags.verbose) io.stderr("auth ok");

    const result = await deps.sync({
      prds,
      ctx,
      syncLabel: config.syncLabel,
      project: config.projectNumber === undefined ? undefined : { owner: config.repo.owner, number: config.projectNumber },
      dryRun: flags.dryRun,
      fieldMapping: config.fieldMapping,
    });

    if (flags.verbose) {
      io.stderr("plan built");
      io.stderr(renderPlanDetail(result.plan));
      if (result.applied !== undefined) {
        io.stderr("applying…");
        io.stderr(renderAppliedDetail(result.applied));
      }
    } else if (result.applied !== undefined && result.applied.warnings.length > 0) {
      io.stderr(renderWarningsCounter(result.applied));
    }

    const render = flags.format === "markdown" ? deps.renderMarkdown : deps.renderText;
    io.stdout(`${render(result.plan, result.applied)}\n`);

    if (result.applied === undefined) return 0;
    return result.applied.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof PrdParseError) {
      io.stderr(`PRD parse failed:\n${error.message}\n`);
      return 1;
    }
    // ConfigError and GithubClientError already carry a self-describing
    // message (design §5 invariant 1) — printed verbatim, no added header.
    io.stderr(`${errorMessage(error)}\n`);
    if (flags.verbose && error instanceof Error && !(error instanceof ConfigError) && !(error instanceof GithubClientError)) {
      if (error.stack !== undefined) io.stderr(error.stack);
    }
    return 1;
  }
}

function buildProgram(io: CliIo, deps: CliDeps, exitCodeRef: { value: number }): Command {
  const program = new Command();
  program.name("prd-sync").description("Sync a Markdown PRD to GitHub Issues and Projects v2").version(pkg.version);
  program.exitOverride();
  program.configureOutput({ writeOut: io.stdout, writeErr: io.stderr });

  program
    .command("sync", { isDefault: true })
    .description("Plan and apply the sync")
    .option("--dry-run", "Print the plan without writing anything", false)
    .option("--config <path>", "Config file", "prd-sync.config.json")
    .option("--verbose", "Show resolved config, per-operation detail, and all warnings", false)
    .addOption(new Option("--format <format>", "Report format written to stdout").choices(["text", "markdown"]).default("text"))
    .action(async (flags: SyncFlags) => {
      exitCodeRef.value = await runSync(flags, io, deps);
    });

  return program;
}

/**
 * Returns an exit code — never calls `process.exit()` (design ADR-8): that
 * would truncate buffered stdout on a pipe, corrupting a captured plan.
 */
export async function main(argv: readonly string[], io: CliIo, deps: CliDeps = defaultDeps): Promise<number> {
  const exitCodeRef = { value: 0 };
  const program = buildProgram(io, deps, exitCodeRef);

  try {
    await program.parseAsync([...argv], { from: "node" });
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    throw error;
  }

  return exitCodeRef.value;
}

// import.meta.main (Node >= 24.2) with a manual fallback for older runtimes
// (design §3.1) — guards the self-run so importing `main` in tests never
// executes the real CLI against the real process.
const isMainModule = import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  process.exitCode = await main(process.argv, { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text), env: process.env });
}

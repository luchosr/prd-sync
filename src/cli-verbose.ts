// `--verbose` formatting (design §6), extracted from cli.ts to keep the
// composition root near its ~100-line target. No API-call logging: there is
// no request hook on src/github/'s public surface (out of scope), so this
// is CLI-side detail only, assembled from public types, all destined for
// stderr (design §3.4 — stdout stays the pipe-safe report).
import type { Config } from "./config.js";
import type { Prd } from "./domain/types.js";
import { DEFAULT_SYNC_LABEL, type ApplyResult, type Plan } from "./sync/index.js";

// Accepted duplication (mirrors config.ts's resolveToken comment): these are
// PROJECT_FIELDS' literal values in src/sync/apply-project.ts, which is an
// internal file not exported from src/sync/index.ts. Widening that module's
// public surface just to serve this display string is out of scope.
const DEFAULT_FIELD_NAMES = { priority: "Priority", estimate: "Estimate" } as const;
const DEFAULT_THROTTLE_MS = 500;

export interface VerboseConfigContext {
  readonly configPath: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

export function renderConfigEcho(config: Config, ctx: VerboseConfigContext): string {
  const project = config.projectNumber === undefined ? "(none)" : `#${config.projectNumber}`;
  const syncLabel = config.syncLabel ?? `${DEFAULT_SYNC_LABEL} (default)`;
  const priority = config.fieldMapping?.priority ?? `${DEFAULT_FIELD_NAMES.priority} (default)`;
  const estimate = config.fieldMapping?.estimate ?? `${DEFAULT_FIELD_NAMES.estimate} (default)`;
  const throttleMs = config.throttleMs === undefined ? `${DEFAULT_THROTTLE_MS} (default)` : String(config.throttleMs);
  const tokenState = ctx.env.GITHUB_TOKEN === undefined || ctx.env.GITHUB_TOKEN.length === 0 ? "not set" : "set (redacted)";

  return [
    "Resolved config:",
    `  path: ${ctx.configPath}`,
    `  cwd: ${ctx.cwd}`,
    `  repo: ${config.repo.owner}/${config.repo.repo}`,
    `  project: ${project}`,
    `  sources: ${config.sources.join(", ")}`,
    `  syncLabel: ${syncLabel}`,
    `  fieldMapping: priority=${priority}, estimate=${estimate}`,
    `  throttleMs: ${throttleMs}`,
    `  GITHUB_TOKEN: ${tokenState}`,
  ].join("\n");
}

// noop operations are the ones renderText deliberately omits (text.ts A13);
// verbose is the one place they become visible, one line each with the
// reason. Warnings get their machine-readable `code` plus issue number(s),
// since renderText prints only the human `message`.
export function renderPlanDetail(plan: Plan): string {
  const lines: string[] = [];
  const noops = plan.operations.filter((op) => op.kind === "noop");

  if (noops.length > 0) {
    lines.push("Unchanged (noop):", ...noops.map((op) => `  ${op.key}  ${op.reason}`));
  }

  if (plan.warnings.length > 0) {
    lines.push(
      "Plan warnings:",
      ...plan.warnings.map((warning) => {
        const ref = warning.code === "unmanaged-issue" ? `#${warning.number}` : `#${warning.number} (kept #${warning.keptNumber})`;
        return `  [${warning.code}] ${ref}  ${warning.message}`;
      }),
    );
  }

  return lines.length > 0 ? lines.join("\n") : "Plan detail: nothing beyond the summary above.";
}

// Per-item detail renderText omits (it prints only counts for the applied
// section), plus every GithubWarning — renderText never renders these at
// all, so without --verbose they would otherwise be invisible entirely.
export function renderAppliedDetail(applied: ApplyResult): string {
  const lines: string[] = [
    ...applied.created.map((item) => `  created ${item.key} #${item.number} ${item.title}`),
    ...applied.updated.map((item) => `  updated ${item.key} #${item.number} ${item.title}`),
    ...applied.orphaned.map((item) => `  orphaned ${item.key} #${item.number} ${item.title}`),
  ];

  if (applied.warnings.length > 0) {
    lines.push(
      "GitHub warnings:",
      ...applied.warnings.map((warning) => `  [${warning.code}] ${warning.field} — ${warning.message}\n    ↳ ${warning.suggestion}`),
    );
  }

  return lines.length > 0 ? lines.join("\n") : "Applied detail: nothing beyond the summary above.";
}

// Phase marker (design §6 point 2): counted straight from the parsed Prd[].
export function renderParsedSummary(prds: readonly Prd[]): string {
  const epics = prds.reduce((total, prd) => total + prd.epics.length, 0);
  const stories = prds.reduce((total, prd) => total + prd.stories.length, 0);
  return `parsed ${prds.length} file(s): ${epics} epic(s), ${stories} ${stories === 1 ? "story" : "stories"}`;
}

// Non-verbose counterpart of renderAppliedDetail's warnings section (design
// §6 point 5): a single counter line so warnings can never vanish silently.
export function renderWarningsCounter(applied: ApplyResult): string {
  return `${applied.warnings.length} GitHub warning(s) — re-run with --verbose`;
}

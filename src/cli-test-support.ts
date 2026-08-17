// Shared fixtures for the cli.test.ts / cli-errors.test.ts / cli-verbose.test.ts
// split (kept out of production code — mirrors src/sync/test-support.ts's
// convention of a same-directory, test-only support module). All of
// CliDeps is injected (design ADR-5), so no real network or filesystem
// access happens through these fakes.
import type { Config } from "./config.js";
import type { CliDeps, CliIo } from "./cli.js";
import type { Prd } from "./domain/types.js";
import type { ClientContext } from "./github/index.js";
import type { ApplyResult, Plan, SyncResult } from "./sync/index.js";

export function fakeConfig(overrides: Partial<Config> = {}): Config {
  return {
    repo: { owner: "acme", repo: "widgets" },
    sources: ["docs/prd/**/*.md"],
    ...overrides,
  };
}

export function fakePrds(): readonly Prd[] {
  return [
    {
      title: "PRD",
      sourcePath: "docs/prd/PRD.md",
      epics: [{ key: "E1", title: "Epic one", body: "" }],
      stories: [{ key: "US-01", title: "Story one", epicKey: "E1", body: "", tasks: [] }],
    },
  ];
}

export function fakeClientContext(): ClientContext {
  return {
    repo: { owner: "acme", repo: "widgets" },
    projectFieldCache: new Map(),
    rest: () => Promise.reject(new Error("not wired in this fake")),
    gql: () => Promise.reject(new Error("not wired in this fake")),
    warn: () => undefined,
  };
}

export function fakePlan(overrides: Partial<Plan> = {}): Plan {
  return { operations: [], warnings: [], ...overrides };
}

export function fakeApplied(overrides: Partial<ApplyResult> = {}): ApplyResult {
  return {
    created: [],
    updated: [],
    orphaned: [],
    skipped: [],
    failures: [],
    warnings: [],
    ok: true,
    ...overrides,
  };
}

export function fakeSyncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return { plan: fakePlan(), ...overrides };
}

export interface CapturedIo extends CliIo {
  readonly stdoutLines: string[];
  readonly stderrLines: string[];
}

export function fakeIo(env: NodeJS.ProcessEnv = { GITHUB_TOKEN: "ghp_test_token_value" }): CapturedIo {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    stdout: (text) => stdoutLines.push(text),
    stderr: (text) => stderrLines.push(text),
    env,
    stdoutLines,
    stderrLines,
  };
}

export function fakeDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    loadConfig: () => Promise.resolve(fakeConfig()),
    parsePrd: () => Promise.resolve([...fakePrds()]),
    createClient: () => fakeClientContext(),
    assertAuth: () => Promise.resolve(),
    sync: () => Promise.resolve(fakeSyncResult()),
    renderText: () => "rendered plan",
    renderMarkdown: () => "rendered plan",
    ...overrides,
  };
}

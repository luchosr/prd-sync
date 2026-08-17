// Exit-code decision tree (design §4) plus the bare-vs-explicit argv
// equivalence test the design flags as unverifiable until commander is
// installed (ADR-1). Error-path tests for US-09's three ACs live in
// cli-errors.test.ts; --verbose output lives in cli-verbose.test.ts; the
// real build/hashbang check lives in cli-build.test.ts — split for size,
// mirroring the config.ts split precedent (PR1).
import { describe, expect, it } from "vitest";
import { main } from "./cli.js";
import { fakeApplied, fakeConfig, fakeDeps, fakeIo, fakePlan, fakeSyncResult } from "./cli-test-support.js";

describe("main — --config <path> flag (spec: cli-invocation, Custom config path)", () => {
  it("passes the --config value straight through to deps.loadConfig", async () => {
    const io = fakeIo();
    const seenPaths: string[] = [];
    const deps = fakeDeps({
      loadConfig: (path: string) => {
        seenPaths.push(path);
        return Promise.resolve(fakeConfig());
      },
    });

    const exitCode = await main(["node", "prd-sync", "sync", "--config", "custom/path.json", "--dry-run"], io, deps);

    expect(seenPaths).toEqual(["custom/path.json"]);
    expect(exitCode).toBe(0);
  });

  it("defaults to prd-sync.config.json when --config is omitted", async () => {
    const io = fakeIo();
    const seenPaths: string[] = [];
    const deps = fakeDeps({
      loadConfig: (path: string) => {
        seenPaths.push(path);
        return Promise.resolve(fakeConfig());
      },
    });

    await main(["node", "prd-sync", "sync", "--dry-run"], io, deps);

    expect(seenPaths).toEqual(["prd-sync.config.json"]);
  });
});

describe("main — argv equivalence (ADR-1)", () => {
  it("bare `prd-sync --dry-run` behaves identically to `prd-sync sync --dry-run`", async () => {
    const io1 = fakeIo();
    const io2 = fakeIo();
    const deps = fakeDeps({ renderText: () => "the plan" });

    const bareExit = await main(["node", "prd-sync", "--dry-run"], io1, deps);
    const explicitExit = await main(["node", "prd-sync", "sync", "--dry-run"], io2, deps);

    expect(bareExit).toBe(0);
    expect(explicitExit).toBe(0);
    expect(io1.stdoutLines).toEqual(io2.stdoutLines);
    expect(io1.stdoutLines.join("")).toContain("the plan");
  });
});

describe("main — exit-code decision tree (design §4)", () => {
  it("clean dry-run exits 0 regardless of plan warnings", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      sync: () =>
        Promise.resolve(
          fakeSyncResult({
            plan: fakePlan({ warnings: [{ code: "unmanaged-issue", number: 9, title: "x", message: "warn" }] }),
          }),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync", "--dry-run"], io, deps);

    expect(exitCode).toBe(0);
  });

  it("zero-change apply (ok: true, empty failures) exits 0", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      sync: () => Promise.resolve(fakeSyncResult({ applied: fakeApplied() })),
    });

    const exitCode = await main(["node", "prd-sync", "sync"], io, deps);

    expect(exitCode).toBe(0);
  });

  it("partial apply failure (applied.ok === false, successes still printed) exits 1 — highest-risk scenario", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      sync: () =>
        Promise.resolve(
          fakeSyncResult({
            applied: fakeApplied({
              created: [{ key: "US-01", itemKind: "story", number: 1, title: "Story one" }],
              failures: [{ key: "US-02", itemKind: "story", step: "create", message: "422" }],
              ok: false,
            }),
          }),
        ),
      renderText: () => "9 created, 1 failed",
    });

    const exitCode = await main(["node", "prd-sync", "sync"], io, deps);

    expect(exitCode).toBe(1);
    // The report must still be printed on a failing apply (design §4 invariant).
    expect(io.stdoutLines.join("")).toContain("9 created, 1 failed");
  });

  it("warnings-only run (ok: true, non-empty warnings) exits 0", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      sync: () =>
        Promise.resolve(
          fakeSyncResult({
            applied: fakeApplied({
              warnings: [{ code: "unknown-project-field", operation: "setFieldValue", field: "Priority", message: "m", suggestion: "s" }],
            }),
          }),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync"], io, deps);

    expect(exitCode).toBe(0);
  });

  it("a parent-not-found link skip with zero failures exits 0 (deliberate — skipped is not failures)", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      sync: () =>
        Promise.resolve(
          fakeSyncResult({
            applied: fakeApplied({
              skipped: [{ key: "US-03", step: "link-sub-issue", reason: "parent-not-found" }],
            }),
          }),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync"], io, deps);

    expect(exitCode).toBe(0);
  });
});

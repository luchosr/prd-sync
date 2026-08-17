// `--verbose` output test (design §6). Split out of cli.test.ts for size.
import { describe, expect, it } from "vitest";
import { main } from "./cli.js";
import { renderParsedSummary, renderWarningsCounter } from "./cli-verbose.js";
import { fakeApplied, fakeDeps, fakeIo, fakePlan, fakeSyncResult } from "./cli-test-support.js";

describe("renderParsedSummary (pure)", () => {
  it("pluralizes 'story'/'stories' and sums epics/stories across multiple Prd files", () => {
    const onePrd = [{ title: "t", sourcePath: "p", epics: [{ key: "E1", title: "e", body: "" }], stories: [] }];
    const twoPrds = [
      { title: "a", sourcePath: "a.md", epics: [], stories: [{ key: "US-01", title: "s1", epicKey: null, body: "", tasks: [] }] },
      {
        title: "b",
        sourcePath: "b.md",
        epics: [],
        stories: [
          { key: "US-02", title: "s2", epicKey: null, body: "", tasks: [] },
          { key: "US-03", title: "s3", epicKey: null, body: "", tasks: [] },
        ],
      },
    ];

    expect(renderParsedSummary(onePrd)).toBe("parsed 1 file(s): 1 epic(s), 0 stories");
    expect(renderParsedSummary(twoPrds)).toBe("parsed 2 file(s): 0 epic(s), 3 stories");
  });
});

describe("renderWarningsCounter (pure)", () => {
  it("counts applied.warnings.length", () => {
    expect(renderWarningsCounter(fakeApplied({ warnings: [] }))).toBe("0 GitHub warning(s) — re-run with --verbose");
    expect(
      renderWarningsCounter(
        fakeApplied({
          warnings: [
            { code: "unknown-project-field", operation: "op", field: "Priority", message: "m", suggestion: "s" },
            { code: "unsupported-project-field-type", operation: "op", field: "Estimate", message: "m2", suggestion: "s2" },
          ],
        }),
      ),
    ).toBe("2 GitHub warning(s) — re-run with --verbose");
  });
});

describe("main — --verbose output", () => {
  it("prints resolved config, per-item plan/apply detail, and all warnings to stderr — never the raw token or an HTTP log line", async () => {
    const io = fakeIo({ GITHUB_TOKEN: "ghp_super_secret_do_not_leak" });
    const deps = fakeDeps({
      sync: () =>
        Promise.resolve(
          fakeSyncResult({
            plan: fakePlan({
              operations: [{ kind: "noop", itemKind: "story", key: "US-04", title: "Unchanged story", reason: "unchanged" }],
            }),
            applied: fakeApplied({
              created: [{ key: "US-01", itemKind: "story", number: 42, title: "New story" }],
              warnings: [
                { code: "unknown-project-field", operation: "setFieldValue", field: "Priority", message: "field not found", suggestion: "check the Project's field names" },
              ],
            }),
          }),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync", "--verbose"], io, deps);
    const stderr = io.stderrLines.join("\n");

    expect(exitCode).toBe(0);
    expect(stderr).toContain("Resolved config:");
    expect(stderr).toContain("GITHUB_TOKEN: set (redacted)");
    expect(stderr).not.toContain("ghp_super_secret_do_not_leak");
    expect(stderr).toContain("US-04  unchanged");
    expect(stderr).toContain("created US-01 #42 New story");
    expect(stderr).toContain("[unknown-project-field] Priority — field not found");
    expect(stderr).not.toMatch(/GET \/|POST \/|x-ratelimit|octokit/i);
  });

  it("non-verbose runs print only a warning counter, never the per-warning detail", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      sync: () =>
        Promise.resolve(
          fakeSyncResult({
            applied: fakeApplied({
              warnings: [
                { code: "unknown-project-field", operation: "setFieldValue", field: "Priority", message: "field not found", suggestion: "check the Project's field names" },
              ],
            }),
          }),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync"], io, deps);
    const stderr = io.stderrLines.join("\n");

    expect(exitCode).toBe(0);
    expect(stderr).toContain("1 GitHub warning(s) — re-run with --verbose");
    expect(stderr).not.toContain("field not found");
  });
});

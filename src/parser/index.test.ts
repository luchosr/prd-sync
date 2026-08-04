import { describe, expect, it } from "vitest";
import { parsePrd, PrdParseError } from "./index.js";
import type { PrdIssueCode, PrdParseIssue } from "./index.js";

describe("public surface", () => {
  it("re-exports parsePrd and PrdParseError, and no other module needs importing", async () => {
    const result = await parsePrd("docs/prd/PRD-prd-sync.md");

    expect(result).toHaveLength(1);
    expect(PrdParseError).toBeInstanceOf(Function);
  });

  it("re-exports the PrdParseIssue and PrdIssueCode types (compile-time check via a typed literal)", () => {
    const issue: PrdParseIssue = {
      code: "no-source-files" satisfies PrdIssueCode,
      path: "x",
      line: 0,
      heading: "",
      message: "m",
      suggestion: "s",
    };

    expect(issue.code).toBe("no-source-files");
  });
});

describe("parsePrd against the project's own PRD (dogfood capstone)", () => {
  it("parses docs/prd/PRD-prd-sync.md into exactly 6 epics and 12 stories matching section 8", async () => {
    const [prd] = await parsePrd("docs/prd/PRD-prd-sync.md");

    expect(prd?.title).toBe("PRD — prd-sync");
    expect(prd?.epics.map((epic) => epic.key)).toEqual(["E1", "E2", "E3", "E4", "E5", "E6"]);
    expect(prd?.stories.map((story) => story.key)).toEqual([
      "US-01", "US-02", "US-03", "US-04", "US-05", "US-06",
      "US-07", "US-08", "US-09", "US-10", "US-11", "US-12",
    ]);
  });

  it("assigns each story to its section-8 epic, even though §8 is one heading depth deeper than §5's contract example", async () => {
    const [prd] = await parsePrd("docs/prd/PRD-prd-sync.md");
    const epicKeyOf = (key: string) => prd?.stories.find((story) => story.key === key)?.epicKey;

    expect(epicKeyOf("US-01")).toBe("E1");
    expect(epicKeyOf("US-05")).toBe("E2");
    expect(epicKeyOf("US-09")).toBe("E4");
    expect(epicKeyOf("US-12")).toBe("E6");
  });

  it("extracts priority, estimate and exact task counts per story", async () => {
    const [prd] = await parsePrd("docs/prd/PRD-prd-sync.md");
    const storyOf = (key: string) => prd?.stories.find((story) => story.key === key);

    expect(storyOf("US-01")).toMatchObject({ priority: "P0", estimate: 5 });
    expect(storyOf("US-01")?.tasks).toHaveLength(5);
    expect(storyOf("US-06")).toMatchObject({ priority: "P0", estimate: 8 });
    expect(storyOf("US-06")?.tasks).toHaveLength(6);
    expect(storyOf("US-12")).toMatchObject({ priority: "P1", estimate: 3 });
    expect(storyOf("US-12")?.tasks).toHaveLength(4);
  });

  it("never throws — the fenced §5 contract example (containing literal 'E1 — <Epic name>') produces no phantom epic", async () => {
    // If the code-fenced example in §5 were mistakenly parsed as a real
    // heading, it would collide with the real E1 in §8 and this whole call
    // would reject with a duplicate-epic-key PrdParseError instead of
    // resolving. A single successful resolve is the strongest proof the
    // fence stayed inert.
    await expect(parsePrd("docs/prd/PRD-prd-sync.md")).resolves.toBeDefined();
  });
});

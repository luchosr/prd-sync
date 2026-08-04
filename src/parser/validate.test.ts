import { describe, expect, it } from "vitest";
import type { ParsedDocument } from "./parse-document.js";
import { validateUniqueKeys } from "./validate.js";

function doc(sourcePath: string, locations: ParsedDocument["locations"]): ParsedDocument {
  return {
    prd: { title: "t", sourcePath, epics: [], stories: [] },
    issues: [],
    locations,
  };
}

describe("validateUniqueKeys", () => {
  it("returns no issues when every epic/story key is unique across all documents", () => {
    const docs = [
      doc("a.md", [{ kind: "epic", key: "E1", line: 1, heading: "E1 — A" }]),
      doc("b.md", [{ kind: "epic", key: "E2", line: 1, heading: "E2 — B" }]),
    ];

    expect(validateUniqueKeys(docs)).toEqual([]);
  });

  it("reports a duplicate-story-key issue for two US-01 headings within the same file", () => {
    const docs = [
      doc("a.md", [
        { kind: "story", key: "US-01", line: 5, heading: "US-01: first" },
        { kind: "story", key: "US-01", line: 20, heading: "US-01: second" },
      ]),
    ];

    const issues = validateUniqueKeys(docs);

    expect(issues).toEqual([
      expect.objectContaining({
        code: "duplicate-story-key",
        path: "a.md",
        line: 20,
        heading: "US-01: second",
        relatedPath: "a.md",
        relatedLine: 5,
      }),
    ]);
  });

  it("reports a duplicate-epic-key issue across two different files, naming both sites", () => {
    const docs = [
      doc("a.md", [{ kind: "epic", key: "E1", line: 3, heading: "E1 — First" }]),
      doc("b.md", [{ kind: "epic", key: "E1", line: 7, heading: "E1 — Second" }]),
    ];

    const issues = validateUniqueKeys(docs);

    expect(issues).toEqual([
      expect.objectContaining({
        code: "duplicate-epic-key",
        path: "b.md",
        line: 7,
        relatedPath: "a.md",
        relatedLine: 3,
      }),
    ]);
  });

  it("keeps epic and story key namespaces separate (E1 does not collide with US-1-shaped keys)", () => {
    const docs = [
      doc("a.md", [
        { kind: "epic", key: "E1", line: 1, heading: "E1 — A" },
        { kind: "story", key: "E1", line: 2, heading: "not really, same key different kind" },
      ]),
    ];

    expect(validateUniqueKeys(docs)).toEqual([]);
  });

  it("accumulates one issue per duplicate site beyond the first occurrence", () => {
    const docs = [
      doc("a.md", [
        { kind: "story", key: "US-01", line: 5, heading: "US-01: first" },
        { kind: "story", key: "US-01", line: 20, heading: "US-01: second" },
        { kind: "story", key: "US-01", line: 40, heading: "US-01: third" },
      ]),
    ];

    const issues = validateUniqueKeys(docs);

    expect(issues).toHaveLength(2);
    expect(issues[0]?.line).toBe(20);
    expect(issues[1]?.line).toBe(40);
  });
});

import { describe, expect, it } from "vitest";
import { formatIssues, PrdParseError, type PrdParseIssue } from "./errors.js";

function issue(overrides: Partial<PrdParseIssue> = {}): PrdParseIssue {
  return {
    code: "duplicate-story-key",
    path: "docs/prd/a.md",
    line: 12,
    heading: "### US-01: first",
    message: "Duplicate key US-01",
    suggestion: "Rename one of the two US-01 stories",
    ...overrides,
  };
}

describe("formatIssues", () => {
  it("formats a single issue as path:line — message with a suggestion line", () => {
    const result = formatIssues([issue()]);

    expect(result).toBe(
      "docs/prd/a.md:12 — Duplicate key US-01\n  ↳ Rename one of the two US-01 stories",
    );
  });

  it("joins multiple issues with different content on separate blocks", () => {
    const result = formatIssues([
      issue({
        path: "docs/prd/b.md",
        line: 40,
        message: "Malformed heading US-1a",
        suggestion: "Use the form US-<n>",
      }),
      issue({
        path: "docs/prd/c.md",
        line: 7,
        message: "Duplicate key E1",
        suggestion: "Rename one of the two E1 epics",
      }),
    ]);

    expect(result).toBe(
      "docs/prd/b.md:40 — Malformed heading US-1a\n  ↳ Use the form US-<n>\n" +
        "docs/prd/c.md:7 — Duplicate key E1\n  ↳ Rename one of the two E1 epics",
    );
  });
});

describe("PrdParseError", () => {
  it("carries the issues, sets name, and derives message from formatIssues()", () => {
    const issues = [issue()];

    const error = new PrdParseError(issues);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PrdParseError");
    expect(error.issues).toBe(issues);
    expect(error.message).toBe(formatIssues(issues));
  });
});

export type PrdIssueCode =
  | "duplicate-story-key"
  | "duplicate-epic-key"
  | "malformed-story-id"
  | "malformed-epic-id"
  | "no-source-files";

export interface PrdParseIssue {
  readonly code: PrdIssueCode;
  readonly path: string;
  readonly line: number;
  readonly heading: string;
  readonly message: string;
  readonly suggestion: string;
  readonly relatedPath?: string;
  readonly relatedLine?: number;
}

export function formatIssues(issues: readonly PrdParseIssue[]): string {
  return issues
    .map((issue) => `${issue.path}:${issue.line} — ${issue.message}\n  ↳ ${issue.suggestion}`)
    .join("\n");
}

export class PrdParseError extends Error {
  readonly issues: readonly PrdParseIssue[];

  constructor(issues: readonly PrdParseIssue[]) {
    super(formatIssues(issues));
    this.name = "PrdParseError";
    this.issues = issues;
  }
}

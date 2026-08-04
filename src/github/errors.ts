export type GithubIssueCode =
  | "auth-failed"
  | "insufficient-scopes"
  | "insufficient-permissions"
  | "rate-limit-exhausted"
  | "sub-issue-link-failed"
  | "project-not-found"
  | "unexpected-response"
  | "network-failure";

export interface GithubClientIssue {
  readonly code: GithubIssueCode;
  readonly operation: string;
  readonly message: string;
  readonly suggestion: string;
  readonly status?: number;
  readonly requestId?: string; // x-github-request-id
  readonly docsUrl?: string;
}

export type GithubWarningCode =
  | "unknown-project-field"
  | "unknown-project-field-option"
  | "unsupported-project-field-type";

export interface GithubWarning {
  readonly code: GithubWarningCode;
  readonly operation: string;
  readonly field: string;
  readonly message: string;
  readonly suggestion: string;
}

function formatContext(issue: GithubClientIssue): string {
  const parts = [
    issue.status !== undefined ? `status ${issue.status}` : undefined,
    issue.requestId !== undefined ? `request ${issue.requestId}` : undefined,
  ].filter((part): part is string => part !== undefined);

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

export function formatIssues(issues: readonly GithubClientIssue[]): string {
  return issues
    .map((issue) => `${issue.operation}${formatContext(issue)}: ${issue.message}\n  ↳ ${issue.suggestion}`)
    .join("\n");
}

// Never carries a raw `Authorization` header — only `status`, `requestId`
// (x-github-request-id), and `docsUrl` cross this boundary. See design
// decision #16 (token hygiene).
export class GithubClientError extends Error {
  readonly issues: readonly GithubClientIssue[];
  readonly operation: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly docsUrl?: string;

  constructor(issues: readonly GithubClientIssue[]) {
    super(formatIssues(issues));
    this.name = "GithubClientError";
    this.issues = issues;

    const [primary] = issues;
    this.operation = primary.operation;
    this.status = primary.status;
    this.requestId = primary.requestId;
    this.docsUrl = primary.docsUrl;
  }
}

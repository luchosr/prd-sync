// Typed error for src/sync/'s pure planning stage. Mirrors the
// GithubClientError / PrdParseError convention: a stable `code`, an
// actionable `suggestion`, never a bare "failed".
export type SyncPlanErrorCode = "missing-issue-bodies";

export interface SyncPlanIssue {
  readonly code: SyncPlanErrorCode;
  readonly message: string;
  readonly suggestion: string;
}

export class SyncPlanError extends Error {
  readonly code: SyncPlanErrorCode;
  readonly suggestion: string;

  constructor(issue: SyncPlanIssue) {
    super(issue.message);
    this.name = "SyncPlanError";
    this.code = issue.code;
    this.suggestion = issue.suggestion;
  }
}

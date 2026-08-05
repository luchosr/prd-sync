/**
 * Public surface of `src/github/`. This is the ONLY module other code
 * (`src/sync/`, `src/cli.ts`, tests outside this directory) should import
 * from — mirrors `src/parser/index.ts`'s convention. Everything else here
 * (transport.ts, queue.ts, rate-limit.ts, queries.ts, schemas.ts,
 * test-support.ts, and context.ts's implementation) is an internal detail.
 */
export { createClient, type CreateClientOptions } from "./client.js";
export { assertAuth } from "./auth.js";
export type { ClientContext, RepoRef } from "./context.js";

export {
  createIssue,
  updateIssue,
  linkSubIssue,
  listSyncedIssues,
  type IssueRef,
  type SyncedIssue,
  type CreateIssueInput,
  type UpdateIssuePatch,
} from "./issues.js";

export {
  resolveProject,
  addItemToProject,
  setFieldValue,
  type ProjectHandle,
  type OperationResult,
  type ProjectFieldValue,
} from "./projects.js";

export {
  GithubClientError,
  type GithubClientIssue,
  type GithubIssueCode,
  type GithubWarning,
  type GithubWarningCode,
} from "./errors.js";

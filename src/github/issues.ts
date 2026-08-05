// createIssue/updateIssue/linkSubIssue/listSyncedIssues. Receives only
// `ClientContext`, never Octokit/transport.ts directly (design decision #1).
import type { ClientContext } from "./context.js";
import { GithubClientError, type GithubClientIssue } from "./errors.js";
import { ADD_SUB_ISSUE_MUTATION } from "./queries.js";
import type { NormalizedFailure } from "./rate-limit.js";
import { addSubIssueSchema, githubIssueListItemSchema, githubIssueSchema, listIssuesResponseSchema } from "./schemas.js";
import { z } from "zod";

export interface IssueRef {
  readonly number: number;
  readonly id: number;
  readonly nodeId: string;
}

export interface SyncedIssue {
  readonly number: number;
  readonly id: number;
  readonly nodeId: string;
  readonly title: string;
  readonly state: string;
  readonly labels: readonly string[];
}

export interface CreateIssueInput {
  readonly title: string;
  readonly body?: string;
  readonly labels?: readonly string[];
}

export interface UpdateIssuePatch {
  readonly title?: string;
  readonly body?: string;
  readonly state?: "open" | "closed";
  readonly labels?: readonly string[];
}

const PAGE_SIZE = 100;
// queue.ts rethrows "fatal" unwrapped (PR1), so a non-retried failure lands
// here as the raw NormalizedFailure — see the same guard in auth.ts.
function isNormalizedFailure(value: unknown): value is NormalizedFailure {
  return typeof value === "object" && value !== null && "source" in value;
}

// "already a sub-issue" resolves as success (decision #10 / CLAUDE.md
// invariant 3). Checked before the feature-gap predicate, since both
// patterns match the substring "sub-issue".
const ALREADY_LINKED_PATTERN = /already.*sub[_-]?issue/i;

function isAlreadyLinkedFailure(failure: NormalizedFailure): boolean {
  return failure.status === 422 && failure.message !== undefined && ALREADY_LINKED_PATTERN.test(failure.message);
}

// Decision #9: 404/410/501 always signal a feature gap; 415/422 only when
// the message names it. GraphQL failures carry no HTTP status, so they fall
// through to the message-only check (also used for the header-retry
// decision below). Deliberately narrow — widen after a live smoke run
// rather than redesign (design Open Questions).
const FEATURE_GAP_STATUSES = new Set([404, 410, 501]);
const FEATURE_GAP_MESSAGE_STATUSES = new Set([415, 422]);
const FEATURE_GAP_MESSAGE_PATTERN = /sub[_-]?issues?/i;

export function isSubIssueFeatureGap(failure: NormalizedFailure): boolean {
  if (failure.source === "http" && failure.status !== undefined) {
    if (FEATURE_GAP_STATUSES.has(failure.status)) return true;
    if (FEATURE_GAP_MESSAGE_STATUSES.has(failure.status)) {
      return failure.message !== undefined && FEATURE_GAP_MESSAGE_PATTERN.test(failure.message);
    }
    return false;
  }

  return failure.message !== undefined && FEATURE_GAP_MESSAGE_PATTERN.test(failure.message);
}

function subIssueLinkFailedIssue(failure: NormalizedFailure): GithubClientIssue {
  return {
    code: "sub-issue-link-failed",
    operation: "linkSubIssue",
    status: failure.status,
    message: failure.message ?? `linkSubIssue failed with status ${failure.status ?? "unknown"}`,
    suggestion: "Verify the child issue exists and is not already linked under a different parent.",
  };
}

function toLinkFailedError(error: unknown): never {
  if (error instanceof GithubClientError) throw error;
  if (isNormalizedFailure(error)) throw new GithubClientError([subIssueLinkFailedIssue(error)]);
  throw error;
}

function toIssueRef(data: z.infer<typeof githubIssueSchema>): IssueRef {
  return { number: data.number, id: data.id, nodeId: data.node_id };
}

export async function createIssue(ctx: ClientContext, input: CreateIssueInput): Promise<IssueRef> {
  const { data } = await ctx.rest(
    "createIssue",
    (octokit) =>
      octokit.request("POST /repos/{owner}/{repo}/issues", {
        owner: ctx.repo.owner,
        repo: ctx.repo.repo,
        title: input.title,
        body: input.body,
        labels: input.labels === undefined ? undefined : [...input.labels],
      }),
    githubIssueSchema,
  );

  return toIssueRef(data);
}

export async function updateIssue(ctx: ClientContext, issueNumber: number, patch: UpdateIssuePatch): Promise<IssueRef> {
  const { data } = await ctx.rest(
    "updateIssue",
    (octokit) =>
      octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
        owner: ctx.repo.owner,
        repo: ctx.repo.repo,
        issue_number: issueNumber,
        title: patch.title,
        body: patch.body,
        state: patch.state,
        labels: patch.labels === undefined ? undefined : [...patch.labels],
      }),
    githubIssueSchema,
  );

  return toIssueRef(data);
}

// Fallback for when REST reports the feature is unavailable (design
// decision #9). Retries once with `GraphQL-Features: sub_issues` only after
// the *first* GraphQL attempt itself reports a feature-unavailable error —
// never sent speculatively, to keep GHES (which may reject unknown headers)
// working on the happy path.
async function linkSubIssueViaGraphql(ctx: ClientContext, parent: IssueRef, child: IssueRef): Promise<void> {
  try {
    await ctx.gql(
      "linkSubIssue",
      (gql) => gql(ADD_SUB_ISSUE_MUTATION, { issueId: parent.nodeId, subIssueId: child.nodeId }),
      addSubIssueSchema,
    );
    return;
  } catch (error) {
    if (!isNormalizedFailure(error) || !isSubIssueFeatureGap(error)) toLinkFailedError(error);
  }

  try {
    await ctx.gql(
      "linkSubIssue",
      (gql) =>
        gql(ADD_SUB_ISSUE_MUTATION, {
          issueId: parent.nodeId,
          subIssueId: child.nodeId,
          headers: { "GraphQL-Features": "sub_issues" },
        }),
      addSubIssueSchema,
    );
  } catch (error) {
    toLinkFailedError(error);
  }
}

export async function linkSubIssue(ctx: ClientContext, parent: IssueRef, child: IssueRef): Promise<void> {
  try {
    await ctx.rest(
      "linkSubIssue",
      (octokit) =>
        octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues", {
          owner: ctx.repo.owner,
          repo: ctx.repo.repo,
          issue_number: parent.number,
          sub_issue_id: child.id,
        }),
      githubIssueSchema,
    );
    return;
  } catch (error) {
    if (isNormalizedFailure(error)) {
      if (isAlreadyLinkedFailure(error)) return;
      if (isSubIssueFeatureGap(error)) {
        await linkSubIssueViaGraphql(ctx, parent, child);
        return;
      }
    }
    toLinkFailedError(error);
  }
}

function labelName(label: z.infer<typeof githubIssueListItemSchema>["labels"][number]): string {
  return typeof label === "string" ? label : (label.name ?? "");
}

function toSyncedIssue(data: z.infer<typeof githubIssueListItemSchema>): SyncedIssue {
  return {
    number: data.number,
    id: data.id,
    nodeId: data.node_id,
    title: data.title,
    state: data.state,
    labels: data.labels.map(labelName),
  };
}

// GitHub's issues endpoint returns pull requests too — they carry a
// `pull_request` key GitHub adds to every PR-backed issue. Excluded here so
// a PR that happens to share the sync label is never treated as a Story.
function isPullRequest(data: z.infer<typeof githubIssueListItemSchema>): boolean {
  return data.pull_request !== undefined;
}

// Manual page/per_page loop, each page its own queued unit (design decision
// #14) — `octokit.paginate` bypasses the owned queue, so throttle and
// backoff would not apply to pages 2..n. One pass, marker-agnostic.
export async function listSyncedIssues(ctx: ClientContext, label: string): Promise<readonly SyncedIssue[]> {
  const results: SyncedIssue[] = [];
  let page = 1;

  for (;;) {
    const { data } = await ctx.rest(
      "listSyncedIssues",
      (octokit) =>
        octokit.request("GET /repos/{owner}/{repo}/issues", {
          owner: ctx.repo.owner,
          repo: ctx.repo.repo,
          labels: label,
          state: "all",
          per_page: PAGE_SIZE,
          page,
        }),
      listIssuesResponseSchema,
    );

    results.push(...data.filter((item) => !isPullRequest(item)).map(toSyncedIssue));

    if (data.length < PAGE_SIZE) break;
    page += 1;
  }

  return results;
}

import type { ZodType } from "zod";
import type { GithubWarning } from "./errors.js";
import type { GraphqlClient, RestClient } from "./transport.js";

export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

// Structural shape of what a REST call callback must return before it is
// validated. Octokit's real `OctokitResponse<T>` (status/url/data/headers)
// is a superset of this and satisfies it directly.
export interface RawRestResponse {
  readonly data: unknown;
  readonly headers?: Readonly<Record<string, string | number | undefined>>;
}

export interface RestResult<T> {
  readonly data: T;
  readonly headers: Readonly<Record<string, string>>;
}

// The funnel every GitHub call goes through (design decision #1). Feature
// modules and auth.ts receive only this — never the raw Octokit/graphql
// clients — so throttling, backoff, and schema validation cannot be
// bypassed by a module that only has `ctx` in scope.
export interface ClientContext {
  readonly repo: RepoRef;
  // Design decision #12: Map<projectId, FieldSchema>, resolved lazily once
  // by projects.ts (PR3) and never invalidated. PR2 only owns the empty
  // cache — the FieldSchema shape lands with projects.ts.
  readonly projectFieldCache: Map<string, unknown>;
  rest<T>(
    operation: string,
    request: (octokit: RestClient) => Promise<RawRestResponse>,
    schema: ZodType<T>,
  ): Promise<RestResult<T>>;
  gql<T>(operation: string, request: (client: GraphqlClient) => Promise<unknown>, schema: ZodType<T>): Promise<T>;
  warn(warning: GithubWarning): void;
}

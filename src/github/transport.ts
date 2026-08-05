// Sole module constructing Octokit/graphql (design decision #7). Every
// other module reaches GitHub only through the `ClientContext` funnel
// (client.ts) — never through this file directly.
import { graphql } from "@octokit/graphql";
import { retry } from "@octokit/plugin-retry";
import { Octokit } from "@octokit/rest";
import type { NormalizedFailure } from "./rate-limit.js";

// Defense-in-depth only (design decision #7). queue.ts + rate-limit.ts are
// the single source of truth for retry decisions; plugin-retry must never
// retry a status they already have an opinion about, or the two mechanisms
// would race each other. It steps in only for 5xx/socket blips it never sees.
const DO_NOT_RETRY = [400, 401, 403, 404, 422, 429];

const RetryableOctokit = Octokit.plugin(retry);

export type RestClient = InstanceType<typeof RetryableOctokit>;
export type GraphqlClient = typeof graphql;

export interface Transport {
  readonly rest: RestClient;
  readonly gql: GraphqlClient;
}

export function createTransport(auth: string): Transport {
  const rest = new RetryableOctokit({
    auth,
    retry: { doNotRetry: DO_NOT_RETRY },
  });

  const gql = graphql.defaults({
    headers: { authorization: `token ${auth}` },
  });

  return { rest, gql };
}

// Defensive normalization ("lower-cased header map" per design). Octokit's
// REST responses already arrive lower-cased; this guards the GraphQL error
// path and any transport that doesn't.
export function lowerCaseHeaders(headers: unknown): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  if (typeof headers !== "object" || headers === null) return result;

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result[key.toLowerCase()] = value;
    } else if (typeof value === "number") {
      result[key.toLowerCase()] = String(value);
    }
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstGraphqlError(errors: unknown): { message?: string; type?: string } {
  if (!Array.isArray(errors) || errors.length === 0) return {};

  const [first] = errors;
  if (!isRecord(first)) return {};

  return {
    message: typeof first.message === "string" ? first.message : undefined,
    type: typeof first.type === "string" ? first.type : undefined,
  };
}

// Normalizes both failure shapes this transport can throw into the single
// NormalizedFailure rate-limit.ts classifies:
//  - @octokit/request-error's RequestError (REST): `status` + `response.headers`.
//  - @octokit/graphql's GraphqlResponseError (HTTP 200 + `errors[]`).
export function normalizeFailure(error: unknown): NormalizedFailure {
  if (!isRecord(error)) {
    return { source: "network", message: String(error) };
  }

  if (Array.isArray(error.errors) && error.errors.length > 0) {
    const first = firstGraphqlError(error.errors);
    return {
      source: "graphql",
      headers: lowerCaseHeaders(error.headers),
      message: first.message,
      graphqlErrorCode: first.type,
    };
  }

  if (typeof error.status === "number") {
    const response = isRecord(error.response) ? error.response : undefined;
    return {
      source: "http",
      status: error.status,
      headers: lowerCaseHeaders(response?.headers),
      message: typeof error.message === "string" ? error.message : undefined,
    };
  }

  return {
    source: "network",
    message: typeof error.message === "string" ? error.message : String(error),
  };
}

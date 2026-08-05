// Startup auth/scope precheck (spec: "Startup auth/scope precheck").
// Explicit, awaited call — never inside a constructor (design decision #8):
// constructors that do I/O are untestable and hide the network.
import { z } from "zod";
import type { ClientContext } from "./context.js";
import { GithubClientError, type GithubClientIssue } from "./errors.js";
import type { NormalizedFailure } from "./rate-limit.js";

const REQUIRED_SCOPES = ["repo", "project"] as const;

// GET /user's body carries nothing assertAuth needs — only the
// X-OAuth-Scopes response header matters, so there's no schemas.ts entry
// for it and the body is intentionally left unvalidated.
const userResponseSchema = z.unknown();

function missingScopesIssue(missing: readonly string[]): GithubClientIssue {
  return {
    code: "insufficient-scopes",
    operation: "assertAuth",
    message: `Token is missing required scope(s): ${missing.join(", ")}`,
    suggestion: `Regenerate a classic PAT with the "${missing.join('" and "')}" scope(s) at https://github.com/settings/tokens, then re-run.`,
  };
}

function classicPatRequiredIssue(): GithubClientIssue {
  return {
    code: "insufficient-scopes",
    operation: "assertAuth",
    message:
      "GET /user returned no X-OAuth-Scopes header. Fine-grained PATs and GitHub App tokens do not expose scopes this way.",
    suggestion:
      'This project requires a classic PAT with "repo" and "project" scopes for v1; generate one at https://github.com/settings/tokens.',
  };
}

function authFailedIssue(status: number | undefined): GithubClientIssue {
  return {
    code: "auth-failed",
    operation: "assertAuth",
    status,
    message: "GET /user was rejected — the token is invalid, expired, or revoked.",
    suggestion: 'Generate a new classic PAT with the "repo" and "project" scopes.',
  };
}

function parseScopes(header: string): readonly string[] {
  return header
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

// queue.ts rethrows "fatal" classifications unwrapped (PR1 decision), so a
// 401 from GET /user arrives here as the raw NormalizedFailure, not a
// GithubClientError. Local, duck-typed re-implementation of queue.ts's
// guard (not exported from there) to avoid reopening a merged PR1 file.
function isNormalizedFailure(value: unknown): value is NormalizedFailure {
  return typeof value === "object" && value !== null && "source" in value;
}

export async function assertAuth(ctx: ClientContext): Promise<void> {
  let result;

  try {
    result = await ctx.rest("assertAuth", (octokit) => octokit.request("GET /user"), userResponseSchema);
  } catch (error) {
    if (isNormalizedFailure(error) && error.status === 401) {
      throw new GithubClientError([authFailedIssue(error.status)]);
    }
    throw error;
  }

  const scopesHeader = result.headers["x-oauth-scopes"];
  if (scopesHeader === undefined) {
    throw new GithubClientError([classicPatRequiredIssue()]);
  }

  const scopes = parseScopes(scopesHeader);
  const missing = REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));

  if (missing.length > 0) {
    throw new GithubClientError([missingScopesIssue(missing)]);
  }
}

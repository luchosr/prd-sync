import { describe, expect, it } from "vitest";
import { classify, type NormalizedFailure } from "./rate-limit.js";

const NOW = 1_700_000_000_000; // fixed instant for deterministic reset-window math

function failure(overrides: Partial<NormalizedFailure> = {}): NormalizedFailure {
  return { source: "http", status: 500, ...overrides };
}

const resetHeaders = (secondsFromNow: number) => ({
  "x-ratelimit-remaining": "0",
  "x-ratelimit-reset": String(NOW / 1000 + secondsFromNow),
});

describe("classify", () => {
  it.each<{ name: string; failure: NormalizedFailure; expected: { kind: string; delayMs?: number } }>([
    { name: "429 without retry-after retries at the default delay", failure: failure({ status: 429 }), expected: { kind: "retry", delayMs: 1000 } },
    { name: "429 with retry-after honors the header in ms", failure: failure({ status: 429, headers: { "retry-after": "5" } }), expected: { kind: "retry", delayMs: 5000 } },
    { name: "403 with retry-after retries for at least that many seconds", failure: failure({ status: 403, headers: { "retry-after": "30" } }), expected: { kind: "retry", delayMs: 30_000 } },
    { name: "403 with x-ratelimit-remaining: 0 waits until x-ratelimit-reset", failure: failure({ status: 403, headers: resetHeaders(10) }), expected: { kind: "retry", delayMs: 10_000 } },
    { name: "403 with x-ratelimit-remaining: 0 caps the wait at 60s even if reset is far away", failure: failure({ status: 403, headers: resetHeaders(3600) }), expected: { kind: "retry", delayMs: 60_000 } },
    { name: "403 matching secondary rate limit text backs off", failure: failure({ status: 403, message: "You have exceeded a secondary rate limit" }), expected: { kind: "retry", delayMs: 1000 } },
    { name: "403 matching abuse detection text backs off", failure: failure({ status: 403, message: "You have triggered an abuse detection mechanism" }), expected: { kind: "retry", delayMs: 1000 } },
    { name: "plain permission 403 fails fast", failure: failure({ status: 403, message: "Resource not accessible by integration" }), expected: { kind: "permission" } },
    { name: "403 with no message and no signal fails fast", failure: failure({ status: 403 }), expected: { kind: "permission" } },
    { name: "500 backs off", failure: failure({ status: 500 }), expected: { kind: "retry", delayMs: 1000 } },
    { name: "502 backs off", failure: failure({ status: 502 }), expected: { kind: "retry", delayMs: 1000 } },
    { name: "network failure with no status backs off", failure: failure({ source: "network", status: undefined }), expected: { kind: "retry", delayMs: 1000 } },
    { name: "401 is fatal", failure: failure({ status: 401 }), expected: { kind: "fatal" } },
    { name: "404 is fatal", failure: failure({ status: 404 }), expected: { kind: "fatal" } },
    { name: "422 is fatal", failure: failure({ status: 422 }), expected: { kind: "fatal" } },
    { name: "GraphQL RATE_LIMITED retries", failure: failure({ source: "graphql", status: 200, graphqlErrorCode: "RATE_LIMITED" }), expected: { kind: "retry", delayMs: 1000 } },
    { name: "GraphQL FORBIDDEN fails fast as permission", failure: failure({ source: "graphql", status: 200, graphqlErrorCode: "FORBIDDEN" }), expected: { kind: "permission" } },
    { name: "GraphQL INSUFFICIENT_SCOPES fails fast as permission", failure: failure({ source: "graphql", status: 200, graphqlErrorCode: "INSUFFICIENT_SCOPES" }), expected: { kind: "permission" } },
    { name: "GraphQL unrecognised error code is fatal", failure: failure({ source: "graphql", status: 200, graphqlErrorCode: "SOMETHING_ELSE" }), expected: { kind: "fatal" } },
  ])("$name", ({ failure: input, expected }) => {
    const result = classify(input, NOW);

    expect(result.kind).toBe(expected.kind);
    if (expected.delayMs !== undefined) {
      expect(result.delayMs).toBe(expected.delayMs);
    }
  });

  it("prefers retry-after over x-ratelimit-remaining when both are present on a 403", () => {
    const result = classify(failure({ status: 403, headers: { "retry-after": "12", ...resetHeaders(999) } }), NOW);

    expect(result).toEqual({ kind: "retry", delayMs: 12_000 });
  });
});

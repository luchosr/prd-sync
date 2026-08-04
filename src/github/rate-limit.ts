// Pure 403-disambiguation predicate (design decision #5). No I/O: takes a
// normalized failure (built by transport.ts's normalizeFailure(), PR2) and
// says whether the queue should retry, fail fast on permissions, or give up.

export interface NormalizedFailure {
  readonly source: "http" | "graphql" | "network";
  readonly status?: number;
  // Lower-cased header map, as produced by transport.ts.
  readonly headers?: Readonly<Record<string, string>>;
  readonly message?: string;
  // Set only for GraphQL failures (HTTP 200 + errors[]), e.g. "RATE_LIMITED".
  readonly graphqlErrorCode?: string;
}

export interface RateLimitClassification {
  readonly kind: "retry" | "permission" | "fatal";
  readonly delayMs: number;
}

const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_RESET_WAIT_MS = 60_000;
const SECONDARY_LIMIT_PATTERN = /secondary rate limit|abuse detection/i;

const PERMISSION: RateLimitClassification = { kind: "permission", delayMs: 0 };
const FATAL: RateLimitClassification = { kind: "fatal", delayMs: 0 };

function retry(delayMs: number): RateLimitClassification {
  return { kind: "retry", delayMs };
}

function retryAfterMs(headers: Readonly<Record<string, string>> | undefined): number | undefined {
  const raw = headers?.["retry-after"];
  if (raw === undefined) return undefined;

  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

// GIVEN x-ratelimit-remaining: 0, wait until x-ratelimit-reset (a Unix
// epoch in seconds), capped so a distant reset never stalls the queue.
function resetWaitMs(headers: Readonly<Record<string, string>> | undefined, nowMs: number): number | undefined {
  if (headers?.["x-ratelimit-remaining"] !== "0") return undefined;

  const resetRaw = headers["x-ratelimit-reset"];
  const resetEpochSeconds = resetRaw === undefined ? undefined : Number(resetRaw);
  if (resetEpochSeconds === undefined || !Number.isFinite(resetEpochSeconds)) {
    return DEFAULT_RETRY_DELAY_MS;
  }

  const wait = resetEpochSeconds * 1000 - nowMs;
  return Math.min(Math.max(wait, 0), MAX_RESET_WAIT_MS);
}

function classify403(failure: NormalizedFailure, nowMs: number): RateLimitClassification {
  const afterHeader = retryAfterMs(failure.headers);
  if (afterHeader !== undefined) return retry(afterHeader);

  const resetWait = resetWaitMs(failure.headers, nowMs);
  if (resetWait !== undefined) return retry(resetWait);

  if (failure.message !== undefined && SECONDARY_LIMIT_PATTERN.test(failure.message)) {
    return retry(DEFAULT_RETRY_DELAY_MS);
  }

  return PERMISSION;
}

function classifyGraphqlErrorCode(code: string): RateLimitClassification {
  if (code === "RATE_LIMITED") return retry(DEFAULT_RETRY_DELAY_MS);
  if (code === "FORBIDDEN" || code === "INSUFFICIENT_SCOPES") return PERMISSION;
  return FATAL;
}

export function classify(failure: NormalizedFailure, nowMs: number = Date.now()): RateLimitClassification {
  if (failure.status === 429) {
    return retry(retryAfterMs(failure.headers) ?? DEFAULT_RETRY_DELAY_MS);
  }

  if (failure.status === 403) {
    return classify403(failure, nowMs);
  }

  if (failure.source === "network" || (failure.status !== undefined && failure.status >= 500)) {
    return retry(DEFAULT_RETRY_DELAY_MS);
  }

  if (failure.status === 401 || failure.status === 404 || failure.status === 422) {
    return FATAL;
  }

  if (failure.graphqlErrorCode !== undefined) {
    return classifyGraphqlErrorCode(failure.graphqlErrorCode);
  }

  return FATAL;
}

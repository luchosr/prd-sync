import { GithubClientError, type GithubClientIssue } from "./errors.js";
import { classify, type NormalizedFailure } from "./rate-limit.js";

export interface CreateQueueOptions {
  // Minimum spacing between the previous op's completion and the next
  // attempt's start (design decision #3). Default 500ms.
  readonly throttleMs?: number;
  readonly maxRetries?: number;
  // Base for the exponential backoff sequence (baseBackoffMs * 2^n).
  readonly baseBackoffMs?: number;
  // Injected clock, default Date.now — never wall-clock in tests.
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

export interface Queue {
  enqueue<T>(operation: string, fn: () => Promise<T>): Promise<T>;
}

const DEFAULT_THROTTLE_MS = 500;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_BACKOFF_MS = 1000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isNormalizedFailure(value: unknown): value is NormalizedFailure {
  return typeof value === "object" && value !== null && "source" in value;
}

function permissionIssue(operation: string, failure: NormalizedFailure): GithubClientIssue {
  return {
    code: "insufficient-permissions",
    operation,
    status: failure.status,
    message: `${operation} was denied with a permission-level 403 (no retry-after or secondary-limit signal present)`,
    suggestion: "Verify the token has the required scopes and repository access; this is not a rate limit.",
  };
}

function exhaustedIssue(operation: string, maxRetries: number): GithubClientIssue {
  return {
    code: "rate-limit-exhausted",
    operation,
    message: `${operation} did not succeed after ${maxRetries} ${maxRetries === 1 ? "retry" : "retries"}`,
    suggestion: "Increase maxRetries or throttleMs, or retry later once GitHub's rate limit window resets.",
  };
}

export function createQueue(options: CreateQueueOptions = {}): Queue {
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  let tail: Promise<unknown> = Promise.resolve();
  let lastCompletionAt: number | null = null;

  // 403 disambiguation lives in rate-limit.ts; this loop only owns retry
  // mechanics (count, backoff, and the two universally-correct outcomes:
  // exhaustion and permission fail-fast). "fatal" is rethrown unwrapped so
  // operation-specific callers (e.g. issues.ts's idempotent 422) can still
  // inspect the original status.
  async function runWithRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let attempt = 0;

    for (;;) {
      try {
        return await fn();
      } catch (error) {
        if (!isNormalizedFailure(error)) {
          throw error;
        }

        const classification = classify(error, now());

        if (classification.kind === "fatal") {
          throw error;
        }

        if (classification.kind === "permission") {
          throw new GithubClientError([permissionIssue(operation, error)]);
        }

        attempt += 1;
        if (attempt > maxRetries) {
          throw new GithubClientError([exhaustedIssue(operation, maxRetries)]);
        }

        const exponentialDelay = baseBackoffMs * 2 ** (attempt - 1);
        await sleep(Math.max(exponentialDelay, classification.delayMs));
      }
    }
  }

  function enqueue<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const result = tail.then(async () => {
      if (lastCompletionAt !== null) {
        const wait = throttleMs - (now() - lastCompletionAt);
        if (wait > 0) {
          await sleep(wait);
        }
      }

      try {
        return await runWithRetry(operation, fn);
      } finally {
        lastCompletionAt = now();
      }
    });

    // Keep the chain alive on rejection so later-enqueued ops still run.
    tail = result.catch(() => undefined);

    return result;
  }

  return { enqueue };
}

import { describe, expect, it, vi } from "vitest";
import { GithubClientError } from "./errors.js";
import { createQueue } from "./queue.js";
import type { NormalizedFailure } from "./rate-limit.js";

function retryableFailure(overrides: Partial<NormalizedFailure> = {}): NormalizedFailure {
  return { source: "http", status: 500, ...overrides };
}

function recorderSleep() {
  const delays: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
  };
  return { delays, sleep };
}

describe("createQueue", () => {
  it("runs enqueued operations in FIFO order even when earlier ones resolve slower", async () => {
    const { sleep } = recorderSleep();
    const queue = createQueue({ throttleMs: 0, sleep, now: () => 0 });
    const order: string[] = [];

    const first = queue.enqueue("op-a", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("a");
    });
    const second = queue.enqueue("op-b", async () => {
      order.push("b");
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["a", "b"]);
  });

  it("throttles from the previous completion, skipping the wait once enough time elapsed", async () => {
    const { delays, sleep } = recorderSleep();
    let now = 0;
    const queue = createQueue({ throttleMs: 500, sleep, now: () => now });

    await queue.enqueue("op-a", async () => "a");
    now += 100; // only 100ms elapsed — waits the remainder of the 500ms window
    await queue.enqueue("op-b", async () => "b");
    now += 600; // more than the window already elapsed — no extra wait
    await queue.enqueue("op-c", async () => "c");

    expect(delays).toEqual([400]);
  });

  it("records an exponentially growing backoff delay array before succeeding", async () => {
    const { delays, sleep } = recorderSleep();
    const queue = createQueue({ throttleMs: 0, maxRetries: 5, baseBackoffMs: 1000, sleep, now: () => 0 });
    let attempts = 0;

    const result = await queue.enqueue("createIssue", async () => {
      attempts += 1;
      if (attempts <= 2) throw retryableFailure();
      return "ok";
    });

    expect(result).toBe("ok");
    expect(delays).toEqual([1000, 2000]);
  });

  it("honors an authoritative delay from classify() as a floor over the exponential backoff", async () => {
    const { delays, sleep } = recorderSleep();
    const queue = createQueue({ throttleMs: 0, maxRetries: 3, baseBackoffMs: 1000, sleep, now: () => 0 });
    let attempts = 0;

    await queue.enqueue("linkSubIssue", async () => {
      attempts += 1;
      if (attempts === 1) throw retryableFailure({ status: 403, headers: { "retry-after": "5" } });
    });

    expect(delays).toEqual([5000]);
  });

  it("throws rate-limit-exhausted after maxRetries", async () => {
    const { sleep } = recorderSleep();
    const queue = createQueue({ throttleMs: 0, maxRetries: 2, baseBackoffMs: 1, sleep, now: () => 0 });

    await expect(
      queue.enqueue("createIssue", async () => {
        throw retryableFailure();
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof GithubClientError)) return false;
      expect(error.issues[0]?.code).toBe("rate-limit-exhausted");
      expect(error.operation).toBe("createIssue");
      return true;
    });
  });

  it("fails fast on a permission 403 with insufficient-permissions, without retrying", async () => {
    const { delays, sleep } = recorderSleep();
    const queue = createQueue({ throttleMs: 0, maxRetries: 5, sleep, now: () => 0 });
    let attempts = 0;

    await expect(
      queue.enqueue("createIssue", async () => {
        attempts += 1;
        throw { source: "http", status: 403, message: "Resource not accessible by integration" };
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof GithubClientError)) return false;
      expect(error.issues[0]?.code).toBe("insufficient-permissions");
      return true;
    });

    expect(attempts).toBe(1);
    expect(delays).toEqual([]);
  });

  it("passes fatal and non-NormalizedFailure rejections through unwrapped", async () => {
    const { sleep } = recorderSleep();
    const queue = createQueue({ throttleMs: 0, sleep, now: () => 0 });
    const fatal: NormalizedFailure = { source: "http", status: 422, message: "Validation failed" };
    const plain = new Error("boom");

    await expect(
      queue.enqueue("linkSubIssue", async () => {
        throw fatal;
      }),
    ).rejects.toBe(fatal);

    await expect(
      queue.enqueue("createIssue", async () => {
        throw plain;
      }),
    ).rejects.toBe(plain);
  });

  it("uses a real timer as the default sleep implementation", async () => {
    vi.useFakeTimers();
    const promise = createQueue({ throttleMs: 0 }).enqueue("createIssue", async () => "ok");
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    vi.useRealTimers();
  });
});

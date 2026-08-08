// design §6. Builds the key -> issue index from SyncedIssue[] by reading
// each issue's body through parseMarker(). No error on an unparseable or
// missing marker — the issue is simply excluded from byKey.
import { describe, expect, it } from "vitest";
import type { SyncedIssue } from "../github/index.js";
import { formatMarker } from "./marker.js";
import { indexByKey } from "./index-issues.js";
import { SyncPlanError } from "./errors.js";

function issue(overrides: Partial<SyncedIssue> = {}): SyncedIssue {
  return {
    number: 1,
    id: 1001,
    nodeId: "node-1",
    title: "Some issue",
    state: "open",
    labels: ["prd-sync"],
    body: null,
    ...overrides,
  };
}

function markeredIssue(key: string, hash: string, overrides: Partial<SyncedIssue> = {}): SyncedIssue {
  return issue({ body: `Body.\n\n${formatMarker({ key, hash })}\n`, ...overrides });
}

const HASH = "3f9a1c0b7e2d4a58";

describe("indexByKey — happy path", () => {
  it("indexes a markered issue by its marker key", () => {
    const target = markeredIssue("US-01", HASH, { number: 42 });

    const index = indexByKey([target]);

    expect(index.byKey.get("US-01")).toEqual({ issue: target, marker: { key: "US-01", hash: HASH } });
  });

  it("returns an empty index for an empty issue list", () => {
    const index = indexByKey([]);

    expect(index.byKey.size).toBe(0);
    expect(index.unmanaged).toEqual([]);
    expect(index.duplicates).toEqual([]);
  });
});

describe("indexByKey — unmanaged issues", () => {
  it("routes an issue with no parsable marker to `unmanaged`, never into byKey", () => {
    const noMarker = issue({ number: 7, body: "Just a plain body, hand-labelled by a human." });

    const index = indexByKey([noMarker]);

    expect(index.byKey.size).toBe(0);
    expect(index.unmanaged).toEqual([noMarker]);
  });

  it("treats a null body as unmanaged, not as an error", () => {
    const emptyBody = issue({ number: 8, body: null });

    const index = indexByKey([emptyBody]);

    expect(index.unmanaged).toEqual([emptyBody]);
  });
});

describe("indexByKey — duplicate marker keys", () => {
  it("keeps the lowest issue number and reports the other as a duplicate", () => {
    const higher = markeredIssue("US-03", HASH, { number: 55 });
    const lower = markeredIssue("US-03", HASH, { number: 12 });

    const index = indexByKey([higher, lower]);

    expect(index.byKey.get("US-03")?.issue.number).toBe(12);
    expect(index.duplicates).toEqual([higher]);
  });

  it("is order-independent: the lowest number always wins regardless of list order", () => {
    const lower = markeredIssue("US-03", HASH, { number: 12 });
    const higher = markeredIssue("US-03", HASH, { number: 55 });

    const index = indexByKey([lower, higher]);

    expect(index.byKey.get("US-03")?.issue.number).toBe(12);
    expect(index.duplicates).toEqual([higher]);
  });
});

describe("indexByKey — fail-closed guard (design §6, A12)", () => {
  it("throws SyncPlanError when every listed issue has body === undefined", () => {
    const undefinedBody = { ...issue({ number: 1 }) };
    delete (undefinedBody as { body?: string | null }).body;

    expect(() => indexByKey([undefinedBody])).toThrow(SyncPlanError);
    try {
      indexByKey([undefinedBody]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SyncPlanError);
      expect((error as SyncPlanError).code).toBe("missing-issue-bodies");
    }
  });

  it("does not trigger the guard for a genuinely empty body (null, not undefined)", () => {
    const nullBody = issue({ number: 1, body: null });

    expect(() => indexByKey([nullBody])).not.toThrow();
  });

  it("does not trigger the guard when at least one issue has a body", () => {
    const undefinedBody = { ...issue({ number: 1 }) };
    delete (undefinedBody as { body?: string | null }).body;
    const withBody = markeredIssue("US-01", HASH, { number: 2 });

    expect(() => indexByKey([undefinedBody, withBody])).not.toThrow();
  });

  it("does not trigger the guard for an empty issue list", () => {
    expect(() => indexByKey([])).not.toThrow();
  });
});

// design §7. buildPlan is PURE — no I/O, no clock. Covers: create/update/
// noop classification, epic-before-story ordering, the plan-level double-run
// zero-mutation invariant (US-06 AC1), title-change -> update-not-duplicate
// (L7), orphan detection + orphan-label idempotence (L8-plan), and
// duplicate/unmanaged warnings.
import { describe, expect, it } from "vitest";
import type { Epic, Prd, UserStory } from "../domain/types.js";
import type { SyncedIssue } from "../github/index.js";
import { appendMarker, parseMarker } from "./marker.js";
import { buildPlan } from "./plan.js";
import { contentHash } from "./hash.js";
import type { Plan, PlanOperation } from "./types.js";

const SYNC_LABEL = "prd-sync";
const ORPHAN_LABEL = "prd-sync:orphan";

function epic(overrides: Partial<Epic> = {}): Epic {
  return { key: "E1", title: "Parser", body: "Handles PRD markdown parsing.", ...overrides };
}

function story(overrides: Partial<UserStory> = {}): UserStory {
  return {
    key: "US-01",
    title: "As a developer, I want to parse a PRD",
    epicKey: "E1",
    body: "Given a PRD file, when parsed, then a Prd object is returned.",
    tasks: [],
    ...overrides,
  };
}

function prd(overrides: Partial<Prd> = {}): Prd {
  return { title: "prd-sync", sourcePath: "docs/prd/PRD-prd-sync.md", epics: [], stories: [], ...overrides };
}

let nextIssueNumber = 100;

function syncedIssue(overrides: Partial<SyncedIssue> = {}): SyncedIssue {
  nextIssueNumber += 1;
  return {
    number: nextIssueNumber,
    id: nextIssueNumber,
    nodeId: `node-${nextIssueNumber}`,
    title: "placeholder",
    state: "open",
    labels: [SYNC_LABEL],
    body: null,
    ...overrides,
  };
}

// Runs a real create-plan and turns each `create` operation into the
// SyncedIssue[] GitHub would report back on the next list call — the exact
// title/body/labels the create operation would have sent. This is what lets
// the double-run test close the loop through the real `buildPlan` on both
// sides, at the plan level (apply()/sync() land in PR3).
function applyCreatesToSyncedIssues(plan: Plan): SyncedIssue[] {
  return plan.operations
    .filter((op): op is Extract<PlanOperation, { kind: "create" }> => op.kind === "create")
    .map((op) =>
      syncedIssue({
        title: op.title,
        body: op.bodyWithMarker,
        labels: [...op.desired.labels],
      }),
    );
}

function opFor(plan: Plan, key: string): PlanOperation | undefined {
  return plan.operations.find((op) => op.key === key);
}

describe("buildPlan — create (no existing issues)", () => {
  it("plans a create for every epic and every story", () => {
    const plan = buildPlan(
      [prd({ epics: [epic()], stories: [story()] })],
      [],
      { syncLabel: SYNC_LABEL },
    );

    expect(plan.operations.map((op) => ({ kind: op.kind, key: op.key }))).toEqual([
      { kind: "create", key: "E1" },
      { kind: "create", key: "US-01" },
    ]);
  });

  it("orders every epic operation before every story operation", () => {
    const plan = buildPlan(
      [
        prd({
          epics: [epic({ key: "E1" }), epic({ key: "E2" })],
          stories: [story({ key: "US-01", epicKey: "E1" }), story({ key: "US-02", epicKey: "E2" })],
        }),
      ],
      [],
      { syncLabel: SYNC_LABEL },
    );

    expect(plan.operations.map((op) => op.key)).toEqual(["E1", "E2", "US-01", "US-02"]);
  });

  it("a create's bodyWithMarker carries a marker whose hash matches contentHash(desired)", () => {
    const plan = buildPlan([prd({ stories: [story()] })], [], { syncLabel: SYNC_LABEL });
    const op = opFor(plan, "US-01");
    if (op?.kind !== "create") throw new Error("expected a create operation");

    const marker = parseMarker(op.bodyWithMarker);
    expect(marker).toEqual({ key: "US-01", hash: contentHash(op.desired) });
  });

  it("a create's labels are exactly the sync label when there is no existing issue", () => {
    const plan = buildPlan([prd({ stories: [story()] })], [], { syncLabel: SYNC_LABEL });
    const op = opFor(plan, "US-01");
    if (op?.kind !== "create") throw new Error("expected a create operation");

    expect(op.desired.labels).toEqual(["prd-sync"]);
  });
});

describe("buildPlan — the double-run zero-mutation invariant (US-06 AC1)", () => {
  it("plans zero non-noop operations on a second run against an unchanged PRD", () => {
    const prds = [prd({ epics: [epic()], stories: [story()] })];

    const firstPlan = buildPlan(prds, [], { syncLabel: SYNC_LABEL });
    const issuesAfterFirstApply = applyCreatesToSyncedIssues(firstPlan);

    const secondPlan = buildPlan(prds, issuesAfterFirstApply, { syncLabel: SYNC_LABEL });

    expect(secondPlan.operations.every((op) => op.kind === "noop")).toBe(true);
    expect(secondPlan.operations).toHaveLength(2);
  });
});

describe("buildPlan — title change triggers update, not duplicate (US-06 AC2 / L7)", () => {
  it("plans exactly one update for the changed key, no create for the same key", () => {
    const original = [prd({ stories: [story({ title: "Original title" })] })];
    const firstPlan = buildPlan(original, [], { syncLabel: SYNC_LABEL });
    const issuesAfterFirstApply = applyCreatesToSyncedIssues(firstPlan);

    const changed = [prd({ stories: [story({ title: "Changed title" })] })];
    const secondPlan = buildPlan(changed, issuesAfterFirstApply, { syncLabel: SYNC_LABEL });

    expect(secondPlan.operations).toHaveLength(1);
    const op = secondPlan.operations[0];
    expect(op?.kind).toBe("update");
    expect(op?.key).toBe("US-01");
    if (op?.kind === "update") {
      expect(op.target.number).toBe(issuesAfterFirstApply[0]?.number);
      expect(op.reason).toBe("content-changed");
    }
  });
});

describe("buildPlan — orphan detection (US-08 / L8-plan)", () => {
  it("plans an orphan for a synced issue absent from the PRD, without the orphan label", () => {
    const existing = syncedIssue({
      body: appendMarker("Old body.", { key: "US-09", hash: "0000000000000000" }),
      labels: [SYNC_LABEL],
    });

    const plan = buildPlan([prd()], [existing], { syncLabel: SYNC_LABEL });

    expect(plan.operations).toHaveLength(1);
    const op = plan.operations[0];
    expect(op?.kind).toBe("orphan");
    if (op?.kind === "orphan") {
      expect(op.labels).toEqual(["prd-sync", "prd-sync:orphan"].sort());
    }
  });

  it("preserves a human label on the orphaned issue's label set", () => {
    const existing = syncedIssue({
      body: appendMarker("Old body.", { key: "US-09", hash: "0000000000000000" }),
      labels: [SYNC_LABEL, "needs-triage"],
    });

    const plan = buildPlan([prd()], [existing], { syncLabel: SYNC_LABEL });
    const op = plan.operations[0];

    if (op?.kind === "orphan") {
      expect(op.labels).toEqual(["needs-triage", "prd-sync", "prd-sync:orphan"]);
    } else {
      throw new Error("expected an orphan operation");
    }
  });

  it("is idempotent: an already-orphaned issue still absent from the PRD plans a noop, not another orphan", () => {
    const existing = syncedIssue({
      body: appendMarker("Old body.", { key: "US-09", hash: "0000000000000000" }),
      labels: [SYNC_LABEL, ORPHAN_LABEL],
    });

    const plan = buildPlan([prd()], [existing], { syncLabel: SYNC_LABEL });

    expect(plan.operations).toHaveLength(1);
    const op = plan.operations[0];
    expect(op?.kind).toBe("noop");
    if (op?.kind === "noop") expect(op.reason).toBe("already-orphaned");
  });

  it("un-orphans automatically: a key that reappears in the PRD is planned as update/create, not orphan", () => {
    const existing = syncedIssue({
      body: appendMarker("Old body.", { key: "US-01", hash: "0000000000000000" }),
      labels: [SYNC_LABEL, ORPHAN_LABEL],
    });

    const plan = buildPlan([prd({ stories: [story({ key: "US-01" })] })], [existing], { syncLabel: SYNC_LABEL });

    expect(plan.operations).toHaveLength(1);
    expect(plan.operations[0]?.kind).toBe("update");
  });
});

describe("buildPlan — warnings", () => {
  it("reports an unmanaged issue (sync label, no parsable marker) as a warning, never as an operation", () => {
    const unmanaged = syncedIssue({ number: 7, body: "A human applied the label by hand." });

    const plan = buildPlan([prd()], [unmanaged], { syncLabel: SYNC_LABEL });

    expect(plan.operations).toHaveLength(0);
    expect(plan.warnings).toEqual([
      { code: "unmanaged-issue", number: 7, title: "placeholder", message: expect.any(String) as unknown as string },
    ]);
  });

  it("reports a duplicate marker key as a warning naming both the kept and the discarded issue", () => {
    const kept = syncedIssue({ number: 12, body: appendMarker("Body.", { key: "US-03", hash: "1111111111111111" }) });
    const discarded = syncedIssue({
      number: 55,
      body: appendMarker("Body.", { key: "US-03", hash: "1111111111111111" }),
    });

    const plan = buildPlan([prd()], [kept, discarded], { syncLabel: SYNC_LABEL });

    expect(plan.warnings).toContainEqual({
      code: "duplicate-key",
      key: "US-03",
      number: 55,
      keptNumber: 12,
      message: expect.any(String) as unknown as string,
    });
  });
});

describe("buildPlan — plan carries the project option through unchanged", () => {
  it("passes the project option through to the returned Plan", () => {
    const plan = buildPlan([prd()], [], { syncLabel: SYNC_LABEL, project: { owner: "acme", number: 3 } });

    expect(plan.project).toEqual({ owner: "acme", number: 3 });
  });
});

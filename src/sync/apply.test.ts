// design §8: apply()'s sequencing, continue-on-error, full-label-set, and
// skip logic. Uses a real ClientContext (createClient) against the
// msw-backed fake in test-support.ts — never a hand-written simulator of
// what apply() itself does, so a bug in the sequencing logic cannot also be
// baked into the test's expectations.
import { http } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "../github/index.js";
import { apply } from "./apply.js";
import { createSyncFakeGithub, graphqlOperation, HttpResponse, type SyncFakeGithub, type StoredIssue } from "./test-support.js";
import type { DesiredIssue, IssueTarget, Plan, PlanOperation } from "./types.js";

const REPO = { owner: "acme", repo: "widgets" };
const SYNC_LABEL = "prd-sync";

let fake: SyncFakeGithub;

beforeAll(() => {
  fake = createSyncFakeGithub();
  fake.server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  fake.server.resetHandlers();
  fake.store.clear();
  fake.resetRequests();
});
afterAll(() => fake.server.close());

function ctx() {
  return createClient({ auth: "token", repo: REPO });
}

function desired(overrides: Partial<DesiredIssue> = {}): DesiredIssue {
  return {
    kind: "story",
    key: "US-01",
    parentKey: "E1",
    title: "US-01: A story",
    body: "Body.",
    tasks: [],
    labels: [SYNC_LABEL],
    ...overrides,
  };
}

function target(number: number): IssueTarget {
  return { number, id: number, nodeId: `NODE_${number}` };
}

function createOp(overrides: Partial<Extract<PlanOperation, { kind: "create" }>> = {}): PlanOperation {
  const key = overrides.key ?? "US-01";
  return {
    kind: "create",
    itemKind: "story",
    key,
    title: `${key} title`,
    desired: desired({ key }),
    bodyWithMarker: "Body.\n\n<!-- marker -->",
    parentKey: null,
    ...overrides,
  };
}

function updateOp(overrides: Partial<Extract<PlanOperation, { kind: "update" }>> = {}): PlanOperation {
  const key = overrides.key ?? "US-01";
  return {
    kind: "update",
    itemKind: "story",
    key,
    title: `${key} title`,
    target: target(1),
    desired: desired({ key }),
    bodyWithMarker: "Body.\n\n<!-- marker -->",
    parentKey: null,
    reason: "content-changed",
    ...overrides,
  };
}

function orphanOp(overrides: Partial<Extract<PlanOperation, { kind: "orphan" }>> = {}): PlanOperation {
  const key = overrides.key ?? "US-09";
  return {
    kind: "orphan",
    itemKind: "story",
    key,
    title: `${key} title`,
    target: target(1),
    labels: [SYNC_LABEL, "prd-sync:orphan"],
    ...overrides,
  };
}

function noopOp(overrides: Partial<Extract<PlanOperation, { kind: "noop" }>> = {}): PlanOperation {
  return { kind: "noop", itemKind: "story", key: "US-01", title: "US-01 title", reason: "unchanged", ...overrides };
}

function plan(operations: readonly PlanOperation[]): Plan {
  return { operations, warnings: [] };
}

function seedStore(issue: Partial<StoredIssue> & { number: number }): void {
  fake.store.set(issue.number, {
    id: issue.number,
    nodeId: `NODE_${issue.number}`,
    title: "Old title",
    body: "Old body",
    labels: [SYNC_LABEL],
    state: "open",
    ...issue,
  });
}

describe("apply — epic-before-story ordering and linking", () => {
  it("creates the epic before the story, then links the story as the epic's sub-issue", async () => {
    const epic = createOp({ kind: "create", itemKind: "epic", key: "E1", parentKey: null });
    const story = createOp({ kind: "create", itemKind: "story", key: "US-01", parentKey: "E1" });

    const result = await apply(plan([epic, story]), ctx(), { syncLabel: SYNC_LABEL });

    expect(result.created.map((item) => item.key)).toEqual(["E1", "US-01"]);
    const linkRequests = fake.requests.filter((r) => r.url.includes("/sub_issues"));
    expect(linkRequests).toHaveLength(1);
    expect(linkRequests[0]?.url).toContain(`/issues/${result.created[0]?.number}/sub_issues`);
    expect(result.ok).toBe(true);
  });
});

describe("apply — continue-on-error (D7)", () => {
  it("keeps applying remaining operations after one update fails, and records the failure", async () => {
    seedStore({ number: 10 });
    seedStore({ number: 12 });
    const ops = [
      updateOp({ key: "US-01", target: target(10) }),
      updateOp({ key: "US-02", target: target(11) }), // 11 was never seeded -> 404 -> schema failure
      updateOp({ key: "US-03", target: target(12) }),
    ];

    const result = await apply(plan(ops), ctx(), { syncLabel: SYNC_LABEL });

    expect(result.updated.map((item) => item.key)).toEqual(["US-01", "US-03"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ key: "US-02", step: "update" });
    expect(result.ok).toBe(false);
  });

  it("skips a story's link step, recording parent-create-failed, when its epic's create fails", async () => {
    // 200 with a body that doesn't match githubIssueSchema -> parseGithubResponse
    // throws immediately. A 4xx/5xx status would instead trigger octokit's
    // retry plugin and just slow the test down without ever failing cleanly.
    // `{ once: true }` so only the epic's create fails; the story's create
    // (also POST /issues) falls through to the default handler.
    fake.server.use(
      http.post("https://api.github.com/repos/:owner/:repo/issues", () => HttpResponse.json({ message: "boom" }), { once: true }),
    );

    const epic = createOp({ kind: "create", itemKind: "epic", key: "E1", parentKey: null });
    const story = createOp({ kind: "create", itemKind: "story", key: "US-01", parentKey: "E1" });

    const result = await apply(plan([epic, story]), ctx(), { syncLabel: SYNC_LABEL });

    expect(result.failures.map((f) => f.key)).toEqual(["E1"]);
    expect(result.created.map((item) => item.key)).toEqual(["US-01"]); // the story is still created; only the link is skipped
    expect(result.skipped).toEqual([{ key: "US-01", step: "link-sub-issue", reason: "parent-create-failed" }]);
  });
});

describe("apply — full label set on every write (D5)", () => {
  it("sends the update's complete desired label set, not a partial patch", async () => {
    seedStore({ number: 10, labels: [SYNC_LABEL, "human-added"] });
    const op = updateOp({
      key: "US-01",
      target: target(10),
      desired: desired({ key: "US-01", labels: [SYNC_LABEL, "human-added"] }),
    });

    await apply(plan([op]), ctx(), { syncLabel: SYNC_LABEL });

    expect(fake.store.get(10)?.labels).toEqual([SYNC_LABEL, "human-added"]);
  });
});

describe("apply — orphan patches labels only (US-08 / L8)", () => {
  it("never changes title, body, or state when orphaning", async () => {
    seedStore({ number: 20, title: "Kept title", body: "Kept body", labels: [SYNC_LABEL], state: "open" });
    const op = orphanOp({ key: "US-09", target: target(20), labels: [SYNC_LABEL, "prd-sync:orphan"] });

    const result = await apply(plan([op]), ctx(), { syncLabel: SYNC_LABEL });

    const stored = fake.store.get(20);
    expect(stored?.title).toBe("Kept title");
    expect(stored?.body).toBe("Kept body");
    expect(stored?.state).toBe("open");
    expect(stored?.labels).toEqual([SYNC_LABEL, "prd-sync:orphan"]);
    expect(result.orphaned).toEqual([{ key: "US-09", itemKind: "story", number: 20, title: "US-09 title" }]);
  });
});

describe("apply — noop emits no requests", () => {
  it("makes zero requests for a noop operation", async () => {
    const result = await apply(plan([noopOp()]), ctx(), { syncLabel: SYNC_LABEL });

    expect(fake.requests).toHaveLength(0);
    expect(result).toEqual({ created: [], updated: [], orphaned: [], skipped: [], failures: [], warnings: [], ok: true });
  });
});

describe("apply — project step (D8: stories only, epics excluded)", () => {
  it("adds a created story's item and sets its Priority/Estimate fields, never for an epic", async () => {
    const addItemCalls: unknown[] = [];
    const setFieldCalls: unknown[] = [];
    fake.server.use(
      graphqlOperation("mutation", "AddProjectV2Item", ({ variables }) => {
        addItemCalls.push(variables);
        return HttpResponse.json({ data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } });
      }),
      graphqlOperation("mutation", "SetProjectV2FieldValue", ({ variables }) => {
        setFieldCalls.push(variables);
        return HttpResponse.json({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_1" } } } });
      }),
    );
    const epic = createOp({ kind: "create", itemKind: "epic", key: "E1", parentKey: null });
    const story = createOp({
      kind: "create",
      itemKind: "story",
      key: "US-01",
      parentKey: "E1",
      desired: desired({ key: "US-01", priority: "P1", estimate: 5 }),
    });

    const result = await apply(plan([epic, story]), ctx(), { syncLabel: SYNC_LABEL, project: { owner: "acme", number: 3 } });

    expect(result.failures).toEqual([]);
    expect(addItemCalls).toHaveLength(1); // the story only — epics never go on the board (D8)
    expect(setFieldCalls).toHaveLength(2); // Priority then Estimate
  });

  it("skips the project step with reason project-unavailable when the project fails to resolve", async () => {
    fake.server.use(
      graphqlOperation("query", "ResolveProjectV2", () => HttpResponse.json({ data: { repositoryOwner: { projectV2: null } } })),
    );
    const story = createOp({ kind: "create", itemKind: "story", key: "US-01", parentKey: null });

    const result = await apply(plan([story]), ctx(), { syncLabel: SYNC_LABEL, project: { owner: "acme", number: 99 } });

    expect(result.failures.map((f) => f.step)).toEqual(["resolve-project"]);
    expect(result.skipped).toEqual([{ key: "US-01", step: "project-item", reason: "project-unavailable" }]);
    expect(result.created.map((item) => item.key)).toEqual(["US-01"]); // the issue itself is still created
  });

  it("writes to a mapped field name when fieldMapping is passed to apply() (E4 additive threading)", async () => {
    const setFieldCalls: { fieldId: unknown }[] = [];
    fake.server.use(
      graphqlOperation("query", "ResolveProjectV2", () =>
        HttpResponse.json({
          data: {
            repositoryOwner: {
              projectV2: {
                id: "PROJECT_1",
                fields: {
                  nodes: [
                    { id: "FIELD_PRIORIDAD", name: "Prioridad", dataType: "SINGLE_SELECT", options: [{ id: "OPT_P1", name: "P1" }] },
                    { id: "FIELD_ESTIMATE", name: "Estimate", dataType: "NUMBER" },
                  ],
                },
              },
            },
          },
        }),
      ),
      graphqlOperation("mutation", "AddProjectV2Item", () => HttpResponse.json({ data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } })),
      graphqlOperation("mutation", "SetProjectV2FieldValue", ({ variables }) => {
        setFieldCalls.push(variables as { fieldId: unknown });
        return HttpResponse.json({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_1" } } } });
      }),
    );
    const story = createOp({
      kind: "create",
      itemKind: "story",
      key: "US-01",
      parentKey: null,
      desired: desired({ key: "US-01", priority: "P1", estimate: 5 }),
    });

    const result = await apply(plan([story]), ctx(), {
      syncLabel: SYNC_LABEL,
      project: { owner: "acme", number: 3 },
      fieldMapping: { priority: "Prioridad" },
    });

    // No unknown-project-field warning: the mapped "Prioridad" name resolved
    // against the schema, proving fieldMapping actually reached
    // projectFieldWrites through apply() -> runProjectStep. The unmapped
    // estimate still resolves against the default "Estimate" field.
    expect(result.warnings).toEqual([]);
    expect(setFieldCalls.map((call) => call.fieldId)).toEqual(["FIELD_PRIORIDAD", "FIELD_ESTIMATE"]);
  });
});

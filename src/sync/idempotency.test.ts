// design §11's L6 (the capstone), L8 (full orphan lifecycle), L9 (dry-run),
// L10 (continue-on-error via sync()). L6 is "the single most valuable test
// in E3": it closes the loop through the REAL parsed PRD fixture and a REAL
// ClientContext against the msw-backed fake store, asserting on the request
// recorder — not just on the plan — so a plan full of noops that still made
// a write would fail this test even if a hand-written simulator would not
// have caught it.
import { http } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Epic, Prd, UserStory } from "../domain/types.js";
import { createClient } from "../github/index.js";
import { parsePrd } from "../parser/index.js";
import { sync } from "./index.js";
import { createSyncFakeGithub, HttpResponse, type SyncFakeGithub } from "./test-support.js";

const REPO = { owner: "luchosr", repo: "prd-sync" };
const FIXTURE = "docs/prd/PRD-prd-sync.md";

let fake: SyncFakeGithub;

beforeAll(() => {
  fake = createSyncFakeGithub();
  fake.server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  fake.store.clear();
  fake.resetRequests();
});
afterEach(() => fake.server.resetHandlers());
afterAll(() => fake.server.close());

// throttleMs: 0 — the real 500ms default throttle would make the capstone's
// ~18-item fixture (creates + sub-issue links) exceed vitest's test timeout;
// throttling itself is e2's concern and already covered by its own tests.
function ctx() {
  return createClient({ auth: "token", repo: REPO, queue: { throttleMs: 0 } });
}

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
  return { title: "fixture", sourcePath: "fixture.md", epics: [], stories: [], ...overrides };
}

describe("sync — double-run zero-mutation invariant (US-06 AC1 / L6, capstone)", () => {
  it("creates every real-PRD epic and story on run 1, then makes zero POST/PATCH/GraphQL requests on run 2", async () => {
    const prds = await parsePrd(FIXTURE);
    const totalItems = prds.reduce((n, p) => n + p.epics.length + p.stories.length, 0);

    const first = await sync({ prds, ctx: ctx(), dryRun: false });

    expect(first.plan.operations.every((op) => op.kind === "create")).toBe(true);
    expect(first.applied?.created).toHaveLength(totalItems);
    expect(first.applied?.ok).toBe(true);

    fake.resetRequests();
    const second = await sync({ prds, ctx: ctx(), dryRun: false });

    expect(second.plan.operations.every((op) => op.kind === "noop")).toBe(true);
    expect(second.plan.operations).toHaveLength(totalItems);
    expect(fake.requests.filter((r) => r.method !== "GET")).toHaveLength(0);
    expect(second.applied?.ok).toBe(true);
  });
});

describe("sync — dry-run makes no writes (US-07 AC1 / L9)", () => {
  it("returns a plan with creates and performs one read, but zero mutating requests", async () => {
    const prds = [prd({ epics: [epic()], stories: [story()] })];

    const result = await sync({ prds, ctx: ctx(), dryRun: true });

    expect(result.applied).toBeUndefined();
    expect(result.plan.operations.map((op) => op.kind)).toEqual(["create", "create"]);
    expect(fake.requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  });
});

describe("sync — full orphan lifecycle (US-08 / L8)", () => {
  it("orphans a dropped story with labels only, preserves a human label, then settles to noop", async () => {
    const withStory = [prd({ epics: [epic()], stories: [story()] })];

    const created = await sync({ prds: withStory, ctx: ctx(), dryRun: false });
    const storyNumber = created.applied?.created.find((item) => item.key === "US-01")?.number;
    if (storyNumber === undefined) throw new Error("expected US-01 to have been created");
    const stored = fake.store.get(storyNumber);
    if (stored === undefined) throw new Error("expected the story issue to exist in the fake store");
    const originalTitle = stored.title;
    stored.labels.push("needs-triage"); // a human added this after the issue was created

    const withoutStory = [prd({ epics: [epic()] })];
    fake.resetRequests();
    const orphanRun = await sync({ prds: withoutStory, ctx: ctx(), dryRun: false });

    expect(orphanRun.plan.operations.filter((op) => op.kind !== "noop").map((op) => op.kind)).toEqual(["orphan"]);
    expect(orphanRun.applied?.orphaned).toHaveLength(1);
    const afterOrphan = fake.store.get(storyNumber);
    expect(afterOrphan?.title).toBe(originalTitle); // orphaning never rewrites title/body — labels only
    expect(afterOrphan?.state).toBe("open"); // never closed (CLAUDE.md invariant 4)
    expect(afterOrphan?.labels).toEqual(expect.arrayContaining(["prd-sync", "prd-sync:orphan", "needs-triage"]));

    fake.resetRequests();
    const settleRun = await sync({ prds: withoutStory, ctx: ctx(), dryRun: false });

    expect(settleRun.plan.operations.every((op) => op.kind === "noop")).toBe(true);
    expect(fake.requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  });
});

describe("sync — continue-on-error surfaces apply failures (D7 / L10)", () => {
  it("still returns a plan and an applied result with failures when one create fails", async () => {
    fake.server.use(
      http.post("https://api.github.com/repos/:owner/:repo/issues", () => HttpResponse.json({ message: "boom" }), { once: true }),
    );
    const prds = [prd({ epics: [epic()], stories: [story()] })];

    const result = await sync({ prds, ctx: ctx(), dryRun: false });

    expect(result.applied?.ok).toBe(false);
    expect(result.applied?.failures).toHaveLength(1);
    expect(result.applied?.created).toHaveLength(1); // the story still succeeds
  });
});

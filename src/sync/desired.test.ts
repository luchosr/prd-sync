// design §5. Pure Prd -> DesiredIssue[] conversion, plus the desiredLabels
// union helper (§5.3). No GitHub awareness: existing-label merging happens
// in plan.ts, once it has looked an item up in the IssueIndex.
import { describe, expect, it } from "vitest";
import type { Epic, Prd, UserStory } from "../domain/types.js";
import { desiredLabels, toDesiredIssues } from "./desired.js";

const SYNC_LABEL = "prd-sync";

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

describe("toDesiredIssues — title rendering", () => {
  it("renders an epic title as `<key> — <title>`", () => {
    const [result] = toDesiredIssues([prd({ epics: [epic()] })], { syncLabel: SYNC_LABEL });

    expect(result?.title).toBe("E1 — Parser");
  });

  it("renders a story title as `<key>: <title>`", () => {
    const [result] = toDesiredIssues([prd({ stories: [story()] })], { syncLabel: SYNC_LABEL });

    expect(result?.title).toBe("US-01: As a developer, I want to parse a PRD");
  });
});

describe("toDesiredIssues — body rendering", () => {
  it("appends a Tasks checklist section when the story has tasks", () => {
    const withTasks = story({
      tasks: [
        { key: "US-01.T1", title: "Write parser", done: true },
        { key: "US-01.T2", title: "Write tests", done: false },
      ],
    });

    const [result] = toDesiredIssues([prd({ stories: [withTasks] })], { syncLabel: SYNC_LABEL });

    expect(result?.body).toBe(
      "Given a PRD file, when parsed, then a Prd object is returned.\n\n#### Tasks\n\n- [x] Write parser\n- [ ] Write tests",
    );
  });

  it("omits the Tasks section entirely when the story has no tasks", () => {
    const [result] = toDesiredIssues([prd({ stories: [story({ tasks: [] })] })], { syncLabel: SYNC_LABEL });

    expect(result?.body).toBe("Given a PRD file, when parsed, then a Prd object is returned.");
    expect(result?.body).not.toContain("Tasks");
  });

  it("renders an epic body verbatim, with no child list appended", () => {
    const [result] = toDesiredIssues([prd({ epics: [epic({ body: "Epic body text." })] })], { syncLabel: SYNC_LABEL });

    expect(result?.body).toBe("Epic body text.");
  });
});

describe("toDesiredIssues — ordering and fields", () => {
  it("walks epics before stories, both in document order, across multiple PRDs", () => {
    const prd1 = prd({
      epics: [epic({ key: "E1", title: "First" }), epic({ key: "E2", title: "Second" })],
      stories: [story({ key: "US-01", epicKey: "E1" })],
    });
    const prd2 = prd({ epics: [epic({ key: "E3", title: "Third" })], stories: [story({ key: "US-02", epicKey: "E3" })] });

    const result = toDesiredIssues([prd1, prd2], { syncLabel: SYNC_LABEL });

    expect(result.map((item) => item.key)).toEqual(["E1", "E2", "US-01", "E3", "US-02"]);
  });

  it("passes through parentKey, priority, and estimate for a story", () => {
    const [result] = toDesiredIssues([prd({ stories: [story({ epicKey: "E1", priority: "P0", estimate: 3 })] })], {
      syncLabel: SYNC_LABEL,
    });

    expect(result?.parentKey).toBe("E1");
    expect(result?.priority).toBe("P0");
    expect(result?.estimate).toBe(3);
  });

  it("gives an epic a null parentKey", () => {
    const [result] = toDesiredIssues([prd({ epics: [epic()] })], { syncLabel: SYNC_LABEL });

    expect(result?.parentKey).toBeNull();
  });

  it("defaults labels to just the sync label with no existing-issue awareness", () => {
    const [result] = toDesiredIssues([prd({ stories: [story()] })], { syncLabel: SYNC_LABEL });

    expect(result?.labels).toEqual(["prd-sync"]);
  });
});

describe("desiredLabels — union-preserving managed namespace (D5)", () => {
  it("preserves human-added labels and adds the sync label on a create (no existing labels)", () => {
    expect(desiredLabels([], SYNC_LABEL, [SYNC_LABEL])).toEqual(["prd-sync"]);
  });

  it("preserves a human label alongside the sync label", () => {
    expect(desiredLabels(["bug", SYNC_LABEL], SYNC_LABEL, [SYNC_LABEL])).toEqual(["bug", "prd-sync"]);
  });

  it("adds the orphan label when managedNow includes it", () => {
    expect(desiredLabels([SYNC_LABEL], SYNC_LABEL, [SYNC_LABEL, "prd-sync:orphan"])).toEqual([
      "prd-sync",
      "prd-sync:orphan",
    ]);
  });

  it("removes the orphan label on un-orphaning (managedNow no longer includes it)", () => {
    expect(desiredLabels([SYNC_LABEL, "prd-sync:orphan", "bug"], SYNC_LABEL, [SYNC_LABEL])).toEqual(["bug", "prd-sync"]);
  });

  it("sorts the result with the default (locale-independent) comparator", () => {
    expect(desiredLabels(["zzz", "aaa"], SYNC_LABEL, [SYNC_LABEL])).toEqual(["aaa", "prd-sync", "zzz"]);
  });
});

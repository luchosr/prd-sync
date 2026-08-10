// design §9 / spec "Plan renderers and dry-run" (US-07 AC2). Same fixture
// shape as text.test.ts (L11) — every operation kind, both warning kinds,
// and an ApplyResult with failures/skips — rendered as Markdown suitable
// for a PR comment (headers + a counts table + bullet lists).
import { describe, expect, it } from "vitest";
import type { ApplyResult, DesiredIssue, IssueTarget, Plan, PlanOperation, PlanWarning } from "../sync/index.js";
import { renderMarkdown } from "./markdown.js";

function target(number: number): IssueTarget {
  return { number, id: number, nodeId: `NODE_${number}` };
}

function desired(overrides: Partial<DesiredIssue> = {}): DesiredIssue {
  return { kind: "story", key: "", parentKey: null, title: "", body: "", tasks: [], labels: [], ...overrides };
}

const OPERATIONS: readonly PlanOperation[] = [
  {
    kind: "create",
    itemKind: "epic",
    key: "E1",
    title: "E1 — Parser",
    desired: desired({ kind: "epic", key: "E1", title: "E1 — Parser" }),
    bodyWithMarker: "",
    parentKey: null,
  },
  {
    kind: "create",
    itemKind: "story",
    key: "US-01",
    title: "US-01: As a developer, I want a parser",
    desired: desired({ key: "US-01", parentKey: "E1", title: "US-01: As a developer, I want a parser" }),
    bodyWithMarker: "",
    parentKey: "E1",
  },
  {
    kind: "update",
    itemKind: "story",
    key: "US-02",
    title: "US-02: As a tech lead, I want a plan",
    target: target(2),
    desired: desired({ key: "US-02", parentKey: "E1", title: "US-02: As a tech lead, I want a plan" }),
    bodyWithMarker: "",
    parentKey: "E1",
    reason: "content-changed",
  },
  {
    kind: "orphan",
    itemKind: "story",
    key: "US-09",
    title: "US-09: As a developer, I want a dropped story",
    target: target(42),
    labels: ["prd-sync", "prd-sync:orphan"],
  },
  { kind: "noop", itemKind: "story", key: "US-03", title: "US-03: Unchanged", target: target(3), reason: "unchanged" },
];

const WARNINGS: readonly PlanWarning[] = [
  {
    code: "unmanaged-issue",
    number: 7,
    title: "Hand-made issue",
    message: '#7 carries the sync label but no parsable sync marker — left untouched',
  },
  {
    code: "duplicate-key",
    key: "US-03",
    number: 55,
    keptNumber: 12,
    message: "duplicate marker key US-03 on #55 — keeping #12, #55 left untouched",
  },
];

function plan(overrides: Partial<Plan> = {}): Plan {
  return { operations: OPERATIONS, warnings: WARNINGS, ...overrides };
}

const APPLIED: ApplyResult = {
  created: [{ key: "US-01", itemKind: "story", number: 101, title: "US-01: As a developer, I want a parser" }],
  updated: [{ key: "US-02", itemKind: "story", number: 2, title: "US-02: As a tech lead, I want a plan" }],
  orphaned: [{ key: "US-09", itemKind: "story", number: 42, title: "US-09: As a developer, I want a dropped story" }],
  skipped: [{ key: "US-05", step: "link-sub-issue", reason: "parent-create-failed" }],
  failures: [{ key: "US-04", itemKind: "story", step: "link-sub-issue", message: "validation failed", status: 422 }],
  warnings: [],
  ok: false,
};

describe("renderMarkdown", () => {
  it("renders a plan-only report — heading, counts table, every operation kind, both warning kinds", () => {
    expect(renderMarkdown(plan())).toMatchSnapshot();
  });

  it("renders a plan + applied report — including failures and skips", () => {
    expect(renderMarkdown(plan(), APPLIED)).toMatchSnapshot();
  });

  it("omits a section entirely when it has no entries (no empty headings)", () => {
    const empty = plan({ operations: [], warnings: [] });

    const output = renderMarkdown(empty);

    expect(output).not.toContain("### Epics");
    expect(output).not.toContain("### Stories");
    expect(output).not.toContain("### Orphans");
    expect(output).not.toContain("### Warnings");
  });

  it("counts noop operations in the table but never lists them individually", () => {
    const output = renderMarkdown(plan());

    expect(output).toContain("| noop | 1 |");
    expect(output).not.toContain("US-03: Unchanged");
  });

  it("wraps every key in a code span", () => {
    const output = renderMarkdown(plan());

    expect(output).toContain("`US-01`");
    expect(output).toContain("`E1`");
  });
});

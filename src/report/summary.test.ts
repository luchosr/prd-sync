// design §9 / spec "Per-operation counts (US-07 AC2)": summarize() derives
// per-kind counts straight from Plan.operations — the single source of
// truth (A10). No denormalized counts stored on Plan itself.
import { describe, expect, it } from "vitest";
import type { DesiredIssue, Plan, PlanOperation } from "../sync/index.js";
import { summarize } from "./summary.js";

function desired(key: string): DesiredIssue {
  return { kind: "story", key, parentKey: null, title: key, body: "", tasks: [], labels: [] };
}

function op(kind: PlanOperation["kind"], key: string): PlanOperation {
  switch (kind) {
    case "create":
      return { kind, itemKind: "story", key, title: key, desired: desired(key), bodyWithMarker: "", parentKey: null };
    case "update":
      return {
        kind,
        itemKind: "story",
        key,
        title: key,
        target: { number: 1, id: 1, nodeId: "N1" },
        desired: desired(key),
        bodyWithMarker: "",
        parentKey: null,
        reason: "content-changed",
      };
    case "orphan":
      return { kind, itemKind: "story", key, title: key, target: { number: 1, id: 1, nodeId: "N1" }, labels: [] };
    case "noop":
      return { kind, itemKind: "story", key, title: key, reason: "unchanged" };
  }
}

function plan(operations: readonly PlanOperation[]): Plan {
  return { operations, warnings: [] };
}

describe("summarize", () => {
  it("counts 2 creates, 1 update, 1 orphan, 3 noops as 2/1/1/3 (17 total when 10 more noops are added)", () => {
    const operations = [
      op("create", "US-01"),
      op("create", "US-02"),
      op("update", "US-03"),
      op("orphan", "US-09"),
      op("noop", "US-04"),
      op("noop", "US-05"),
      op("noop", "US-06"),
    ];

    expect(summarize(plan(operations))).toEqual({ create: 2, update: 1, orphan: 1, noop: 3, total: 7 });
  });

  it("returns all-zero counts for an empty plan", () => {
    expect(summarize(plan([]))).toEqual({ create: 0, update: 0, orphan: 0, noop: 0, total: 0 });
  });
});

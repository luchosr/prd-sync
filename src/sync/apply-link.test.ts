// design §8's linkStep decision, extracted as a pure function so apply.ts's
// continue-on-error/skip-reason logic is testable without any ClientContext
// mock (TDD mock-hygiene rule).
import { describe, expect, it } from "vitest";
import { resolveLinkTarget } from "./apply-link.js";
import type { IssueTarget } from "./types.js";

const EPIC_TARGET: IssueTarget = { number: 1, id: 100, nodeId: "EPIC_NODE" };

describe("resolveLinkTarget", () => {
  it("returns kind 'none' for a null parentKey (epics never link)", () => {
    const result = resolveLinkTarget(null, new Map(), new Set());

    expect(result).toEqual({ kind: "none" });
  });

  it("returns kind 'link' with the parent's IssueTarget when the parent key is indexed", () => {
    const parentTargets = new Map([["E1", EPIC_TARGET]]);

    const result = resolveLinkTarget("E1", parentTargets, new Set());

    expect(result).toEqual({ kind: "link", parent: EPIC_TARGET });
  });

  it("returns kind 'skip' reason 'parent-create-failed' when the parent key failed to create this run", () => {
    const result = resolveLinkTarget("E1", new Map(), new Set(["E1"]));

    expect(result).toEqual({ kind: "skip", reason: "parent-create-failed" });
  });

  it("returns kind 'skip' reason 'parent-not-found' when the parent key is neither indexed nor a known failure", () => {
    const result = resolveLinkTarget("E1", new Map(), new Set(["E2"]));

    expect(result).toEqual({ kind: "skip", reason: "parent-not-found" });
  });
});

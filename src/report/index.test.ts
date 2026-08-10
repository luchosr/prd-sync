// Import-surface smoke test, mirroring src/github/index.test.ts and
// src/sync's own public-surface convention: exercises summarize/renderText/
// renderMarkdown through the public entry point only.
import { describe, expect, it } from "vitest";
import type { Plan } from "../sync/index.js";
import { renderMarkdown, renderText, summarize } from "./index.js";

const PLAN: Plan = { operations: [], warnings: [] };

describe("public surface (src/report/index.ts)", () => {
  it("re-exports summarize, renderText, and renderMarkdown", () => {
    expect(summarize(PLAN)).toEqual({ create: 0, update: 0, orphan: 0, noop: 0, total: 0 });
    expect(renderText(PLAN)).toContain("Plan: 0 create, 0 update, 0 orphan, 0 noop (0 total)");
    expect(renderMarkdown(PLAN)).toContain("## prd-sync plan");
  });
});

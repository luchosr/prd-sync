import { describe, expect, it } from "vitest";
import { configSchema } from "./config-schema.js";

describe("configSchema", () => {
  it("accepts a minimal valid config, leaving optional fields undefined", () => {
    const result = configSchema.parse({ repo: "luchosr/prd-sync", sources: ["docs/prd/**/*.md"] });

    expect(result).toEqual({
      repo: { owner: "luchosr", repo: "prd-sync" },
      sources: ["docs/prd/**/*.md"],
    });
  });

  it("accepts every optional field", () => {
    const result = configSchema.parse({
      repo: "luchosr/prd-sync",
      sources: ["docs/prd/**/*.md"],
      projectNumber: 3,
      syncLabel: "custom-label",
      fieldMapping: { priority: "Prioridad", estimate: "Estimacion" },
      throttleMs: 750,
    });

    expect(result.projectNumber).toBe(3);
    expect(result.syncLabel).toBe("custom-label");
    expect(result.fieldMapping).toEqual({ priority: "Prioridad", estimate: "Estimacion" });
    expect(result.throttleMs).toBe(750);
  });

  it("accepts a partial fieldMapping (per-field fallback, not all-or-nothing)", () => {
    const result = configSchema.parse({
      repo: "luchosr/prd-sync",
      sources: ["docs/prd/**/*.md"],
      fieldMapping: { priority: "Prioridad" },
    });

    expect(result.fieldMapping).toEqual({ priority: "Prioridad" });
  });

  it("rejects a non-string repo with a field-precise issue", () => {
    const result = configSchema.safeParse({ repo: 42, sources: ["x"] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["repo"]);
  });

  it("rejects a repo string with no owner/repo slash", () => {
    const result = configSchema.safeParse({ repo: "single-word", sources: ["x"] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["repo"]);
  });

  it("rejects an empty sources array", () => {
    const result = configSchema.safeParse({ repo: "a/b", sources: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["sources"]);
  });

  it("rejects an unrecognized top-level key (e.g. stale labels[])", () => {
    const result = configSchema.safeParse({ repo: "a/b", sources: ["x"], labels: ["prd-sync"] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe("unrecognized_keys");
    expect(result.error?.issues[0]?.path).toEqual([]);
  });

  it("rejects an unrecognized fieldMapping key", () => {
    const result = configSchema.safeParse({
      repo: "a/b",
      sources: ["x"],
      fieldMapping: { priority: "P", extra: "nope" },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["fieldMapping"]);
  });

  it("rejects a non-positive projectNumber", () => {
    const result = configSchema.safeParse({ repo: "a/b", sources: ["x"], projectNumber: 0 });

    expect(result.success).toBe(false);
  });

  it("rejects a negative throttleMs", () => {
    const result = configSchema.safeParse({ repo: "a/b", sources: ["x"], throttleMs: -1 });

    expect(result.success).toBe(false);
  });
});

// design §8's projectStep — `projectFieldWrites` is the pure decision of
// which Project v2 fields to write for a story (extracted so it is testable
// without a ClientContext mock); `runProjectStep` is the thin impure
// executor covered by apply.test.ts's integration scenarios instead.
import { describe, expect, it } from "vitest";
import { PROJECT_FIELDS, projectFieldWrites } from "./apply-project.js";
import type { DesiredIssue } from "./types.js";

function desired(overrides: Partial<DesiredIssue> = {}): DesiredIssue {
  return {
    kind: "story",
    key: "US-01",
    parentKey: "E1",
    title: "US-01: A story",
    body: "Body.",
    tasks: [],
    labels: ["prd-sync"],
    ...overrides,
  };
}

describe("projectFieldWrites", () => {
  it("returns no writes when neither priority nor estimate is set", () => {
    expect(projectFieldWrites(desired())).toEqual([]);
  });

  it("returns a singleSelect write for the Priority field when priority is set", () => {
    const writes = projectFieldWrites(desired({ priority: "P0" }));

    expect(writes).toEqual([{ field: PROJECT_FIELDS.priority, value: { kind: "singleSelect", option: "P0" } }]);
  });

  it("returns a number write for the Estimate field when estimate is set, including 0", () => {
    const writes = projectFieldWrites(desired({ estimate: 0 }));

    expect(writes).toEqual([{ field: PROJECT_FIELDS.estimate, value: { kind: "number", value: 0 } }]);
  });

  it("returns both writes, priority first, when both are set", () => {
    const writes = projectFieldWrites(desired({ priority: "P1", estimate: 5 }));

    expect(writes).toEqual([
      { field: PROJECT_FIELDS.priority, value: { kind: "singleSelect", option: "P1" } },
      { field: PROJECT_FIELDS.estimate, value: { kind: "number", value: 5 } },
    ]);
  });
});

describe("projectFieldWrites — configurable field names (E4 additive)", () => {
  it("uses the mapped field name for priority when mapping.priority is set", () => {
    const writes = projectFieldWrites(desired({ priority: "P0" }), { priority: "Prioridad" });

    expect(writes).toEqual([{ field: "Prioridad", value: { kind: "singleSelect", option: "P0" } }]);
  });

  it("uses the mapped field name for estimate when mapping.estimate is set", () => {
    const writes = projectFieldWrites(desired({ estimate: 3 }), { estimate: "Puntos" });

    expect(writes).toEqual([{ field: "Puntos", value: { kind: "number", value: 3 } }]);
  });

  it("falls back to the default field name for a field absent from a partial mapping", () => {
    const writes = projectFieldWrites(desired({ priority: "P1", estimate: 5 }), { priority: "Prioridad" });

    expect(writes).toEqual([
      { field: "Prioridad", value: { kind: "singleSelect", option: "P1" } },
      { field: PROJECT_FIELDS.estimate, value: { kind: "number", value: 5 } },
    ]);
  });

  it("treats an empty mapping object the same as no mapping at all", () => {
    const writes = projectFieldWrites(desired({ priority: "P2", estimate: 8 }), {});

    expect(writes).toEqual([
      { field: PROJECT_FIELDS.priority, value: { kind: "singleSelect", option: "P2" } },
      { field: PROJECT_FIELDS.estimate, value: { kind: "number", value: 8 } },
    ]);
  });
});

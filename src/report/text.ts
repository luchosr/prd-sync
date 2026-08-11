// design §9: plain-console renderer. Pure — no `node:process`, no ANSI
// colour, no timestamps, no absolute paths (enforced by
// src/sync/boundaries.test.ts) — so its output is stable across machines and
// snapshot-testable. `noop` operations are counted (via summarize()) but
// never listed individually: a large unchanged run would otherwise bury the
// handful of operations that matter under a wall of identical lines (A13).
import type { ApplyResult, ItemKind, Plan, PlanOperation } from "../sync/index.js";
import { summarize } from "./summary.js";

function opLine(op: Extract<PlanOperation, { kind: "create" | "update" | "orphan" }>): string {
  return `  ${op.kind.padEnd(8)}${op.key.padEnd(8)}${op.title}`;
}

function ofItemKind(
  operations: readonly PlanOperation[],
  itemKind: ItemKind,
): readonly Extract<PlanOperation, { kind: "create" | "update" }>[] {
  return operations.filter(
    (op): op is Extract<PlanOperation, { kind: "create" | "update" }> =>
      (op.kind === "create" || op.kind === "update") && op.itemKind === itemKind,
  );
}

function orphans(operations: readonly PlanOperation[]): readonly Extract<PlanOperation, { kind: "orphan" }>[] {
  return operations.filter((op): op is Extract<PlanOperation, { kind: "orphan" }> => op.kind === "orphan");
}

export function renderText(plan: Plan, applied?: ApplyResult): string {
  const summary = summarize(plan);
  const lines: string[] = [
    `Plan: ${summary.create} create, ${summary.update} update, ${summary.orphan} orphan, ${summary.noop} noop (${summary.total} total)`,
  ];

  const epics = ofItemKind(plan.operations, "epic");
  if (epics.length > 0) {
    lines.push("", "Epics", ...epics.map(opLine));
  }

  const stories = ofItemKind(plan.operations, "story");
  if (stories.length > 0) {
    lines.push("", "Stories", ...stories.map(opLine));
  }

  const orphanOps = orphans(plan.operations);
  if (orphanOps.length > 0) {
    lines.push(
      "",
      "Orphans",
      ...orphanOps.map((op) => `  orphan  ${op.key.padEnd(8)}#${op.target.number}  ${op.title}`),
    );
  }

  if (plan.warnings.length > 0) {
    lines.push("", "Warnings", ...plan.warnings.map((warning) => `  ! ${warning.message}`));
  }

  if (applied !== undefined) {
    lines.push("", `Applied: ${applied.created.length} created, ${applied.updated.length} updated, ${applied.orphaned.length} orphaned`);

    if (applied.failures.length > 0) {
      lines.push(
        "Failures",
        ...applied.failures.map((failure) => {
          const status = failure.status !== undefined ? `status ${failure.status}: ` : "";
          return `  ✗ ${failure.key}  ${failure.step}  ${status}${failure.message}`;
        }),
      );
    }

    if (applied.skipped.length > 0) {
      lines.push("Skipped", ...applied.skipped.map((skip) => `  - ${skip.key}  ${skip.step}  ${skip.reason}`));
    }
  }

  return lines.join("\n");
}

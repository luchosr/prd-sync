// design §9: summarize() derives per-kind counts from Plan.operations — the
// single source of truth (A10). Plan itself carries no denormalized counts,
// so this is the only place that walk exists; a caller who wants both
// per-kind counts and the operations list reads them from the same Plan.
import type { OperationKind, Plan } from "../sync/index.js";

export interface PlanSummary {
  readonly create: number;
  readonly update: number;
  readonly orphan: number;
  readonly noop: number;
  readonly total: number;
}

export function summarize(plan: Plan): PlanSummary {
  const counts: Record<OperationKind, number> = { create: 0, update: 0, orphan: 0, noop: 0 };
  for (const operation of plan.operations) {
    counts[operation.kind] += 1;
  }
  return { ...counts, total: plan.operations.length };
}

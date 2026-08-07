// Shared vocabulary for src/sync/. Grows in later PRs (Plan, PlanOperation,
// ApplyResult, SyncOptions…) — this PR defines only what hash.ts needs.
import type { Priority } from "../domain/types.js";

export type DesiredKind = "epic" | "story";

export interface DesiredTask {
  readonly title: string;
  readonly done: boolean;
}

export interface DesiredIssue {
  readonly kind: DesiredKind;
  readonly key: string;
  readonly parentKey: string | null;
  readonly title: string;
  readonly body: string; // marker-free; this is what the content hash covers
  readonly priority?: Priority;
  readonly estimate?: number;
  readonly tasks: readonly DesiredTask[];
  readonly labels: readonly string[]; // sorted, complete managed+human union
}

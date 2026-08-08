// Shared vocabulary for src/sync/. Grows in later PRs (ApplyResult,
// SyncOptions…) — this PR adds Plan/PlanOperation/IssueIndex on top of PR1's
// DesiredIssue.
import type { SyncedIssue } from "../github/index.js";
import type { Priority } from "../domain/types.js";
import type { Marker } from "./marker.js";

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

// ---------------------------------------------------------------------------
// Plan (design §6-§7)
// ---------------------------------------------------------------------------

export type OperationKind = "create" | "update" | "orphan" | "noop";
export type ItemKind = "epic" | "story";

export interface IssueTarget {
  readonly number: number;
  readonly id: number;
  readonly nodeId: string;
}

export type PlanOperation =
  | {
      readonly kind: "create";
      readonly itemKind: ItemKind;
      readonly key: string;
      readonly title: string;
      readonly desired: DesiredIssue;
      readonly bodyWithMarker: string;
      readonly parentKey: string | null;
    }
  | {
      readonly kind: "update";
      readonly itemKind: ItemKind;
      readonly key: string;
      readonly title: string;
      readonly target: IssueTarget;
      readonly desired: DesiredIssue;
      readonly bodyWithMarker: string;
      readonly parentKey: string | null;
      readonly reason: "content-changed";
    }
  | {
      readonly kind: "orphan";
      readonly itemKind: ItemKind;
      readonly key: string;
      readonly title: string;
      readonly target: IssueTarget;
      readonly labels: readonly string[];
    }
  | {
      readonly kind: "noop";
      readonly itemKind: ItemKind;
      readonly key: string;
      readonly title: string;
      readonly target?: IssueTarget;
      readonly reason: "unchanged" | "already-orphaned";
    };

export type PlanWarning =
  | { readonly code: "unmanaged-issue"; readonly number: number; readonly title: string; readonly message: string }
  | {
      readonly code: "duplicate-key";
      readonly key: string;
      readonly number: number;
      readonly keptNumber: number;
      readonly message: string;
    };

export interface Plan {
  readonly operations: readonly PlanOperation[]; // already in apply order: epics, stories, orphans, noops
  readonly warnings: readonly PlanWarning[];
  readonly project?: { readonly owner: string; readonly number: number };
}

export interface PlanOptions {
  readonly syncLabel: string;
  readonly project?: { readonly owner: string; readonly number: number };
}

// ---------------------------------------------------------------------------
// Issue index (design §6)
// ---------------------------------------------------------------------------

export interface IndexedIssue {
  readonly issue: SyncedIssue;
  readonly marker: Marker;
}

export interface IssueIndex {
  readonly byKey: ReadonlyMap<string, IndexedIssue>;
  readonly unmanaged: readonly SyncedIssue[]; // sync label present, no parsable marker
  readonly duplicates: readonly SyncedIssue[]; // same marker key, lost the lowest-number tie-break
}

// Shared vocabulary for src/sync/. This PR adds ApplyResult/ApplyOptions and
// SyncOptions/SyncResult (design §8, §10) on top of PR2's Plan/PlanOperation.
import type { ClientContext, GithubIssueCode, GithubWarning, SyncedIssue } from "../github/index.js";
import type { Prd, Priority } from "../domain/types.js";
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

// ---------------------------------------------------------------------------
// Apply (design §8) — apply() is the only impure module. No `dryRun` here:
// dry-run is structural in sync.ts, which simply never calls apply().
// ---------------------------------------------------------------------------

export type ApplyStep = "resolve-project" | "create" | "update" | "orphan" | "link-sub-issue" | "project-item" | "project-field";

export interface AppliedItem {
  readonly key: string;
  readonly itemKind: ItemKind;
  readonly number: number;
  readonly title: string;
}

export interface SkippedStep {
  readonly key: string;
  readonly step: ApplyStep;
  readonly reason: "parent-create-failed" | "parent-not-found" | "project-unavailable";
}

export interface ApplyFailure {
  readonly key: string;
  readonly itemKind: ItemKind;
  readonly step: ApplyStep;
  readonly message: string;
  readonly status?: number;
  readonly code?: GithubIssueCode;
}

export interface ApplyResult {
  readonly created: readonly AppliedItem[];
  readonly updated: readonly AppliedItem[];
  readonly orphaned: readonly AppliedItem[];
  readonly skipped: readonly SkippedStep[];
  readonly failures: readonly ApplyFailure[];
  readonly warnings: readonly GithubWarning[];
  readonly ok: boolean; // failures.length === 0
}

// E4 additive: per-field override of the Projects v2 field names apply()
// writes to (design §7). Unmapped fields keep the PROJECT_FIELDS defaults.
export interface FieldMapping {
  readonly priority?: string;
  readonly estimate?: string;
}

export interface ApplyOptions {
  readonly syncLabel: string;
  readonly project?: { readonly owner: string; readonly number: number };
  readonly fieldMapping?: FieldMapping;
}

// ---------------------------------------------------------------------------
// sync() entrypoint (design §10, D9)
// ---------------------------------------------------------------------------

export interface SyncOptions {
  readonly prds: readonly Prd[];
  readonly ctx: ClientContext;
  readonly syncLabel?: string; // default DEFAULT_SYNC_LABEL
  readonly project?: { readonly owner: string; readonly number: number };
  readonly dryRun?: boolean; // default false
  readonly fieldMapping?: FieldMapping;
}

export interface SyncResult {
  readonly plan: Plan;
  readonly applied?: ApplyResult; // absent iff dryRun
}

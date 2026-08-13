/**
 * Public surface of `src/sync/`. Mirrors `src/parser/index.ts` and
 * `src/github/index.ts`'s convention — this is the ONLY module other code
 * (`src/report/`, `src/cli.ts` in E4, tests outside this directory) should
 * import from. `src/report/` imports only the types below, never a GitHub
 * or parser vocabulary (design §1).
 */
export { sync } from "./sync.js";
export { buildPlan } from "./plan.js";
export { apply } from "./apply.js";
export { DEFAULT_SYNC_LABEL, ORPHAN_LABEL } from "./labels.js";

export type {
  ApplyFailure,
  ApplyOptions,
  ApplyResult,
  ApplyStep,
  AppliedItem,
  DesiredIssue,
  DesiredKind,
  DesiredTask,
  FieldMapping,
  ItemKind,
  IssueTarget,
  OperationKind,
  Plan,
  PlanOperation,
  PlanOptions,
  PlanWarning,
  SkippedStep,
  SyncOptions,
  SyncResult,
} from "./types.js";

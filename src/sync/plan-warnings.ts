// Warning construction — split out of plan.ts to keep each file focused.
// `unmanaged-issue` and `duplicate-key` are the two ways indexByKey (design
// §6) reports an issue it deliberately left out of `byKey`.
import type { SyncedIssue } from "../github/index.js";
import { parseMarker } from "./marker.js";
import type { IssueIndex, PlanWarning } from "./types.js";

export function unmanagedWarning(issue: SyncedIssue): PlanWarning {
  return {
    code: "unmanaged-issue",
    number: issue.number,
    title: issue.title,
    message: `#${issue.number} carries the sync label but no parsable sync marker — left untouched`,
  };
}

export function duplicateWarning(issue: SyncedIssue, index: IssueIndex): PlanWarning | undefined {
  const marker = parseMarker(issue.body);
  if (marker === null) return undefined; // unreachable: duplicates only ever come from markered issues

  const kept = index.byKey.get(marker.key);
  const keptNumber = kept?.issue.number ?? issue.number;
  return {
    code: "duplicate-key",
    key: marker.key,
    number: issue.number,
    keptNumber,
    message: `duplicate marker key ${marker.key} on #${issue.number} — keeping #${keptNumber}, #${issue.number} left untouched`,
  };
}

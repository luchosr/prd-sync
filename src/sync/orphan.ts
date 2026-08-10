// Orphan classification — split out of plan.ts to keep each file focused.
// design §7's orphan branch: never touches body or hash, only ever changes
// `labels`, so a stale marker hash is left intact. On the next run the
// orphan label is present, so this composes to `noop` for free.
import type { SyncedIssue } from "../github/index.js";
import { desiredLabels } from "./desired.js";
import { ORPHAN_LABEL } from "./labels.js";
import type { IndexedIssue, IssueTarget, ItemKind, PlanOperation } from "./types.js";

function toIssueTarget(issue: SyncedIssue): IssueTarget {
  return { number: issue.number, id: issue.id, nodeId: issue.nodeId };
}

// Epic keys are `E<n>`, story keys are `US-<n>` (prd-contract's closed ID
// format). Needed only here: the marker carries `key` + `hash`, not `kind`,
// so once an issue's key drops out of the PRD its item kind must be
// recovered from the key shape itself.
export function inferItemKind(key: string): ItemKind {
  return /^E\d+$/.test(key) ? "epic" : "story";
}

export function classifyOrphan(key: string, hit: IndexedIssue, syncLabel: string): PlanOperation {
  const itemKind = inferItemKind(key);
  const target = toIssueTarget(hit.issue);

  if (hit.issue.labels.includes(ORPHAN_LABEL)) {
    return { kind: "noop", itemKind, key, title: hit.issue.title, target, reason: "already-orphaned" };
  }

  return {
    kind: "orphan",
    itemKind,
    key,
    title: hit.issue.title,
    target,
    labels: desiredLabels(hit.issue.labels, syncLabel, [syncLabel, ORPHAN_LABEL]),
  };
}

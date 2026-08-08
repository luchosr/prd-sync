// buildPlan (design §7) — PURE, no I/O, no clock. Named `buildPlan`, not
// `plan`: the file is `plan.ts` and the local variable at every call site is
// `plan`, so a same-name export would shadow constantly. Orphan
// classification and warning construction live in sibling modules
// (`orphan.ts`, `plan-warnings.ts`) to keep this file to the live-item
// create/update/noop decision only.
import type { Prd } from "../domain/types.js";
import type { SyncedIssue } from "../github/index.js";
import { desiredLabels, toDesiredIssues } from "./desired.js";
import { contentHash } from "./hash.js";
import { indexByKey } from "./index-issues.js";
import { appendMarker } from "./marker.js";
import { classifyOrphan } from "./orphan.js";
import { duplicateWarning, unmanagedWarning } from "./plan-warnings.js";
import type { DesiredIssue, IndexedIssue, IssueTarget, Plan, PlanOperation, PlanOptions, PlanWarning } from "./types.js";

function toIssueTarget(issue: SyncedIssue): IssueTarget {
  return { number: issue.number, id: issue.id, nodeId: issue.nodeId };
}

// Resolves a live item's final labels against whatever issue is currently
// indexed under its key (design §5.3's union, applied here because desired.ts
// stays Prd-only per the design §1 module boundary).
function resolveLabels(desired: DesiredIssue, hit: IndexedIssue | undefined, syncLabel: string): DesiredIssue {
  const existingLabels = hit?.issue.labels ?? [];
  return { ...desired, labels: desiredLabels(existingLabels, syncLabel, [syncLabel]) };
}

function classifyLiveItem(desired: DesiredIssue, hit: IndexedIssue | undefined, syncLabel: string): PlanOperation {
  const resolved = resolveLabels(desired, hit, syncLabel);
  const hash = contentHash(resolved);
  const bodyWithMarker = appendMarker(resolved.body, { key: resolved.key, hash });

  if (hit === undefined) {
    return {
      kind: "create",
      itemKind: resolved.kind,
      key: resolved.key,
      title: resolved.title,
      desired: resolved,
      bodyWithMarker,
      parentKey: resolved.parentKey,
    };
  }

  if (hit.marker.hash !== hash) {
    return {
      kind: "update",
      itemKind: resolved.kind,
      key: resolved.key,
      title: resolved.title,
      target: toIssueTarget(hit.issue),
      desired: resolved,
      bodyWithMarker,
      parentKey: resolved.parentKey,
      reason: "content-changed",
    };
  }

  return {
    kind: "noop",
    itemKind: resolved.kind,
    key: resolved.key,
    title: resolved.title,
    target: toIssueTarget(hit.issue),
    reason: "unchanged",
  };
}

export function buildPlan(prds: readonly Prd[], existingIssues: readonly SyncedIssue[], options: PlanOptions): Plan {
  const index = indexByKey(existingIssues);
  const desired = toDesiredIssues(prds, { syncLabel: options.syncLabel });
  const seen = new Set<string>();

  const epicOps: PlanOperation[] = [];
  const storyOps: PlanOperation[] = [];
  const noopOps: PlanOperation[] = [];

  for (const item of desired) {
    seen.add(item.key);
    const op = classifyLiveItem(item, index.byKey.get(item.key), options.syncLabel);
    if (op.kind === "noop") noopOps.push(op);
    else (item.kind === "epic" ? epicOps : storyOps).push(op);
  }

  const orphanOps: PlanOperation[] = [];
  for (const [key, hit] of index.byKey) {
    if (seen.has(key)) continue;
    const op = classifyOrphan(key, hit, options.syncLabel);
    if (op.kind === "noop") noopOps.push(op);
    else orphanOps.push(op);
  }

  const warnings: PlanWarning[] = [
    ...index.unmanaged.map(unmanagedWarning),
    ...index.duplicates.map((issue) => duplicateWarning(issue, index)).filter((warning): warning is PlanWarning => warning !== undefined),
  ];

  return { operations: [...epicOps, ...storyOps, ...orphanOps, ...noopOps], warnings, project: options.project };
}

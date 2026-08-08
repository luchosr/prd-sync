// SyncedIssue[] -> IssueIndex (design §6). One pass over `existing`, in
// GitHub's list order. An issue with no parsable marker is simply excluded
// from `byKey` — never an error (a human who applies the sync label by hand
// must not have their issue rewritten).
import type { SyncedIssue } from "../github/index.js";
import { SyncPlanError } from "./errors.js";
import { parseMarker } from "./marker.js";
import type { IndexedIssue, IssueIndex } from "./types.js";

// Fail closed: if the list endpoint stops returning bodies, every managed
// issue would parse as unmanaged and the planner would emit a `create` for
// the entire backlog, duplicating it. Trigger only on `undefined` (field
// absent), never on `null` (a genuinely empty body) — design §6, A12.
function assertBodiesPresent(existing: readonly SyncedIssue[]): void {
  if (existing.length === 0) return;
  if (!existing.every((issue) => issue.body === undefined)) return;

  throw new SyncPlanError({
    code: "missing-issue-bodies",
    message: `${existing.length} sync-labelled issue(s) were listed with no \`body\` field present.`,
    suggestion:
      "Confirm the GitHub issue-list response includes `body` (E3 D1). If every issue on this repo genuinely has an empty body, remove the sync label or add body text to at least one before retrying.",
  });
}

export function indexByKey(existing: readonly SyncedIssue[]): IssueIndex {
  assertBodiesPresent(existing);

  const byKey = new Map<string, IndexedIssue>();
  const unmanaged: SyncedIssue[] = [];
  const duplicates: SyncedIssue[] = [];

  for (const issue of existing) {
    const marker = parseMarker(issue.body);
    if (marker === null) {
      unmanaged.push(issue);
      continue;
    }

    const current = byKey.get(marker.key);
    if (current === undefined) {
      byKey.set(marker.key, { issue, marker });
      continue;
    }

    // Lowest issue number wins — deterministic, so the plan cannot flap
    // between runs, and neither issue is ever closed or deleted.
    if (issue.number < current.issue.number) {
      byKey.set(marker.key, { issue, marker });
      duplicates.push(current.issue);
    } else {
      duplicates.push(issue);
    }
  }

  return { byKey, unmanaged, duplicates };
}

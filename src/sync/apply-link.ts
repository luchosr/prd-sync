// design §8's linkStep decision — pure. `apply.ts` owns the actual
// `linkSubIssue` I/O; this module only decides whether to link, and why not,
// given the map of parent keys resolved so far (pre-existing epics from the
// plan plus epics created earlier in this same run).
import type { IssueTarget, SkippedStep } from "./types.js";

export type LinkDecision =
  | { readonly kind: "none" }
  | { readonly kind: "skip"; readonly reason: SkippedStep["reason"] }
  | { readonly kind: "link"; readonly parent: IssueTarget };

export function resolveLinkTarget(
  parentKey: string | null,
  parentTargets: ReadonlyMap<string, IssueTarget>,
  failedKeys: ReadonlySet<string>,
): LinkDecision {
  if (parentKey === null) return { kind: "none" };

  const parent = parentTargets.get(parentKey);
  if (parent === undefined) {
    return { kind: "skip", reason: failedKeys.has(parentKey) ? "parent-create-failed" : "parent-not-found" };
  }

  return { kind: "link", parent };
}

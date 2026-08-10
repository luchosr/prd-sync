// design §8 — the only impure module. No `dryRun` parameter: dry-run is
// structural in sync.ts, which simply never calls this function (A7). Plan
// operations already arrive in apply order (epics, stories, orphans, noops —
// plan.ts), so this is a straight loop with no sorting.
import type { ClientContext, GithubWarning, IssueRef, ProjectHandle } from "../github/index.js";
import { createIssue, linkSubIssue, resolveProject, updateIssue } from "../github/index.js";
import { resolveLinkTarget } from "./apply-link.js";
import { toApplyFailure } from "./apply-errors.js";
import { runProjectStep } from "./apply-project.js";
import type {
  AppliedItem,
  ApplyFailure,
  ApplyOptions,
  ApplyResult,
  IssueTarget,
  Plan,
  PlanOperation,
  SkippedStep,
} from "./types.js";

type LiveOp = Extract<PlanOperation, { kind: "create" } | { kind: "update" }>;

function toIssueRef(target: IssueTarget): IssueRef {
  return { number: target.number, id: target.id, nodeId: target.nodeId };
}

function toAppliedItem(op: PlanOperation, target: IssueTarget): AppliedItem {
  return { key: op.key, itemKind: op.itemKind, number: target.number, title: op.title };
}

// Pre-existing epics carry their IssueTarget on their own update/noop
// operation (plan.ts) — seeding the map with those means a story linking to
// an epic that already exists needs no extra lookup.
function existingParentTargets(plan: Plan): Map<string, IssueTarget> {
  const targets = new Map<string, IssueTarget>();
  for (const op of plan.operations) {
    if (op.itemKind !== "epic") continue;
    if ((op.kind === "update" || op.kind === "noop") && op.target !== undefined) targets.set(op.key, op.target);
  }
  return targets;
}

export async function apply(plan: Plan, ctx: ClientContext, options: ApplyOptions): Promise<ApplyResult> {
  const created: AppliedItem[] = [];
  const updated: AppliedItem[] = [];
  const orphaned: AppliedItem[] = [];
  const skipped: SkippedStep[] = [];
  const failures: ApplyFailure[] = [];
  const warnings: GithubWarning[] = [];

  const parentTargets = existingParentTargets(plan);
  const failedKeys = new Set<string>();

  // Distinct from "resolution failed": when no project was ever requested,
  // there is nothing to skip — the feature simply wasn't asked for.
  const projectRequested = options.project !== undefined;
  const project = options.project === undefined ? undefined : await resolveProjectHandle(ctx, options.project, failures);

  async function linkStep(op: LiveOp, ref: IssueTarget): Promise<void> {
    const decision = resolveLinkTarget(op.parentKey, parentTargets, failedKeys);
    if (decision.kind === "none") return;
    if (decision.kind === "skip") {
      skipped.push({ key: op.key, step: "link-sub-issue", reason: decision.reason });
      return;
    }
    try {
      await linkSubIssue(ctx, toIssueRef(decision.parent), toIssueRef(ref));
    } catch (error) {
      failures.push(toApplyFailure(op.key, op.itemKind, "link-sub-issue", error));
    }
  }

  async function projectStep(op: LiveOp, ref: IssueTarget): Promise<void> {
    if (op.itemKind !== "story") return; // D8: epics never go on the board
    if (project === undefined) {
      if (projectRequested) skipped.push({ key: op.key, step: "project-item", reason: "project-unavailable" });
      return;
    }
    const result = await runProjectStep(ctx, project, toIssueRef(ref), op.key, op.itemKind, op.desired);
    warnings.push(...result.warnings);
    if (result.failure !== undefined) failures.push(result.failure);
  }

  for (const op of plan.operations) {
    if (op.kind === "noop") continue;

    if (op.kind === "create") {
      let ref: IssueTarget;
      try {
        const issueRef = await createIssue(ctx, { title: op.title, body: op.bodyWithMarker, labels: op.desired.labels });
        ref = toIssueTarget(issueRef);
      } catch (error) {
        failures.push(toApplyFailure(op.key, op.itemKind, "create", error));
        failedKeys.add(op.key);
        continue;
      }
      parentTargets.set(op.key, ref);
      created.push(toAppliedItem(op, ref));
      await linkStep(op, ref);
      await projectStep(op, ref);
      continue;
    }

    if (op.kind === "update") {
      try {
        await updateIssue(ctx, op.target.number, { title: op.title, body: op.bodyWithMarker, labels: op.desired.labels });
      } catch (error) {
        failures.push(toApplyFailure(op.key, op.itemKind, "update", error));
        continue;
      }
      parentTargets.set(op.key, op.target);
      updated.push(toAppliedItem(op, op.target));
      await linkStep(op, op.target);
      await projectStep(op, op.target);
      continue;
    }

    // orphan — labels only, never title/body/state (US-08 / L8).
    try {
      await updateIssue(ctx, op.target.number, { labels: op.labels });
    } catch (error) {
      failures.push(toApplyFailure(op.key, op.itemKind, "orphan", error));
      continue;
    }
    orphaned.push(toAppliedItem(op, op.target));
  }

  return { created, updated, orphaned, skipped, failures, warnings, ok: failures.length === 0 };
}

function toIssueTarget(ref: IssueRef): IssueTarget {
  return { number: ref.number, id: ref.id, nodeId: ref.nodeId };
}

// Step 0 (design §8): a failed resolution records one failure and disables
// every later project step (skipped, reason "project-unavailable") — issue
// sync itself must not be lost because a board is misconfigured.
async function resolveProjectHandle(
  ctx: ClientContext,
  project: { readonly owner: string; readonly number: number },
  failures: ApplyFailure[],
): Promise<ProjectHandle | undefined> {
  try {
    return await resolveProject(ctx, project.owner, project.number);
  } catch (error) {
    // Run-level failure, not tied to one item — `key`/`itemKind` are
    // placeholders; every later project step still records its own
    // per-item `skipped(reason: "project-unavailable")`.
    failures.push(toApplyFailure("", "story", "resolve-project", error));
    return undefined;
  }
}

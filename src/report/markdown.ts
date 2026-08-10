// design §9: Markdown renderer, sized for a PR comment. Same section
// grouping as text.ts (the "plan" half is provably identical content across
// both formats), just formatted as headings + a counts table + bullet
// lists with keys in code spans. Pure — see text.ts's header comment for
// the snapshot-stability constraints enforced by boundaries.test.ts.
import type { ApplyResult, ItemKind, Plan, PlanOperation } from "../sync/index.js";
import { summarize } from "./summary.js";

function opBullet(op: Extract<PlanOperation, { kind: "create" | "update" }>): string {
  return `- \`${op.key}\` **${op.kind}** ${op.title}`;
}

function ofItemKind(operations: readonly PlanOperation[], itemKind: ItemKind): readonly PlanOperation[] {
  return operations.filter((op) => (op.kind === "create" || op.kind === "update") && op.itemKind === itemKind);
}

function orphans(operations: readonly PlanOperation[]): readonly Extract<PlanOperation, { kind: "orphan" }>[] {
  return operations.filter((op): op is Extract<PlanOperation, { kind: "orphan" }> => op.kind === "orphan");
}

export function renderMarkdown(plan: Plan, applied?: ApplyResult): string {
  const summary = summarize(plan);
  const lines: string[] = [
    "## prd-sync plan",
    "",
    "| Operation | Count |",
    "| --- | --- |",
    `| create | ${summary.create} |`,
    `| update | ${summary.update} |`,
    `| orphan | ${summary.orphan} |`,
    `| noop | ${summary.noop} |`,
    `| **Total** | ${summary.total} |`,
  ];

  const epics = ofItemKind(plan.operations, "epic");
  if (epics.length > 0) {
    lines.push("", "### Epics", ...epics.map((op) => opBullet(op as Extract<PlanOperation, { kind: "create" | "update" }>)));
  }

  const stories = ofItemKind(plan.operations, "story");
  if (stories.length > 0) {
    lines.push(
      "",
      "### Stories",
      ...stories.map((op) => opBullet(op as Extract<PlanOperation, { kind: "create" | "update" }>)),
    );
  }

  const orphanOps = orphans(plan.operations);
  if (orphanOps.length > 0) {
    lines.push("", "### Orphans", ...orphanOps.map((op) => `- \`${op.key}\` #${op.target.number} ${op.title}`));
  }

  if (plan.warnings.length > 0) {
    lines.push("", "### Warnings", ...plan.warnings.map((warning) => `- ${warning.message}`));
  }

  if (applied !== undefined) {
    lines.push(
      "",
      "## Applied",
      "",
      `${applied.created.length} created, ${applied.updated.length} updated, ${applied.orphaned.length} orphaned`,
    );

    if (applied.failures.length > 0) {
      lines.push(
        "",
        "### Failures",
        ...applied.failures.map((failure) => {
          const status = failure.status !== undefined ? `status ${failure.status}: ` : "";
          return `- \`${failure.key}\` ${failure.step} — ${status}${failure.message}`;
        }),
      );
    }

    if (applied.skipped.length > 0) {
      lines.push("", "### Skipped", ...applied.skipped.map((skip) => `- \`${skip.key}\` ${skip.step} — ${skip.reason}`));
    }
  }

  return lines.join("\n");
}

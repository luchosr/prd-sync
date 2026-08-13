// design §8's projectStep — stories only (D8: epics never go on the board),
// and only when a project was configured. `projectFieldWrites` is pure;
// `runProjectStep` is the thin impure executor apply.ts calls per story.
import type { ClientContext, GithubWarning, IssueRef, ProjectFieldValue, ProjectHandle } from "../github/index.js";
import { addItemToProject, setFieldValue } from "../github/index.js";
import { toApplyFailure } from "./apply-errors.js";
import type { ApplyFailure, DesiredIssue, FieldMapping, ItemKind } from "./types.js";

// Default field names, used whenever a caller omits `fieldMapping` or leaves
// a given field unmapped (E4 §7: additive, backward-compatible override).
export const PROJECT_FIELDS = { priority: "Priority", estimate: "Estimate" } as const;

export interface FieldWrite {
  readonly field: string;
  readonly value: ProjectFieldValue;
}

export function projectFieldWrites(desired: DesiredIssue, mapping?: FieldMapping): readonly FieldWrite[] {
  const priorityField = mapping?.priority ?? PROJECT_FIELDS.priority;
  const estimateField = mapping?.estimate ?? PROJECT_FIELDS.estimate;

  const writes: FieldWrite[] = [];
  if (desired.priority !== undefined) {
    writes.push({ field: priorityField, value: { kind: "singleSelect", option: desired.priority } });
  }
  if (desired.estimate !== undefined) {
    writes.push({ field: estimateField, value: { kind: "number", value: desired.estimate } });
  }
  return writes;
}

export interface ProjectStepResult {
  readonly warnings: readonly GithubWarning[];
  readonly failure?: ApplyFailure;
}

// addItemToProject is an upsert and setFieldValue degrades unknown
// fields/options to warnings (never throws) — see src/github/projects.ts.
// Only the addItemToProject call itself can realistically fail here.
export async function runProjectStep(
  ctx: ClientContext,
  project: ProjectHandle,
  content: IssueRef,
  key: string,
  itemKind: ItemKind,
  desired: DesiredIssue,
  fieldMapping?: FieldMapping,
): Promise<ProjectStepResult> {
  const warnings: GithubWarning[] = [];

  let itemId: string;
  try {
    const result = await addItemToProject(ctx, project, content);
    warnings.push(...result.warnings);
    itemId = result.itemId;
  } catch (error) {
    return { warnings, failure: toApplyFailure(key, itemKind, "project-item", error) };
  }

  for (const write of projectFieldWrites(desired, fieldMapping)) {
    const result = await setFieldValue(ctx, project, itemId, write.field, write.value);
    warnings.push(...result.warnings);
  }

  return { warnings };
}

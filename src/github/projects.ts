// resolveProject/addItemToProject/setFieldValue. Receives only
// `ClientContext` — same funnel constraint as issues.ts (design decision #1).
import type { ClientContext, ProjectField, ProjectFieldSchema } from "./context.js";
import type { GithubWarning } from "./errors.js";
import type { IssueRef } from "./issues.js";
import { ADD_PROJECT_V2_ITEM_MUTATION, RESOLVE_PROJECT_V2_QUERY, SET_PROJECT_V2_FIELD_VALUE_MUTATION } from "./queries.js";
import { addProjectV2ItemSchema, resolveProjectV2Schema, setProjectV2FieldValueSchema } from "./schemas.js";
import { GithubClientError, type GithubClientIssue } from "./errors.js";

export interface ProjectHandle {
  readonly id: string;
}

export interface OperationResult {
  readonly ok: boolean;
  readonly warnings: readonly GithubWarning[];
}

export type ProjectFieldValue = { readonly kind: "number"; readonly value: number } | { readonly kind: "singleSelect"; readonly option: string };

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// Resolved lazily once per owner+number, never invalidated (design decision
// #12). Scoped per ClientContext instance via WeakMap so independent test
// contexts (and, in production, independent CLI runs) never share state.
const resolvedProjectHandles = new WeakMap<ClientContext, Map<string, ProjectHandle>>();

function projectNotFoundIssue(owner: string, number: number): GithubClientIssue {
  return {
    code: "project-not-found",
    operation: "resolveProject",
    message: `No Project v2 numbered ${number} was found for owner "${owner}".`,
    suggestion: "Verify the project number and that the token's owner (user or organization) matches.",
  };
}

// One query, both owner kinds queried via inline fragments (design decision
// #11) — the owner's kind (user vs organization) is unknown up front.
export async function resolveProject(ctx: ClientContext, owner: string, number: number): Promise<ProjectHandle> {
  const cache = resolvedProjectHandles.get(ctx) ?? new Map<string, ProjectHandle>();
  resolvedProjectHandles.set(ctx, cache);

  const cacheKey = `${owner}#${number}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const data = await ctx.gql(
    "resolveProject",
    (gql) => gql(RESOLVE_PROJECT_V2_QUERY, { owner, number }),
    resolveProjectV2Schema,
  );

  const project = data.repositoryOwner?.projectV2;
  if (project === null || project === undefined) {
    throw new GithubClientError([projectNotFoundIssue(owner, number)]);
  }

  const handle: ProjectHandle = { id: project.id };
  cache.set(cacheKey, handle);

  const fields: Map<string, ProjectField> = new Map();
  for (const node of project.fields.nodes) {
    fields.set(normalizeName(node.name), { id: node.id, name: node.name, dataType: node.dataType, options: node.options });
  }
  ctx.projectFieldCache.set(project.id, fields);

  return handle;
}

export async function addItemToProject(
  ctx: ClientContext,
  project: ProjectHandle,
  content: IssueRef,
): Promise<{ readonly itemId: string } & OperationResult> {
  const data = await ctx.gql(
    "addItemToProject",
    (gql) => gql(ADD_PROJECT_V2_ITEM_MUTATION, { projectId: project.id, contentId: content.nodeId }),
    addProjectV2ItemSchema,
  );

  return { itemId: data.addProjectV2ItemById.item.id, ok: true, warnings: [] };
}

function unknownFieldWarning(operation: string, field: string): GithubWarning {
  return {
    code: "unknown-project-field",
    operation,
    field,
    message: `Project field "${field}" was not found in the cached schema.`,
    suggestion: "Check the field's exact name in the GitHub Project, or add it there.",
  };
}

function unknownOptionWarning(operation: string, field: string, option: string): GithubWarning {
  return {
    code: "unknown-project-field-option",
    operation,
    field,
    message: `Option "${option}" was not found for single-select field "${field}".`,
    suggestion: "Check the option's exact name in the Project's field settings.",
  };
}

function unsupportedTypeWarning(operation: string, field: string, dataType: string): GithubWarning {
  return {
    code: "unsupported-project-field-type",
    operation,
    field,
    message: `Field "${field}" has type ${dataType}, which does not match the provided value.`,
    suggestion: "Verify the field's type in the Project and adjust the value kind accordingly.",
  };
}

type FieldValueResolution =
  | { readonly ok: true; readonly input: { readonly number: number } | { readonly singleSelectOptionId: string } }
  | { readonly ok: false; readonly warning: GithubWarning };

function resolveFieldValueInput(
  value: ProjectFieldValue,
  field: ProjectField,
  operation: string,
  fieldName: string,
): FieldValueResolution {
  if (value.kind === "number") {
    if (field.dataType !== "NUMBER") return { ok: false, warning: unsupportedTypeWarning(operation, fieldName, field.dataType) };
    return { ok: true, input: { number: value.value } };
  }

  if (field.dataType !== "SINGLE_SELECT") {
    return { ok: false, warning: unsupportedTypeWarning(operation, fieldName, field.dataType) };
  }

  const option = field.options?.find((candidate) => normalizeName(candidate.name) === normalizeName(value.option));
  if (option === undefined) return { ok: false, warning: unknownOptionWarning(operation, fieldName, value.option) };

  return { ok: true, input: { singleSelectOptionId: option.id } };
}

function fieldSchemaFor(ctx: ClientContext, project: ProjectHandle): ProjectFieldSchema {
  return ctx.projectFieldCache.get(project.id) ?? new Map();
}

// Never throws for a recoverable field issue (US-04 AC3): unknown field or
// option, or a value kind that doesn't match the field's type, all warn via
// `ctx.warn()` and return `ok: true` so the caller keeps processing the
// remaining fields (design decision #13).
export async function setFieldValue(
  ctx: ClientContext,
  project: ProjectHandle,
  itemId: string,
  fieldName: string,
  value: ProjectFieldValue,
): Promise<OperationResult> {
  const operation = "setFieldValue";
  const field = fieldSchemaFor(ctx, project).get(normalizeName(fieldName));

  if (field === undefined) {
    const warning = unknownFieldWarning(operation, fieldName);
    ctx.warn(warning);
    return { ok: true, warnings: [warning] };
  }

  const resolved = resolveFieldValueInput(value, field, operation, fieldName);
  if (!resolved.ok) {
    ctx.warn(resolved.warning);
    return { ok: true, warnings: [resolved.warning] };
  }

  await ctx.gql(
    operation,
    (gql) =>
      gql(SET_PROJECT_V2_FIELD_VALUE_MUTATION, {
        projectId: project.id,
        itemId,
        fieldId: field.id,
        value: resolved.input,
      }),
    setProjectV2FieldValueSchema,
  );

  return { ok: true, warnings: [] };
}

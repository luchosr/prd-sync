import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./client.js";
import type { GithubWarning } from "./errors.js";
import { addItemToProject, resolveProject, setFieldValue } from "./projects.js";
import { createGithubServer, graphqlOperation, HttpResponse } from "./test-support.js";

const server = createGithubServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const REPO = { owner: "luchosr", repo: "prd-sync" };

const PROJECT_FIELDS = [
  { id: "FIELD_ESTIMATE", name: "Estimate", dataType: "NUMBER" },
  {
    id: "FIELD_PRIORITY",
    name: "Priority",
    dataType: "SINGLE_SELECT",
    options: [
      { id: "OPT_HIGH", name: "High" },
      { id: "OPT_LOW", name: "Low" },
    ],
  },
];

function resolveProjectHandler(onCall?: () => void) {
  return graphqlOperation("query", "ResolveProjectV2", ({ variables }) => {
    onCall?.();
    expect(variables).toEqual({ owner: "octo-org", number: 7 });
    return HttpResponse.json({
      data: { repositoryOwner: { projectV2: { id: "PROJECT_ID_1", fields: { nodes: PROJECT_FIELDS } } } },
    });
  });
}

describe("resolveProject", () => {
  it("resolves the project id from owner and number in one round trip", async () => {
    server.use(resolveProjectHandler());
    const ctx = createClient({ auth: "token", repo: REPO });

    const handle = await resolveProject(ctx, "octo-org", 7);

    expect(handle).toEqual({ id: "PROJECT_ID_1" });
  });

  it("issues only one schema-resolving request when queried twice for the same owner/number", async () => {
    let calls = 0;
    server.use(resolveProjectHandler(() => (calls += 1)));
    const ctx = createClient({ auth: "token", repo: REPO });

    await resolveProject(ctx, "octo-org", 7);
    await resolveProject(ctx, "octo-org", 7);

    expect(calls).toBe(1);
  });
});

describe("addItemToProject", () => {
  it("adds the issue's node id as a project item and returns the new item id", async () => {
    server.use(
      resolveProjectHandler(),
      graphqlOperation("mutation", "AddProjectV2Item", ({ variables }) => {
        expect(variables).toEqual({ projectId: "PROJECT_ID_1", contentId: "ISSUE_NODE_1" });
        return HttpResponse.json({ data: { addProjectV2ItemById: { item: { id: "ITEM_ID_1" } } } });
      }),
    );
    const ctx = createClient({ auth: "token", repo: REPO });
    const project = await resolveProject(ctx, "octo-org", 7);

    const result = await addItemToProject(ctx, project, { number: 1, id: 100, nodeId: "ISSUE_NODE_1" });

    expect(result).toEqual({ itemId: "ITEM_ID_1", ok: true, warnings: [] });
  });
});

describe("setFieldValue", () => {
  it("sets a known number field with a { number } value shape", async () => {
    server.use(
      resolveProjectHandler(),
      graphqlOperation("mutation", "SetProjectV2FieldValue", ({ variables }) => {
        expect(variables).toEqual({
          projectId: "PROJECT_ID_1",
          itemId: "ITEM_ID_1",
          fieldId: "FIELD_ESTIMATE",
          value: { number: 3 },
        });
        return HttpResponse.json({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_ID_1" } } } });
      }),
    );
    const ctx = createClient({ auth: "token", repo: REPO });
    const project = await resolveProject(ctx, "octo-org", 7);

    const result = await setFieldValue(ctx, project, "ITEM_ID_1", "Estimate", { kind: "number", value: 3 });

    expect(result).toEqual({ ok: true, warnings: [] });
  });

  it("sets a known single-select field with the option's id, case-insensitively", async () => {
    server.use(
      resolveProjectHandler(),
      graphqlOperation("mutation", "SetProjectV2FieldValue", ({ variables }) => {
        expect(variables).toEqual({
          projectId: "PROJECT_ID_1",
          itemId: "ITEM_ID_1",
          fieldId: "FIELD_PRIORITY",
          value: { singleSelectOptionId: "OPT_HIGH" },
        });
        return HttpResponse.json({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_ID_1" } } } });
      }),
    );
    const ctx = createClient({ auth: "token", repo: REPO });
    const project = await resolveProject(ctx, "octo-org", 7);

    const result = await setFieldValue(ctx, project, "ITEM_ID_1", "priority", { kind: "singleSelect", option: "high" });

    expect(result).toEqual({ ok: true, warnings: [] });
  });

  it.each([
    { field: "Sprint", value: { kind: "number", value: 1 } as const, code: "unknown-project-field" },
    { field: "Priority", value: { kind: "singleSelect", option: "Urgent" } as const, code: "unknown-project-field-option" },
    { field: "Estimate", value: { kind: "singleSelect", option: "High" } as const, code: "unsupported-project-field-type" },
  ])("warns $code and continues without throwing (US-04 AC3)", async ({ field, value, code }) => {
    server.use(resolveProjectHandler());
    const ctx = createClient({ auth: "token", repo: REPO });
    const project = await resolveProject(ctx, "octo-org", 7);

    const result = await setFieldValue(ctx, project, "ITEM_ID_1", field, value);

    expect(result.ok).toBe(true);
    expect(result.warnings[0]?.code).toBe(code);
  });

  it("forwards field warnings to the onWarning callback", async () => {
    server.use(resolveProjectHandler());
    const received: GithubWarning[] = [];
    const ctx = createClient({ auth: "token", repo: REPO, onWarning: (w) => received.push(w) });
    const project = await resolveProject(ctx, "octo-org", 7);

    await setFieldValue(ctx, project, "ITEM_ID_1", "Sprint", { kind: "number", value: 1 });

    expect(received).toEqual([expect.objectContaining({ code: "unknown-project-field" })]);
  });
});

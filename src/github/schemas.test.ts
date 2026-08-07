import { describe, expect, it } from "vitest";
import { GithubClientError } from "./errors.js";
import {
  addProjectV2ItemSchema,
  addSubIssueSchema,
  githubIssueListItemSchema,
  githubIssueSchema,
  parseGithubResponse,
  resolveProjectV2Schema,
  setProjectV2FieldValueSchema,
} from "./schemas.js";

describe("githubIssueSchema", () => {
  it("parses a REST issue create/update response, keeping number, id, and node_id", () => {
    const parsed = githubIssueSchema.parse({
      number: 42,
      id: 1234567,
      node_id: "I_kwDOAbc123",
      title: "Do the thing",
    });

    expect(parsed).toEqual({ number: 42, id: 1234567, node_id: "I_kwDOAbc123" });
  });

  it("also validates a sub-issue link response, which reuses the same issue shape", () => {
    const parsed = githubIssueSchema.parse({ number: 7, id: 42, node_id: "I_kwDOchild" });

    expect(parsed.id).toBe(42);
  });
});

describe("githubIssueListItemSchema", () => {
  const base = { number: 1, id: 1, node_id: "I_a", title: "Story", state: "open", labels: [] };

  it("parses a string body", () => {
    const parsed = githubIssueListItemSchema.parse({ ...base, body: "Some description" });

    expect(parsed.body).toBe("Some description");
  });

  it("parses a null body (issue with an empty body)", () => {
    const parsed = githubIssueListItemSchema.parse({ ...base, body: null });

    expect(parsed.body).toBeNull();
  });

  it("parses as undefined when the field is absent from the payload (D1 three-way distinction)", () => {
    const parsed = githubIssueListItemSchema.parse(base);

    expect(parsed.body).toBeUndefined();
  });
});

describe("resolveProjectV2Schema", () => {
  it("parses a project with a single-select and a number field", () => {
    const parsed = resolveProjectV2Schema.parse({
      repositoryOwner: {
        projectV2: {
          id: "PVT_kwHOproject",
          fields: {
            nodes: [
              { id: "PVTF_1", name: "Priority", dataType: "SINGLE_SELECT", options: [{ id: "opt1", name: "P0" }] },
              { id: "PVTF_2", name: "Estimate", dataType: "NUMBER" },
            ],
          },
        },
      },
    });

    expect(parsed.repositoryOwner?.projectV2?.fields.nodes).toHaveLength(2);
    expect(parsed.repositoryOwner?.projectV2?.fields.nodes[0]?.options?.[0]?.name).toBe("P0");
  });

  it("parses a missing project as null, distinguishing not-found from malformed", () => {
    const parsed = resolveProjectV2Schema.parse({ repositoryOwner: { projectV2: null } });

    expect(parsed.repositoryOwner?.projectV2).toBeNull();
  });
});

describe("addSubIssueSchema", () => {
  it("parses the addSubIssue mutation payload", () => {
    const parsed = addSubIssueSchema.parse({
      addSubIssue: { subIssue: { id: "I_kwDOchild", number: 7 } },
    });

    expect(parsed.addSubIssue.subIssue).toEqual({ id: "I_kwDOchild", number: 7 });
  });
});

describe("addProjectV2ItemSchema", () => {
  it("parses the addProjectV2ItemById mutation payload", () => {
    const parsed = addProjectV2ItemSchema.parse({
      addProjectV2ItemById: { item: { id: "PVTI_item1" } },
    });

    expect(parsed.addProjectV2ItemById.item.id).toBe("PVTI_item1");
  });
});

describe("setProjectV2FieldValueSchema", () => {
  it("parses the updateProjectV2ItemFieldValue mutation payload", () => {
    const parsed = setProjectV2FieldValueSchema.parse({
      updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_item1" } },
    });

    expect(parsed.updateProjectV2ItemFieldValue.projectV2Item.id).toBe("PVTI_item1");
  });
});

describe("parseGithubResponse", () => {
  it("returns the typed value when the payload matches the schema", () => {
    const result = parseGithubResponse(githubIssueSchema, "createIssue", {
      number: 1,
      id: 2,
      node_id: "I_a",
    });

    expect(result).toEqual({ number: 1, id: 2, node_id: "I_a" });
  });

  it("throws GithubClientError with code unexpected-response naming the operation on a malformed payload", () => {
    try {
      parseGithubResponse(githubIssueSchema, "createIssue", { number: "not-a-number" });
      throw new Error("expected parseGithubResponse to throw");
    } catch (error) {
      if (!(error instanceof GithubClientError)) throw error;
      expect(error.issues[0]?.code).toBe("unexpected-response");
      expect(error.operation).toBe("createIssue");
      expect(error.message).toContain("createIssue");
    }
  });

  it("throws unexpected-response naming a different operation for a different malformed payload", () => {
    try {
      parseGithubResponse(addProjectV2ItemSchema, "addItemToProject", { addProjectV2ItemById: {} });
      throw new Error("expected parseGithubResponse to throw");
    } catch (error) {
      if (!(error instanceof GithubClientError)) throw error;
      expect(error.operation).toBe("addItemToProject");
    }
  });
});

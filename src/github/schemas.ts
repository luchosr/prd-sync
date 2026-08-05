import { z, type ZodType } from "zod";
import { GithubClientError } from "./errors.js";

// REST — issue create/update response, and the sub-issue link response
// (GitHub returns the linked child issue with the same shape).
export const githubIssueSchema = z.object({
  number: z.number(),
  id: z.number(),
  node_id: z.string(),
});

// REST — GET /repos/{owner}/{repo}/issues (listSyncedIssues, PR3). Labels
// come back as full objects; only the name is kept.
export const githubIssueListItemSchema = z.object({
  number: z.number(),
  id: z.number(),
  node_id: z.string(),
  title: z.string(),
  state: z.string(),
  labels: z.array(z.union([z.string(), z.object({ name: z.string().optional() })])),
});

export const listIssuesResponseSchema = z.array(githubIssueListItemSchema);

// GraphQL — named operations, matching the documents in queries.ts (PR3).
// Field/option ids stay opaque strings; only the shape used to build the
// field cache (design decision #12) is validated here.
const projectV2FieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataType: z.string(),
  options: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});

export const resolveProjectV2Schema = z.object({
  repositoryOwner: z
    .object({
      projectV2: z
        .object({
          id: z.string(),
          fields: z.object({ nodes: z.array(projectV2FieldSchema) }),
        })
        .nullable(),
    })
    .nullable(),
});

export const addSubIssueSchema = z.object({
  addSubIssue: z.object({
    subIssue: z.object({ id: z.string(), number: z.number() }),
  }),
});

export const addProjectV2ItemSchema = z.object({
  addProjectV2ItemById: z.object({
    item: z.object({ id: z.string() }),
  }),
});

export const setProjectV2FieldValueSchema = z.object({
  updateProjectV2ItemFieldValue: z.object({
    projectV2Item: z.object({ id: z.string() }),
  }),
});

// The only place a REST/GraphQL payload is narrowed from `unknown`. Callers
// (client.ts, PR2) hand the raw response straight through — a malformed
// payload becomes a structured, operation-named GithubClientError instead
// of an unchecked cast.
export function parseGithubResponse<T>(schema: ZodType<T>, operation: string, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new GithubClientError([
      {
        code: "unexpected-response",
        operation,
        message: `Response for ${operation} did not match the expected shape: ${result.error.message}`,
        suggestion: "GitHub's API may have changed; check the payload against src/github/schemas.ts.",
      },
    ]);
  }

  return result.data;
}

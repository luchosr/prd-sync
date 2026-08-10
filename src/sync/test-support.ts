// In-memory GitHub fake shared by apply.test.ts and idempotency.test.ts
// (design §8's test strategy, L6): a real `ClientContext` (via
// `createClient`) talks to these msw handlers exactly as it would talk to
// GitHub, so nothing here simulates what `apply()`/`sync()` do — it only
// stores what real POST/PATCH calls send and serves it back on GET.
//
// Deliberately self-contained rather than importing e2's
// `src/github/test-support.ts`: `src/github/boundaries.test.ts` (PR1)
// already enforces "nothing outside src/github/** imports an internal
// src/github file directly (only index.ts is public)" with no test-file
// exemption, so reusing those helpers directly would fail that check. This
// is the same small (~25-line) msw-primitives duplication the design's own
// §11 L12 note already accepts for the boundary-scanner helper itself.
import { graphql, http, HttpResponse, type GraphQLResponseResolver, type HttpResponseResolver, type RequestHandler } from "msw";
import { setupServer } from "msw/node";

const GITHUB_REST = "https://api.github.com";
const githubGraphql = graphql.link("https://api.github.com/graphql");

export { HttpResponse };

function restGet(path: string, resolver: HttpResponseResolver): RequestHandler {
  return http.get(`${GITHUB_REST}${path}`, resolver);
}

function restPost(path: string, resolver: HttpResponseResolver): RequestHandler {
  return http.post(`${GITHUB_REST}${path}`, resolver);
}

function restPatch(path: string, resolver: HttpResponseResolver): RequestHandler {
  return http.patch(`${GITHUB_REST}${path}`, resolver);
}

export function graphqlOperation(kind: "query" | "mutation", operationName: string, resolver: GraphQLResponseResolver): RequestHandler {
  return kind === "query" ? githubGraphql.query(operationName, resolver) : githubGraphql.mutation(operationName, resolver);
}

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

function createRequestRecorder(): { requests: RecordedRequest[]; capture(request: Request): Promise<void> } {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    async capture(request: Request): Promise<void> {
      const contentType = request.headers.get("content-type") ?? "";
      const body = contentType.includes("json") ? await request.clone().json() : undefined;
      requests.push({ method: request.method, url: request.url, body });
    },
  };
}

export interface StoredIssue {
  number: number;
  id: number;
  nodeId: string;
  title: string;
  body: string | null;
  labels: string[];
  state: "open" | "closed";
}

interface CreateIssueBody {
  readonly title?: string;
  readonly body?: string;
  readonly labels?: readonly string[];
}

interface UpdateIssueBody {
  readonly title?: string;
  readonly body?: string;
  readonly labels?: readonly string[];
  readonly state?: "open" | "closed";
}

export interface SyncFakeGithub {
  readonly server: ReturnType<typeof setupServer>;
  readonly store: Map<number, StoredIssue>;
  readonly requests: RecordedRequest[];
  resetRequests(): void;
}

export function createSyncFakeGithub(): SyncFakeGithub {
  const store = new Map<number, StoredIssue>();
  const recorder = createRequestRecorder();
  let nextId = 1;

  const server = setupServer(
    restPost("/repos/:owner/:repo/issues", async ({ request }) => {
      await recorder.capture(request);
      const body = (await request.clone().json()) as CreateIssueBody;
      const id = nextId++;
      const issue: StoredIssue = {
        number: id,
        id,
        nodeId: `NODE_${id}`,
        title: body.title ?? "",
        body: body.body ?? null,
        labels: [...(body.labels ?? [])],
        state: "open",
      };
      store.set(issue.number, issue);
      return HttpResponse.json({ number: issue.number, id: issue.id, node_id: issue.nodeId });
    }),

    restPatch("/repos/:owner/:repo/issues/:issueNumber", async ({ request, params }) => {
      await recorder.capture(request);
      const number = Number(params.issueNumber);
      const existing = store.get(number);
      if (existing === undefined) return HttpResponse.json({ message: "Not Found" }, { status: 404 });

      const patch = (await request.clone().json()) as UpdateIssueBody;
      const updated: StoredIssue = {
        ...existing,
        title: patch.title ?? existing.title,
        body: patch.body ?? existing.body,
        labels: patch.labels === undefined ? existing.labels : [...patch.labels],
        state: patch.state ?? existing.state,
      };
      store.set(number, updated);
      return HttpResponse.json({ number: updated.number, id: updated.id, node_id: updated.nodeId });
    }),

    // Response content is never consumed by linkSubIssue (it resolves void
    // on any 2xx) — only that the call happened and where, which
    // `requests`/the store's absence of a link edge exercises elsewhere.
    restPost("/repos/:owner/:repo/issues/:issueNumber/sub_issues", async ({ request }) => {
      await recorder.capture(request);
      return HttpResponse.json({ number: 0, id: 0, node_id: "SUB_ISSUE_LINK_OK" });
    }),

    restGet("/repos/:owner/:repo/issues", ({ request }) => {
      const label = new URL(request.url).searchParams.get("labels");
      const issues = [...store.values()]
        .filter((issue) => label === null || issue.labels.includes(label))
        .map((issue) => ({
          number: issue.number,
          id: issue.id,
          node_id: issue.nodeId,
          title: issue.title,
          state: issue.state,
          labels: issue.labels.map((name) => ({ name })),
          body: issue.body,
        }));
      return HttpResponse.json(issues);
    }),

    // Fixed Project v2 fields (Priority: single-select P0-P3, Estimate:
    // number) — enough for apply.test.ts's project-step scenarios. A test
    // that needs resolveProject to fail overrides this one route with
    // `server.use(...)`, matching e2's own per-test override convention.
    graphqlOperation("query", "ResolveProjectV2", () =>
      HttpResponse.json({
        data: {
          repositoryOwner: {
            projectV2: {
              id: "PROJECT_1",
              fields: {
                nodes: [
                  {
                    id: "FIELD_PRIORITY",
                    name: "Priority",
                    dataType: "SINGLE_SELECT",
                    options: ["P0", "P1", "P2", "P3"].map((p) => ({ id: `OPT_${p}`, name: p })),
                  },
                  { id: "FIELD_ESTIMATE", name: "Estimate", dataType: "NUMBER" },
                ],
              },
            },
          },
        },
      }),
    ),
    graphqlOperation("mutation", "AddProjectV2Item", () =>
      HttpResponse.json({ data: { addProjectV2ItemById: { item: { id: "ITEM_1" } } } }),
    ),
    graphqlOperation("mutation", "SetProjectV2FieldValue", () =>
      HttpResponse.json({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "ITEM_1" } } } }),
    ),
  );

  return {
    server,
    store,
    requests: recorder.requests,
    resetRequests(): void {
      recorder.requests.length = 0;
    },
  };
}

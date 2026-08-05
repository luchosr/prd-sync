// msw-based mocking for src/github/**'s tests. Internal only — never
// exported from index.ts (PR4); production code never imports this file.
import { graphql, http, HttpResponse, type GraphQLResponseResolver, type HttpResponseResolver, type RequestHandler } from "msw";
import { setupServer } from "msw/node";

const GITHUB_REST = "https://api.github.com";
const githubGraphql = graphql.link("https://api.github.com/graphql");

export { HttpResponse };

export function restGet(path: string, resolver: HttpResponseResolver): RequestHandler {
  return http.get(`${GITHUB_REST}${path}`, resolver);
}

export function restPost(path: string, resolver: HttpResponseResolver): RequestHandler {
  return http.post(`${GITHUB_REST}${path}`, resolver);
}

export function restPatch(path: string, resolver: HttpResponseResolver): RequestHandler {
  return http.patch(`${GITHUB_REST}${path}`, resolver);
}

// Design decision #15: every GraphQL mock matches a *named* operation —
// `graphql.query("Op")` / `graphql.mutation("Op")` — never an anonymous
// query string. Mirrors the named documents queries.ts (PR3) will define.
export function graphqlOperation(
  kind: "query" | "mutation",
  operationName: string,
  resolver: GraphQLResponseResolver,
): RequestHandler {
  return kind === "query" ? githubGraphql.query(operationName, resolver) : githubGraphql.mutation(operationName, resolver);
}

export function createGithubServer(...handlers: RequestHandler[]) {
  return setupServer(...handlers);
}

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

// Captures the exact JSON body msw's resolver saw on the wire — used to
// assert e.g. linkSubIssue's REST body is exactly `{ sub_issue_id: child.id }`
// (PR3), not `number` or `nodeId`.
export function createRequestRecorder(): { requests: RecordedRequest[]; capture(request: Request): Promise<void> } {
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

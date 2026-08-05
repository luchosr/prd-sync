import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTransport, lowerCaseHeaders, normalizeFailure } from "./transport.js";
import { createGithubServer, HttpResponse, graphqlOperation, restGet } from "./test-support.js";

describe("normalizeFailure", () => {
  it("normalizes a REST RequestError-shaped failure (status + response.headers)", () => {
    const fakeRequestError = {
      name: "HttpError",
      message: "Forbidden",
      status: 403,
      response: { headers: { "retry-after": "30", "x-github-request-id": "ABCD:1234" } },
    };

    expect(normalizeFailure(fakeRequestError)).toEqual({
      source: "http",
      status: 403,
      headers: { "retry-after": "30", "x-github-request-id": "ABCD:1234" },
      message: "Forbidden",
    });
  });

  it("normalizes a GraphqlResponseError-shaped failure (HTTP 200 + errors[])", () => {
    const fakeGraphqlError = {
      name: "GraphqlResponseError",
      message: "Something went wrong",
      headers: { "x-github-request-id": "EFGH:5678" },
      errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
    };

    expect(normalizeFailure(fakeGraphqlError)).toEqual({
      source: "graphql",
      headers: { "x-github-request-id": "EFGH:5678" },
      message: "API rate limit exceeded",
      graphqlErrorCode: "RATE_LIMITED",
    });
  });

  it("normalizes a plain network error (no status, no errors[]) as source: network", () => {
    const networkError = new TypeError("fetch failed");

    const result = normalizeFailure(networkError);

    expect(result).toEqual({ source: "network", message: "fetch failed" });
  });

  it("normalizes a non-object thrown value without crashing", () => {
    expect(normalizeFailure("boom")).toEqual({ source: "network", message: "boom" });
  });
});

describe("lowerCaseHeaders", () => {
  it("lower-cases header keys and stringifies numeric values", () => {
    expect(lowerCaseHeaders({ "X-RateLimit-Remaining": "0", "Content-Length": 42 })).toEqual({
      "x-ratelimit-remaining": "0",
      "content-length": "42",
    });
  });

  it("returns an empty map for non-object input", () => {
    expect(lowerCaseHeaders(undefined)).toEqual({});
  });
});

describe("createTransport — real Octokit + msw", () => {
  const server = createGithubServer();

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("plugin-retry never swallows a doNotRetry status (429) — the owned queue must see it, not an internal retry loop", async () => {
    let requestCount = 0;
    server.use(
      restGet("/user", () => {
        requestCount += 1;
        return HttpResponse.json({ message: "rate limited" }, { status: 429 });
      }),
    );

    const transport = createTransport("classic-pat-token");

    await expect(transport.rest.request("GET /user")).rejects.toMatchObject({ status: 429 });
    expect(requestCount).toBe(1);
  });

  it("sends the classic PAT as a bearer token on REST requests", async () => {
    let capturedAuth: string | null = null;
    server.use(
      restGet("/user", ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return HttpResponse.json({ login: "octocat" });
      }),
    );

    const transport = createTransport("classic-pat-token");
    await transport.rest.request("GET /user");

    expect(capturedAuth).toBe("token classic-pat-token");
  });

  it("sends the classic PAT as a bearer token on GraphQL requests, matched by named operation", async () => {
    let capturedAuth: string | null = null;
    server.use(
      graphqlOperation("query", "Viewer", ({ request }) => {
        capturedAuth = request.headers.get("authorization");
        return HttpResponse.json({ data: { viewer: { login: "octocat" } } });
      }),
    );

    const transport = createTransport("classic-pat-token");
    await transport.gql("query Viewer { viewer { login } }");

    expect(capturedAuth).toBe("token classic-pat-token");
  });

  it("real RequestError from a 403+retry-after normalizes to a retryable NormalizedFailure", async () => {
    server.use(
      restGet("/user", () =>
        HttpResponse.json({ message: "secondary rate limit" }, { status: 403, headers: { "retry-after": "30" } }),
      ),
    );

    const transport = createTransport("classic-pat-token");
    let caught: unknown;
    try {
      await transport.rest.request("GET /user");
    } catch (error) {
      caught = error;
    }

    expect(normalizeFailure(caught)).toMatchObject({
      source: "http",
      status: 403,
      headers: { "retry-after": "30" },
    });
  });

  it("real GraphqlResponseError from a 200+errors[] response normalizes to source: graphql", async () => {
    // GitHub's GraphQL API includes a `type` field on each error (e.g.
    // "FORBIDDEN") that graphql-js's own `GraphQLError` type doesn't
    // declare — assign through a variable so msw's strict literal check
    // doesn't reject GitHub's real, wider shape.
    const forbiddenErrorPayload = { errors: [{ type: "FORBIDDEN", message: "Resource not accessible" }] };
    server.use(graphqlOperation("mutation", "AddSubIssue", () => HttpResponse.json(forbiddenErrorPayload)));

    const transport = createTransport("classic-pat-token");
    let caught: unknown;
    try {
      await transport.gql("mutation AddSubIssue { addSubIssue(input: {}) { subIssue { id } } }");
    } catch (error) {
      caught = error;
    }

    expect(normalizeFailure(caught)).toMatchObject({
      source: "graphql",
      graphqlErrorCode: "FORBIDDEN",
      message: "Resource not accessible",
    });
  });
});

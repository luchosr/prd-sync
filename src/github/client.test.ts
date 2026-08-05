import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createClient } from "./client.js";
import { GithubClientError } from "./errors.js";
import { createGithubServer, HttpResponse, graphqlOperation, restGet } from "./test-support.js";

const server = createGithubServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const REPO = { owner: "luchosr", repo: "prd-sync" };

function recorderSleep() {
  const delays: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
  };
  return { delays, sleep };
}

describe("createClient / rest", () => {
  it("returns validated data and lower-cased headers on success", async () => {
    server.use(
      restGet("/user", () =>
        HttpResponse.json({ login: "luchosr" }, { headers: { "X-OAuth-Scopes": "repo, project" } }),
      ),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    const result = await ctx.rest("getUser", (octokit) => octokit.request("GET /user"), z.object({ login: z.string() }));

    expect(result.data).toEqual({ login: "luchosr" });
    expect(result.headers["x-oauth-scopes"]).toBe("repo, project");
  });

  it("retries a 500 via the owned queue and succeeds once the server recovers", async () => {
    let calls = 0;
    server.use(
      restGet("/user", () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ message: "boom" }, { status: 500 });
        return HttpResponse.json({ login: "luchosr" });
      }),
    );
    const { sleep } = recorderSleep();
    const ctx = createClient({ auth: "token", repo: REPO, queue: { throttleMs: 0, sleep, now: () => 0 } });

    const result = await ctx.rest("getUser", (octokit) => octokit.request("GET /user"), z.object({ login: z.string() }));

    expect(calls).toBe(2);
    expect(result.data).toEqual({ login: "luchosr" });
  });

  it("fails fast with GithubClientError on a plain permission 403, without retrying", async () => {
    let calls = 0;
    server.use(
      restGet("/user", () => {
        calls += 1;
        return HttpResponse.json({ message: "Resource not accessible by integration" }, { status: 403 });
      }),
    );
    const { sleep } = recorderSleep();
    const ctx = createClient({ auth: "token", repo: REPO, queue: { throttleMs: 0, sleep, now: () => 0 } });

    await expect(ctx.rest("getUser", (octokit) => octokit.request("GET /user"), z.object({ login: z.string() }))).rejects.toThrow(
      GithubClientError,
    );
    expect(calls).toBe(1);
  });

  it("wraps a schema mismatch as GithubClientError without retrying", async () => {
    let calls = 0;
    server.use(
      restGet("/user", () => {
        calls += 1;
        return HttpResponse.json({ nope: true });
      }),
    );
    const { sleep } = recorderSleep();
    const ctx = createClient({ auth: "token", repo: REPO, queue: { throttleMs: 0, sleep, now: () => 0 } });

    const error = await ctx
      .rest("getUser", (octokit) => octokit.request("GET /user"), z.object({ login: z.string() }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GithubClientError);
    expect((error as GithubClientError).issues[0]?.code).toBe("unexpected-response");
    expect(calls).toBe(1);
  });
});

describe("createClient / gql", () => {
  it("returns validated data from a named GraphQL operation", async () => {
    server.use(
      graphqlOperation("query", "Viewer", () => HttpResponse.json({ data: { viewer: { login: "luchosr" } } })),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    const result = await ctx.gql(
      "getViewer",
      (gql) => gql(`query Viewer { viewer { login } }`),
      z.object({ viewer: z.object({ login: z.string() }) }),
    );

    expect(result).toEqual({ viewer: { login: "luchosr" } });
  });
});

describe("createClient / warn", () => {
  it("forwards warnings to the onWarning callback", () => {
    const received: unknown[] = [];
    const ctx = createClient({ auth: "token", repo: REPO, onWarning: (w) => received.push(w) });

    ctx.warn({
      code: "unknown-project-field",
      operation: "setFieldValue",
      field: "Sprint",
      message: "Field not found",
      suggestion: "Check the Project's field names.",
    });

    expect(received).toHaveLength(1);
  });

  it("is a no-op when no onWarning callback is provided", () => {
    const ctx = createClient({ auth: "token", repo: REPO });

    expect(() =>
      ctx.warn({
        code: "unknown-project-field",
        operation: "setFieldValue",
        field: "Sprint",
        message: "Field not found",
        suggestion: "Check the Project's field names.",
      }),
    ).not.toThrow();
  });
});

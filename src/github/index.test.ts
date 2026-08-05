// Import-surface smoke test (task 4.2): exercises `assertAuth` and
// `createIssue` through the public entry point only — never reaching into
// `./client.js`, `./auth.js`, or `./issues.js` directly. If this file
// compiled while importing internals it would defeat the point; every
// import below must resolve through `./index.js`.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertAuth, createClient, createIssue, GithubClientError } from "./index.js";
import { createGithubServer, HttpResponse, restGet, restPost } from "./test-support.js";

const server = createGithubServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const REPO = { owner: "luchosr", repo: "prd-sync" };

describe("public surface (src/github/index.ts)", () => {
  it("assertAuth resolves for a token with the required scopes, then createIssue returns an IssueRef", async () => {
    server.use(
      restGet("/user", () =>
        HttpResponse.json({ login: "luchosr" }, { headers: { "X-OAuth-Scopes": "repo, project" } }),
      ),
      restPost("/repos/:owner/:repo/issues", () =>
        HttpResponse.json({ number: 1, id: 100, node_id: "ISSUE_NODE_1" }),
      ),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    await expect(assertAuth(ctx)).resolves.toBeUndefined();
    const issue = await createIssue(ctx, { title: "Story" });

    expect(issue).toEqual({ number: 1, id: 100, nodeId: "ISSUE_NODE_1" });
  });

  it("surfaces a missing-scope failure as GithubClientError through the public surface", async () => {
    server.use(restGet("/user", () => HttpResponse.json({ login: "luchosr" }, { headers: { "x-oauth-scopes": "repo" } })));
    const ctx = createClient({ auth: "token", repo: REPO });

    const error = await assertAuth(ctx).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GithubClientError);
  });
});

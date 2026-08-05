import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { assertAuth } from "./auth.js";
import { createQueue } from "./queue.js";
import { createTransport, lowerCaseHeaders, normalizeFailure } from "./transport.js";
import { createGithubServer, HttpResponse, restGet } from "./test-support.js";
import { GithubClientError } from "./errors.js";
import type { ClientContext } from "./context.js";

// A minimal, real (not faked) ClientContext — wires transport.ts + queue.ts
// exactly like client.ts (below) will, but scoped to this test file so
// auth.test.ts doesn't depend on client.ts's existence or internals.
function buildTestContext(auth: string): ClientContext {
  const transport = createTransport(auth);
  const queue = createQueue({ sleep: async () => undefined });

  return {
    repo: { owner: "octo-org", repo: "octo-repo" },
    projectFieldCache: new Map(),
    async rest(operation, request, schema) {
      const response = await queue.enqueue(operation, async () => {
        try {
          return await request(transport.rest);
        } catch (error) {
          throw normalizeFailure(error);
        }
      });
      return { data: schema.parse(response.data), headers: lowerCaseHeaders(response.headers) };
    },
    async gql(operation, request, schema) {
      const data = await queue.enqueue(operation, async () => {
        try {
          return await request(transport.gql);
        } catch (error) {
          throw normalizeFailure(error);
        }
      });
      return schema.parse(data);
    },
    warn: () => undefined,
  };
}

describe("assertAuth", () => {
  const server = createGithubServer();

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("resolves without error for a classic PAT with repo and project scopes", async () => {
    server.use(
      restGet("/user", () =>
        HttpResponse.json({ login: "octocat" }, { headers: { "x-oauth-scopes": "repo, project, read:org" } }),
      ),
    );

    await expect(assertAuth(buildTestContext("classic-pat"))).resolves.toBeUndefined();
  });

  it("throws GithubClientError naming the missing scope when project is absent", async () => {
    server.use(
      restGet("/user", () => HttpResponse.json({ login: "octocat" }, { headers: { "x-oauth-scopes": "repo" } })),
    );

    const error = await assertAuth(buildTestContext("classic-pat")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GithubClientError);
    if (error instanceof GithubClientError) {
      expect(error.issues[0]?.code).toBe("insufficient-scopes");
      expect(error.message).toContain("project");
    }
  });

  it("throws GithubClientError naming both missing scopes when neither is present", async () => {
    server.use(
      restGet("/user", () => HttpResponse.json({ login: "octocat" }, { headers: { "x-oauth-scopes": "read:org" } })),
    );

    const error = await assertAuth(buildTestContext("classic-pat")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GithubClientError);
    if (error instanceof GithubClientError) {
      expect(error.message).toContain("repo");
      expect(error.message).toContain("project");
    }
  });

  it("throws GithubClientError stating classic PATs are required when X-OAuth-Scopes is absent (fine-grained PAT)", async () => {
    server.use(restGet("/user", () => HttpResponse.json({ login: "octocat" })));

    const error = await assertAuth(buildTestContext("fine-grained-pat")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GithubClientError);
    if (error instanceof GithubClientError) {
      expect(error.message).toMatch(/classic PAT/i);
    }
  });

  it("throws GithubClientError with code auth-failed on a 401", async () => {
    server.use(restGet("/user", () => HttpResponse.json({ message: "Bad credentials" }, { status: 401 })));

    const error = await assertAuth(buildTestContext("bad-token")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GithubClientError);
    if (error instanceof GithubClientError) {
      expect(error.issues[0]?.code).toBe("auth-failed");
      expect(error.status).toBe(401);
    }
  });

  it("never leaks the Authorization header value in the thrown error", async () => {
    server.use(
      restGet("/user", () => HttpResponse.json({ login: "octocat" }, { headers: { "x-oauth-scopes": "repo" } })),
    );

    const error = await assertAuth(buildTestContext("super-secret-token")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GithubClientError);
    if (error instanceof GithubClientError) {
      expect(error.message).not.toContain("super-secret-token");
    }
  });
});

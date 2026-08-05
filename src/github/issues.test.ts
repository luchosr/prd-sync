import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./client.js";
import { GithubClientError } from "./errors.js";
import { createIssue, isSubIssueFeatureGap, linkSubIssue, listSyncedIssues, updateIssue, type IssueRef } from "./issues.js";
import {
  createGithubServer,
  createRequestRecorder,
  graphqlOperation,
  HttpResponse,
  restGet,
  restPatch,
  restPost,
} from "./test-support.js";

const server = createGithubServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const REPO = { owner: "luchosr", repo: "prd-sync" };
// Deliberately distinct so a number/id/nodeId swap fails loudly.
const PARENT: IssueRef = { number: 10, id: 100, nodeId: "PARENT_NODE" };
const CHILD: IssueRef = { number: 20, id: 200, nodeId: "CHILD_NODE" };

describe("createIssue", () => {
  it("returns the numeric number, numeric id, and string nodeId from the REST response", async () => {
    server.use(
      restPost("/repos/:owner/:repo/issues", () => HttpResponse.json({ number: 1, id: 100, node_id: "ISSUE_NODE_1" })),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    const result = await createIssue(ctx, { title: "Story" });

    expect(result).toEqual({ number: 1, id: 100, nodeId: "ISSUE_NODE_1" });
  });

  it("waits for the retry-after duration then succeeds on a 403 secondary-rate-limit response (US-05 AC1)", async () => {
    let calls = 0;
    server.use(
      restPost("/repos/:owner/:repo/issues", () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({ message: "secondary rate limit" }, { status: 403, headers: { "retry-after": "1" } });
        }
        return HttpResponse.json({ number: 1, id: 100, node_id: "NODE_1" });
      }),
    );
    const delays: number[] = [];
    const ctx = createClient({
      auth: "token",
      repo: REPO,
      queue: {
        throttleMs: 0,
        sleep: async (ms) => {
          delays.push(ms);
        },
        now: () => 0,
      },
    });

    const result = await createIssue(ctx, { title: "Story" });

    expect(result).toEqual({ number: 1, id: 100, nodeId: "NODE_1" });
    expect(calls).toBe(2);
    expect(delays).toEqual([1000]);
  });
});

describe("updateIssue", () => {
  it("PATCHes the given issue number and returns its refreshed IssueRef", async () => {
    server.use(
      restPatch("/repos/:owner/:repo/issues/:issueNumber", ({ params }) => {
        expect(params.issueNumber).toBe("5");
        return HttpResponse.json({ number: 5, id: 500, node_id: "ISSUE_NODE_5" });
      }),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    const result = await updateIssue(ctx, 5, { state: "closed" });

    expect(result).toEqual({ number: 5, id: 500, nodeId: "ISSUE_NODE_5" });
  });
});

describe("linkSubIssue", () => {
  it("sends the REST body with the child's internal id as sub_issue_id, using the parent's number in the path", async () => {
    const recorder = createRequestRecorder();
    server.use(
      restPost("/repos/:owner/:repo/issues/:issueNumber/sub_issues", async ({ request, params }) => {
        await recorder.capture(request);
        expect(params.issueNumber).toBe("10");
        return HttpResponse.json({ number: 20, id: 200, node_id: "CHILD_NODE" });
      }),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    await linkSubIssue(ctx, PARENT, CHILD);

    expect(recorder.requests).toHaveLength(1);
    expect(recorder.requests[0]?.body).toEqual({ sub_issue_id: 200 });
  });

  it.each([
    { message: "Issue is already a sub-issue", outcome: "idempotent" as const },
    { message: "Validation failed: child issue does not exist", outcome: "error" as const },
  ])("on REST 422 '$message', resolves as $outcome without calling GraphQL", async ({ message, outcome }) => {
    let graphqlCalls = 0;
    server.use(
      restPost("/repos/:owner/:repo/issues/:issueNumber/sub_issues", () => HttpResponse.json({ message }, { status: 422 })),
      graphqlOperation("mutation", "AddSubIssue", () => {
        graphqlCalls += 1;
        return HttpResponse.json({ data: { addSubIssue: { subIssue: { id: CHILD.nodeId, number: CHILD.number } } } });
      }),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    if (outcome === "idempotent") {
      await expect(linkSubIssue(ctx, PARENT, CHILD)).resolves.toBeUndefined();
    } else {
      const error = await linkSubIssue(ctx, PARENT, CHILD).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GithubClientError);
      expect((error as GithubClientError).issues[0]?.code).toBe("sub-issue-link-failed");
    }
    expect(graphqlCalls).toBe(0);
  });

  it("falls back to GraphQL addSubIssue with node ids on a 404, retrying once with the GraphQL-Features header after a feature-unavailable error (US-03 AC2)", async () => {
    let graphqlAttempts = 0;
    server.use(
      restPost("/repos/:owner/:repo/issues/:issueNumber/sub_issues", () =>
        HttpResponse.json({ message: "Not Found" }, { status: 404 }),
      ),
      graphqlOperation("mutation", "AddSubIssue", async ({ request, variables }) => {
        graphqlAttempts += 1;
        expect(variables).toEqual({ issueId: PARENT.nodeId, subIssueId: CHILD.nodeId });
        if (graphqlAttempts === 1) {
          expect(request.headers.get("graphql-features")).toBeNull();
          return HttpResponse.json({ errors: [{ message: "sub_issues feature is not available for this repository" }] });
        }
        expect(request.headers.get("graphql-features")).toBe("sub_issues");
        return HttpResponse.json({ data: { addSubIssue: { subIssue: { id: CHILD.nodeId, number: CHILD.number } } } });
      }),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    await expect(linkSubIssue(ctx, PARENT, CHILD)).resolves.toBeUndefined();
    expect(graphqlAttempts).toBe(2);
  });

  it("serializes 100 sub-issue links through the owned queue in strict arrival order (US-05 AC2)", async () => {
    const seen: number[] = [];
    server.use(
      restPost("/repos/:owner/:repo/issues/:issueNumber/sub_issues", async ({ request }) => {
        const body = (await request.clone().json()) as { sub_issue_id: number };
        seen.push(body.sub_issue_id);
        return HttpResponse.json({ number: PARENT.number, id: body.sub_issue_id, node_id: `NODE_${body.sub_issue_id}` });
      }),
    );
    const ctx = createClient({
      auth: "token",
      repo: REPO,
      queue: { throttleMs: 0, sleep: async () => undefined },
    });
    const children: IssueRef[] = Array.from({ length: 100 }, (_, i) => ({
      number: 1000 + i,
      id: 2000 + i,
      nodeId: `CHILD_${i}`,
    }));

    await Promise.all(children.map((child) => linkSubIssue(ctx, PARENT, child)));

    expect(seen).toEqual(children.map((child) => child.id));
  });
});

function fakeRestIssue(n: number) {
  return { number: n, id: n, node_id: `NODE_${n}`, title: `Story ${n}`, state: "open", labels: [{ name: "synced" }] };
}

function expectedSyncedIssue(n: number) {
  return { number: n, id: n, nodeId: `NODE_${n}`, title: `Story ${n}`, state: "open", labels: ["synced"] };
}

describe("listSyncedIssues", () => {
  it("paginates across 3 pages and returns every matching issue with no sync-marker interpretation", async () => {
    let calls = 0;
    server.use(
      restGet("/repos/:owner/:repo/issues", ({ request }) => {
        calls += 1;
        const page = Number(new URL(request.url).searchParams.get("page"));
        const offset = (page - 1) * 100;

        if (page < 3) return HttpResponse.json(Array.from({ length: 100 }, (_, i) => fakeRestIssue(offset + i + 1)));
        return HttpResponse.json([fakeRestIssue(201)]);
      }),
    );
    const ctx = createClient({ auth: "token", repo: REPO });

    const issues = await listSyncedIssues(ctx, "synced");

    expect(calls).toBe(3);
    expect(issues).toHaveLength(201);
    expect(issues[0]).toEqual(expectedSyncedIssue(1));
    expect(issues[200]).toEqual(expectedSyncedIssue(201));
  });
});

describe("isSubIssueFeatureGap", () => {
  it.each([
    { status: 404, message: undefined, expected: true },
    { status: 410, message: undefined, expected: true },
    { status: 501, message: undefined, expected: true },
    { status: 422, message: "Validation failed", expected: false },
    { status: 422, message: "sub_issues is not enabled", expected: true },
  ])("status=$status message=$message -> $expected", ({ status, message, expected }) => {
    expect(isSubIssueFeatureGap({ source: "http", status, message })).toBe(expected);
  });
});

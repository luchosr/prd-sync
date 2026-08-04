import { describe, expect, it } from "vitest";
import { formatIssues, GithubClientError, type GithubClientIssue, type GithubWarning } from "./errors.js";

function issue(overrides: Partial<GithubClientIssue> = {}): GithubClientIssue {
  return {
    code: "insufficient-permissions",
    operation: "createIssue",
    message: "Request denied with a permission-level 403",
    suggestion: "Verify the token has the required scopes",
    ...overrides,
  };
}

describe("formatIssues", () => {
  it("formats an issue as operation: message with a suggestion line, regardless of code", () => {
    const result = formatIssues([issue({ code: "auth-failed" })]);

    expect(result).toBe(
      "createIssue: Request denied with a permission-level 403\n  ↳ Verify the token has the required scopes",
    );
  });

  it("includes status and requestId context when present", () => {
    const result = formatIssues([
      issue({ status: 403, requestId: "ABCD:1234" }),
    ]);

    expect(result).toBe(
      "createIssue (status 403, request ABCD:1234): Request denied with a permission-level 403\n  ↳ Verify the token has the required scopes",
    );
  });

  it("joins multiple issues on separate blocks", () => {
    const result = formatIssues([
      issue({ operation: "createIssue" }),
      issue({ operation: "linkSubIssue", message: "Feature unavailable", suggestion: "Retry via GraphQL" }),
    ]);

    expect(result).toBe(
      "createIssue: Request denied with a permission-level 403\n  ↳ Verify the token has the required scopes\n" +
        "linkSubIssue: Feature unavailable\n  ↳ Retry via GraphQL",
    );
  });

  it("never includes the Authorization header value in a formatted message", () => {
    const result = formatIssues([
      issue({
        message: "Request failed",
        suggestion: "Check status 403 and request id ABCD:1234, not credentials",
      }),
    ]);

    expect(result).not.toMatch(/Authorization/i);
  });
});

describe("GithubClientError", () => {
  it("carries the issues array, sets name, and derives message from formatIssues()", () => {
    const issues = [issue()];

    const error = new GithubClientError(issues);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GithubClientError");
    expect(error.issues).toBe(issues);
    expect(error.message).toBe(formatIssues(issues));
  });

  it("exposes operation, status, requestId, and docsUrl from the primary issue", () => {
    const error = new GithubClientError([
      issue({
        code: "rate-limit-exhausted",
        operation: "linkSubIssue",
        status: 403,
        requestId: "ABCD:1234",
        docsUrl: "https://docs.github.com/rest/rate-limit",
      }),
    ]);

    expect(error.operation).toBe("linkSubIssue");
    expect(error.status).toBe(403);
    expect(error.requestId).toBe("ABCD:1234");
    expect(error.docsUrl).toBe("https://docs.github.com/rest/rate-limit");
  });

  it("leaves status, requestId, and docsUrl undefined when the issue omits them", () => {
    const error = new GithubClientError([issue()]);

    expect(error.status).toBeUndefined();
    expect(error.requestId).toBeUndefined();
    expect(error.docsUrl).toBeUndefined();
  });

  it("never leaks an Authorization header value onto the error instance", () => {
    const error = new GithubClientError([issue()]);

    expect(JSON.stringify(Object.assign({}, error, { message: error.message }))).not.toMatch(
      /Authorization/i,
    );
  });
});

describe("GithubWarning", () => {
  it("is a plain data shape with code, operation, field, message, and suggestion", () => {
    const warning: GithubWarning = {
      code: "unknown-project-field",
      operation: "setFieldValue",
      field: "Sprint",
      message: "Field 'Sprint' is not defined on this project",
      suggestion: "Add the field in the GitHub project settings or drop it from the PRD",
    };

    expect(warning.code).toBe("unknown-project-field");
    expect(JSON.stringify(warning)).not.toMatch(/Authorization/i);
  });
});

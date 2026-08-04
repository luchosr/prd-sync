---
name: github-api-contracts
description: Real contracts for GitHub's sub-issues, Projects v2, permissions, and rate limit APIs. Consult this skill ALWAYS when writing or modifying code that calls the GitHub API, especially sub-issues and Projects v2 — these are recent APIs and the model's knowledge of them is unreliable. Also use it when diagnosing 403, 422, or permission errors against GitHub.
paths:
  - src/github/**
  - .github/workflows/**
---

# GitHub API contracts

Don't write API calls from memory. Verify against this skill and, if
something isn't here, against the official documentation before
implementing it.

## The three traps

1. **REST sub-issues expect `sub_issue_id`**, which is the issue's
   **internal id**, not its `number`. Every function that creates an issue
   must return both.
2. **The `addSubIssue` GraphQL mutation** may require the
   `GraphQL-Features: sub_issues` header. Implement the fallback: if REST
   fails with a feature error, retry via GraphQL with that header.
3. **`gh` has no native command for sub-issues.** It is not an alternative.

## Permissions

Actions' default `GITHUB_TOKEN` **cannot write to Projects v2**. You need a
classic PAT with the `project` scope (plus `repo`), or a GitHub App with
organization `Projects: write` permission. Validate the token and its
scopes at CLI startup, with an error message stating which scope is
missing.

## Rate limits

Bulk creation runs into *secondary rate limits*:

- Serialize writes. No concurrency.
- Configurable throttle between mutations (default 500 ms).
- Exponential backoff on `403`, honoring `retry-after`.

## Reference

The concrete mutations and endpoints, with their request and response
shapes, are in [reference.md](reference.md). Read it before implementing
any new call.

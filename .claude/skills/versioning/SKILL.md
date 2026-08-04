---
name: versioning
description: prd-sync's semantic versioning rules and how to write a changeset. Consult this skill ALWAYS when creating a changeset, deciding a version bump, preparing a release, or when a change affects the marker format, the content hash, or the syntax the parser recognizes. On any doubt about whether a change is breaking, this skill governs.
paths:
  - .changeset/**
  - src/sync/**
  - src/parser/**
---

# prd-sync versioning

## The rule that decides everything

**If the plan changes for a PRD that hasn't changed, it's breaking.**

It doesn't matter that no public API was touched. What breaks a prd-sync
user is their next run producing mutations they didn't expect.

When in doubt: it's major. An extra major costs one line in the changelog;
a missing major touches hundreds of issues on someone's board.

## Decision table

| Change | Bump |
|---|---|
| Changes the `<!-- prd-sync:... -->` marker format | **major** |
| Changes how the content hash is computed | **major** |
| The parser stops recognizing syntax it used to recognize | **major** |
| Changes the shape of the generated issue body | **major** |
| Changes the name or meaning of an existing config field | **major** |
| The parser recognizes new syntax | minor |
| New CLI flag or optional config field | minor |
| New operation type in the plan | minor |
| Bug fix that doesn't alter the plan | patch |
| Messages, performance, logs, internal dependencies | patch |
| Documentation, tests, CI | no changeset |

## Before writing the changeset

Answer these three questions. If any is "yes", it's major:

1. Would a user who updates and runs the sync without touching their PRD
   see operations other than `noop`?
2. Would issues created by the previous version still be recognized as
   theirs?
3. Would a config that's valid today stop being valid?

If the answer to all three is "no", decide between minor and patch using
the table.

## Writing the changeset

```bash
pnpm changeset
```

The summary is written **from the user's perspective**, not the code's.
Say what happens to their board, not which function got refactored.

- Good: `The marker format moves to v2. Issues created with previous
  versions are automatically migrated on the first sync.`
- Bad: `refactor: extract marker serialization into its own module`

For a major change, the summary **must** include what happens to existing
state on GitHub and what the user needs to do, if anything.

## Hard rules

- **Never run `changeset version` or `changeset publish`.** You write the
  changeset; publishing is a human decision.
- **One changeset per behavior change**, not one per PR.
- While the project is on `0.x`, a breaking change bumps the minor. That's
  correct and doesn't mean the criteria can be relaxed: classification
  works the same way.
- If torn between two levels, propose the higher one and explain the doubt
  in the message to the user. Don't resolve it silently.

---
name: prd-contract
description: Canonical contract for the Markdown PRD format that prd-sync consumes. Consult this skill ALWAYS when working on the parser, the domain types, the test fixtures, or when editing any file under docs/prd/. Also when interpreting what the parser should recognize or ignore. The contract is immutable: do not change or "improve" it without the user explicitly asking.
user-invocable: false
paths:
  - docs/prd/**
  - src/parser/**
  - src/domain/**
  - test/fixtures/**
---

# PRD contract

This format is a closed contract. Do not extend it, do not simplify it, and
do not propose alternatives on your own initiative.

## Recognized structure

```markdown
## E1 — Epic name

Free-form description.

### US-01: As a <role>, I want <action> to <benefit>

**Priority:** P0
**Estimate:** 3

#### Acceptance criteria
- Given ..., when ..., then ...

#### Tasks
- [ ] First task
- [ ] Second task
```

## Rules

- `## E<n> — <name>` defines an epic.
- `### US-<n>: <title>` defines a user story.
- `#### Tasks` contains checkboxes; each one is a task.
- `#### Acceptance criteria` and the free text under the story form the
  issue body.
- `**Priority:**` and `**Estimate:**` are optional.
- Any unrecognized section is ignored without throwing an error.

## Non-negotiable invariants

1. **IDs are immutable.** `US-01` is the synchronization key with GitHub.
   Never renumber, reorder, or reuse an ID.
2. **IDs are unique** across the entire set of PRD files. A duplicate is a
   parse error, not something to resolve silently.
3. **The parser tolerates, it does not correct.** On unexpected format:
   ignore or fail with a clear error. Never infer or auto-complete.
4. **An unknown heading is not an error.** Only malformed or duplicated IDs
   are.

## Fixture

`docs/prd/PRD-prd-sync.md` complies with this contract and is the parser's
main test fixture. If a parser change breaks it, the bug is in the parser.

# prd-sync

CLI and GitHub Action that syncs a Markdown PRD to GitHub Issues and Projects
v2. The PRD is the source of truth; the board is a projection of it.

Stack: Node 24 · TypeScript strict · ESM · pnpm · vitest · tsdown.

## Commands

| Action      | Command                                    |
| ----------- | ------------------------------------------ |
| Development | `pnpm dev` (native type stripping, no tsx) |
| Tests       | `pnpm test`                                |
| Types       | `pnpm typecheck`                           |
| Build       | `pnpm build`                               |

## Module boundaries

These are why the epics can be developed in parallel. Do not cross them.

- `src/parser/` **imports nothing from `src/github/`**. It does not know GitHub
  exists.
- `src/github/` **imports nothing from `src/parser/`**. It does not know
  Markdown exists.
- No function that touches the network lives outside `src/github/`.
- `src/sync/` orchestrates: it consumes the parser's model and calls the client.
- `src/domain/types.ts` is the only shared vocabulary.

If a task seems to require crossing a boundary, the design is wrong — ask
before crossing it.

## Invariants

1. **The PRD contract is immutable.** See the `prd-contract` skill. Do not
   extend or "improve" it without an explicit request.
2. **IDs (`US-01`) are sync keys.** Never renumber or reorder them.
3. **Idempotency.** Two consecutive runs against an unchanged PRD produce zero
   mutations on the second. This is the requirement that breaks most easily
   without anyone noticing.
4. **Nothing is deleted.** A story removed from the PRD gets its issue labelled
   as an orphan. It is never closed or deleted.
5. **No bidirectional sync.** Nothing writes back to the Markdown.

## GitHub API

Do not write API calls from memory — consult the `github-api-contracts` skill.
Sub-issues and Projects v2 are recent APIs and the model's knowledge of them is
unreliable.

A reminder of the most frequent mistake: REST sub-issues expect the child
issue's **internal id** in the body, not its number.

## Conventions

- Pure ESM. Relative imports carry the `.js` extension.
- No `any`. No `as` except after validation with `zod`.
- `zod` validates everything coming from outside: config and API responses.
- Typed errors with actionable context (file, line, what is missing), not
  `throw new Error("failed")`.
- Tests live next to the code: `foo.ts` → `foo.test.ts`.
- `docs/prd/PRD-prd-sync.md` is the parser's primary fixture.

## Working on this

- One epic per branch. E1 and E2 are independent and can run in parallel.
- After touching `src/github/`, run the `api-contract-checker` agent.
- After touching `src/sync/`, run the `idempotency-tester` agent.
- Never run the sync without `--dry-run` against a real repository.

# prd-sync

Turn a Markdown PRD into a GitHub Projects board — automatically, on every push.

Write your product requirements once, in your repository, next to your code.
`prd-sync` reads the user stories and creates the matching issues, sub-issues
and project items. Edit the PRD, push, and the board follows.

> **Status: pre-release.** The parser and sync engine are under active
> development. Not yet published to npm.

## Why

Teams that write PRDs in Markdown end up transcribing them into Jira by hand.
Three days later the document and the board disagree, and nobody knows which
one is authoritative.

GitHub Projects v2 already has everything a Jira board has — issue hierarchy,
custom fields, iterations, board and roadmap views — but no way to populate it
from a document. `prd-sync` fills that gap: the PRD is the single source of
truth, and the board is a generated projection of it.

## How it works

```
docs/prd/*.md  ──parse──►  model  ──diff──►  plan  ──apply──►  GitHub
                                              │
                                              └──► PR comment (dry-run)
```

On a pull request that touches the PRD, the plan is posted as a comment so the
backlog change can be reviewed. On merge to `main`, it is applied.

Each generated issue carries an invisible marker:

```html
<!-- prd-sync:key=US-01 source=docs/prd/checkout.md -->
```

That marker is what makes the sync idempotent. Running it twice against an
unchanged PRD produces no changes at all.

## Quickstart

### 1. Write a PRD

```markdown
## E1 — Checkout

### US-01: As a customer, I want to save my card so I can check out faster

**Priority:** P0
**Estimate:** 3

#### Acceptance criteria

- Given a saved card, when I check out, then payment completes in one step.

#### Tasks

- [ ] Card storage endpoint
- [ ] Card selection UI
- [ ] End-to-end tests
```

Story IDs (`US-01`) are the sync keys. **Never renumber or reuse them.**

### 2. Create a Project and a token

Create a GitHub Project v2 and note its number (visible in the URL).

Then create a **classic PAT** with the `repo` and `project` scopes, and add it
to the repository as a secret named `PRD_SYNC_TOKEN`.

> The default `GITHUB_TOKEN` in Actions **cannot write to Projects v2**. This
> step is not optional. A GitHub App with organisation permission
> `Projects: write` works too.

### 3. Configure

`prd-sync.config.json` in the repository root:

```json
{
  "repo": "owner/repo",
  "projectNumber": 3,
  "sources": ["docs/prd/**/*.md"],
  "syncLabel": "prd-sync",
  "fieldMapping": {
    "priority": "Priority",
    "estimate": "Estimate"
  },
  "throttleMs": 500
}
```

The fields named in `fieldMapping` must already exist in the Project. Missing
fields produce a warning, not a failure.

### 4. Preview locally

```bash
npx prd-sync sync --dry-run
```

This prints the plan and writes nothing. Always run it before your first real
sync.

### 5. Automate

`.github/workflows/prd-sync.yml`:

```yaml
name: prd-sync

on:
  pull_request:
    paths: ['docs/prd/**']
  push:
    branches: [main]
    paths: ['docs/prd/**']

concurrency:
  group: prd-sync-${{ github.ref }}

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile && pnpm build
      - run: node dist/cli.js sync ${{ github.event_name == 'pull_request' && '--dry-run' || '' }}
        env:
          GITHUB_TOKEN: ${{ secrets.PRD_SYNC_TOKEN }}
```

## PRD format

| Syntax                     | Meaning                                      |
| -------------------------- | -------------------------------------------- |
| `## E1 — Name`             | Epic                                         |
| `### US-01: Title`         | User story                                   |
| `#### Tasks`               | Checkbox list; each item becomes a sub-issue |
| `#### Acceptance criteria` | Included in the issue body                   |
| `**Priority:** P0`         | Optional; maps to a Project field            |
| `**Estimate:** 3`          | Optional; maps to a Project field            |

Unrecognised sections are ignored without error.

## Coming from Jira

| Jira          | GitHub                       |
| ------------- | ---------------------------- |
| Epic          | Issue labelled `epic:E1`     |
| Story         | Issue, sub-issue of the epic |
| Sub-task      | Sub-issue of the story       |
| Board columns | Project `Status` field       |
| Sprint        | Project `Iteration` field    |
| Story points  | Project `Estimate` field     |

## CLI

```
prd-sync sync [options]

  --dry-run          Print the plan without writing anything
  --config <path>    Config file (default: prd-sync.config.json)
  --verbose          Show resolved config, per-operation detail, and all warnings
```

Exit codes: `0` success (with or without changes), `1` error.

## Scope

**What it does not do**, by design:

- **No bidirectional sync.** Changes made in the GitHub UI are never written
  back to the Markdown. The PRD always wins.
- **Nothing is deleted.** A story removed from the PRD gets its issue labelled
  `prd-sync:orphan` and reported. It is never closed or deleted.
- **No status management.** The sync creates and updates content; moving cards
  across columns stays with the team.
- **No Jira migration.**

## Troubleshooting

**`Resource not accessible by integration` on Project operations**
The token cannot write to Projects v2. Confirm you are using a PAT with the
`project` scope via the `PRD_SYNC_TOKEN` secret, not the default
`GITHUB_TOKEN`.

**Duplicate issues after a rename**
A story ID changed. IDs are the sync key; the old issue becomes an orphan and a
new one is created. Restore the original ID and close the duplicate.

**`422` when linking sub-issues**
The REST endpoint expects the child issue's internal id, not its number.

**Sync aborts partway through a large PRD**
Secondary rate limits. Raise `throttleMs` in the config.

**Field values not appearing on the board**
The field names in `fieldMapping` must match the Project's field names exactly,
and single-select options must already exist. Run with `--verbose` to see the
resolved field schema.

## Contributing

The project's own backlog lives in `docs/prd/PRD-prd-sync.md` and is synced
with this tool. That file is also the parser's primary test fixture — changes
to it will break tests if the format contract is violated.

```bash
pnpm install
pnpm test
```

## License

MIT

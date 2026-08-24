# prd-sync

Turn a Markdown PRD into a GitHub Projects board — automatically, on every push.

Write your product requirements once, in your repository, next to your code.
`prd-sync` reads the user stories and creates the matching issues, sub-issues
and project items. Edit the PRD, push, and the board follows.

> **Status: pre-release.** Not yet published to npm, so there is no `npx
> prd-sync` and no `uses:` action to drop into another repository. Using it
> today means cloning this repository and running the CLI from the clone
> against *your* repo and *your* Project — which is exactly what the
> Quickstart below does.

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

### Prerequisites

About 15 minutes, plus:

- **Node 24 or newer** (`node --version`) and **pnpm 10** (`corepack enable pnpm`)
- **Git**, to clone this repository
- A **GitHub repository** where the issues will live
- A **GitHub Project v2** already created (its number is in the URL)
- Permission to create a **classic personal access token** on your account

### 1. Clone and build

```bash
git clone https://github.com/luchosr/prd-sync.git
cd prd-sync
pnpm install
pnpm build
```

```bash
node dist/cli.js --help
```

Every command below runs from this directory. The config path and the PRD
globs resolve relative to your current directory, so running from a
subdirectory will not find them.

### 2. Create a GitHub Project

Create a GitHub Project v2 (or use an existing one) and note its number,
visible in the URL (`github.com/users/<you>/projects/<number>`). If you plan
to use `fieldMapping`, create the `Priority` and `Estimate` fields on the
Project now — missing fields produce a warning, not a failure.

### 3. Create a token

prd-sync needs a **classic** personal access token with the `repo` and
`project` scopes.

The `GITHUB_TOKEN` that GitHub Actions provides by default **cannot write to
Projects v2**, so this step is not optional. Fine-grained PATs do not work
either — prd-sync verifies scopes through the `X-OAuth-Scopes` header, which
only classic tokens send. A GitHub App with organisation permission
`Projects: write` is the other supported route.

1. Go to <https://github.com/settings/tokens> → **Generate new token** →
   **Generate new token (classic)**.
2. Name it (`prd-sync`) and pick an expiration.
3. Tick **`repo`** and **`project`**.
4. **Generate token**, then copy it — GitHub shows it only once.

Then wire it to the consumer you are using.

**For the CLI, locally.** prd-sync reads the token only from the
`GITHUB_TOKEN` environment variable — never from the config file, so a token
can never be committed by accident:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

**For the workflow, in CI.** Add the same token to the repository as a secret
named `PRD_SYNC_TOKEN` (Settings → Secrets and variables → Actions → New
repository secret). The workflow passes it to the CLI as `GITHUB_TOKEN`. It
also uses the built-in `GITHUB_TOKEN`, but only to post its PR comment —
never to sync.

### 4. Write your PRD

```bash
cp examples/PRD-example.md my-prd.md
```

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

Story IDs (`US-01`) are the sync keys. **Never renumber or reuse them.** The
snippet above is [`examples/PRD-example.md`](examples/PRD-example.md), ready
to copy; [`docs/prd/PRD-prd-sync.md`](docs/prd/PRD-prd-sync.md) is a full-size
real example — this project's own backlog.

> Keep your PRD **outside `docs/prd/`**. That directory holds prd-sync's own
> backlog, which already defines `US-01`; two files defining the same story ID
> is a parse error, not a merge.

### 5. Configure

`prd-sync.config.json` already exists in the clone and points at *this*
project. Replace `repo`, add your `projectNumber`, and point `sources` at the
PRD you wrote in step 4:

```json
{
  "repo": "owner/repo",
  "projectNumber": 3,
  "sources": ["my-prd.md"],
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

### 6. Preview

```bash
export GITHUB_TOKEN=ghp_your_token_here
node dist/cli.js sync --dry-run
```

`--dry-run` writes nothing, but it does read GitHub, so it needs a valid
token: prd-sync checks the token and its scopes before it plans anything.
Always run this before your first real sync.

### 7. Apply

```bash
node dist/cli.js sync
```

Exit `0` on success (with or without changes), `1` on error. See
`## Automate in CI` below to run this on every push instead of by hand.

## Automate in CI

The shipped workflow, [`.github/workflows/prd-sync.yml`](.github/workflows/prd-sync.yml),
has two jobs:

- **`plan`** runs on every pull request that touches `docs/prd/**`. It does a
  `--dry-run --format markdown` sync and posts (or updates) a single PR
  comment with the plan, so reviewers see the exact board changes before
  merge.
- **`apply`** runs on every push to `main` that touches `docs/prd/**`, and can
  also be triggered manually (`workflow_dispatch`, with a `dry_run` input)
  for a preview that writes nothing. It performs the real sync and writes the
  report to the run's step summary.

Both jobs need `PRD_SYNC_TOKEN` (step 3 above) to do anything — without it,
`plan` writes an explanatory message to the run's step summary (see below; it
never posts a PR comment in this case) and `apply` writes a "not configured"
summary. Neither job fails when the secret is missing; this keeps a freshly
cloned repo from showing a red X on every PRD change before it's configured.

**Permissions.** `plan` needs `pull-requests: write` to post its comment —
using the default `GITHUB_TOKEN`, never `PRD_SYNC_TOKEN`. `apply` needs only
`contents: read`; it posts no comment, and every write to issues or the
Project travels on `PRD_SYNC_TOKEN`, whose authority comes from its own PAT
scopes, not from the workflow's `permissions:` block.

**Fork PRs.** GitHub gives the built-in `GITHUB_TOKEN` **read-only** access
on any pull request opened from a fork, regardless of the `permissions:`
block — so `plan` cannot post or update a PR comment there. On a fork PR (or
any run where `PRD_SYNC_TOKEN` isn't available), the explanation goes to the
run's `$GITHUB_STEP_SUMMARY` instead of a PR comment.

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

Until prd-sync is published to npm, invoke it from the clone as
`node dist/cli.js sync …`. The synopsis below shows the command name it will
have once installed.

```
prd-sync sync [options]

  --dry-run              Print the plan without writing anything
  --config <path>        Config file (default: prd-sync.config.json)
  --verbose              Show resolved config, per-operation detail, and all warnings
  --format <text|markdown>  Report format written to stdout (default: text)
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

---
name: sync-dry-run
description: Builds the CLI and runs it in dry-run mode against the sandbox repository, showing the sync plan.
disable-model-invocation: true
allowed-tools: Bash(pnpm *) Bash(node dist/cli.js *)
---

Run the sync in dry-run and show the plan:

1. `pnpm build`
2. `node dist/cli.js sync --dry-run --config prd-sync.sandbox.json $ARGUMENTS`

Afterward, summarize the plan in three lines: how many operations of each
type (create / update / orphan / noop) and any warnings.

If a permission or token error appears, don't try to work around it: report
which scope is missing and stop.

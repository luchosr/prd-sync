# prd-sync

## 0.2.0

### Minor Changes

- a7cc677: Added the sync engine: your PRD's epics and stories are now planned as create/update/orphan/noop operations against GitHub issues, applied idempotently (re-running with no PRD changes makes zero mutations), and rendered as a plain-text or Markdown report before anything is written. Stories removed from the PRD get their issue labelled `prd-sync:orphan` instead of being closed or deleted.

  This capability isn't reachable from the CLI yet — that lands in a later release.

- d7d6c6c: `prd-sync.config.json` now accepts an optional `fieldMapping` object (`{ "priority"?: string, "estimate"?: string }`) to point at your Project's actual field names, per field. Any field left unmapped keeps writing to `Priority`/`Estimate` exactly as before — omitting `fieldMapping` entirely is unchanged, byte-for-byte.
- d7d6c6c: `prd-sync` is now runnable. Add a `prd-sync.config.json` at your repository root (`repo`, `sources`, and optionally `projectNumber`, `syncLabel`, `fieldMapping`, `throttleMs`), set `GITHUB_TOKEN` in your environment, and run `prd-sync sync --dry-run` (or the bare `prd-sync --dry-run`) to preview the plan, or drop `--dry-run` to apply it. Add `--verbose` to see the resolved config, per-item plan/apply detail, and every warning. The token is read exclusively from `GITHUB_TOKEN` — it is never accepted from the config file or a flag. The process exits `0` on success (including "nothing to do") and `1` on a config, auth, PRD-parse, or partial-apply error.
- 02a30c9: `prd-sync sync` now accepts an optional `--format <text|markdown>` flag (default `text`) to choose the report format written to stdout. Omitting it is unchanged, byte-for-byte. An invalid value (e.g. `--format json`) is rejected before the sync runs.

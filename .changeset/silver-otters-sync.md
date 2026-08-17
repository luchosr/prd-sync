---
"prd-sync": minor
---

`prd-sync` is now runnable. Add a `prd-sync.config.json` at your repository root (`repo`, `sources`, and optionally `projectNumber`, `syncLabel`, `fieldMapping`, `throttleMs`), set `GITHUB_TOKEN` in your environment, and run `prd-sync sync --dry-run` (or the bare `prd-sync --dry-run`) to preview the plan, or drop `--dry-run` to apply it. Add `--verbose` to see the resolved config, per-item plan/apply detail, and every warning. The token is read exclusively from `GITHUB_TOKEN` — it is never accepted from the config file or a flag. The process exits `0` on success (including "nothing to do") and `1` on a config, auth, PRD-parse, or partial-apply error.

---
"prd-sync": minor
---

`prd-sync sync` now accepts an optional `--format <text|markdown>` flag (default `text`) to choose the report format written to stdout. Omitting it is unchanged, byte-for-byte. An invalid value (e.g. `--format json`) is rejected before the sync runs.

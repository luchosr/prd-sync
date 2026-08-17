---
"prd-sync": minor
---

`prd-sync.config.json` now accepts an optional `fieldMapping` object (`{ "priority"?: string, "estimate"?: string }`) to point at your Project's actual field names, per field. Any field left unmapped keeps writing to `Priority`/`Estimate` exactly as before — omitting `fieldMapping` entirely is unchanged, byte-for-byte.

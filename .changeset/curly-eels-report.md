---
"prd-sync": minor
---

Added the sync engine: your PRD's epics and stories are now planned as create/update/orphan/noop operations against GitHub issues, applied idempotently (re-running with no PRD changes makes zero mutations), and rendered as a plain-text or Markdown report before anything is written. Stories removed from the PRD get their issue labelled `prd-sync:orphan` instead of being closed or deleted.

This capability isn't reachable from the CLI yet — that lands in a later release.

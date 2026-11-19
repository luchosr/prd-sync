---
"prd-sync": patch
---

Editing a story that is already linked under its epic no longer reports a `link-sub-issue` failure. Before, every `update` re-linked the story, GitHub answered 422, and the sync exited with an error even though the board was correct. If a story sits under a different parent than its epic, the error now names the issue and tells you how to fix it.

/**
 * Public surface of `src/report/`. Mirrors `src/parser/index.ts`,
 * `src/github/index.ts`, and `src/sync/index.ts`'s convention — this is the
 * ONLY module other code (E4's CLI) should import from. `src/report/`
 * itself imports only the `Plan` / `ApplyResult` types from
 * `../sync/index.js` (design §1) — zero network/GitHub-API knowledge, zero
 * Markdown-parsing knowledge.
 */
export { renderMarkdown } from "./markdown.js";
export { summarize } from "./summary.js";
export type { PlanSummary } from "./summary.js";
export { renderText } from "./text.js";

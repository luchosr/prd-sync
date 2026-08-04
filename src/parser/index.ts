/**
 * Public surface of `src/parser/`. This is the ONLY module other code
 * (`src/sync/`, `src/cli.ts`, tests outside this directory) should import
 * from. Everything else here is an internal implementation detail.
 */
export { PrdParseError, type PrdIssueCode, type PrdParseIssue } from "./errors.js";
export { parsePrd } from "./parse-prd.js";

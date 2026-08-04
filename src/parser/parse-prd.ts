import type { Prd } from "../domain/types.js";
import { PrdParseError, type PrdParseIssue } from "./errors.js";
import { parseDocument } from "./parse-document.js";
import { loadSources } from "./sources.js";
import { validateUniqueKeys } from "./validate.js";

/**
 * Orchestrates the full parse pipeline (design's Data Flow): resolve +
 * read sources, parse each file into a `ParsedDocument`, validate key
 * uniqueness across the whole set, then either throw one accumulated
 * `PrdParseError` (parse-time issues AND uniqueness issues combined) or
 * return the typed `Prd[]`.
 */
export async function parsePrd(input: string | readonly string[]): Promise<Prd[]> {
  const sources = await loadSources(input);

  if (sources.length === 0) {
    throw new PrdParseError([noSourceFilesIssue(input)]);
  }

  const docs = sources.map((source) => parseDocument(source.content, source.path));

  const issues: PrdParseIssue[] = [
    ...docs.flatMap((doc) => doc.issues),
    ...validateUniqueKeys(docs),
  ];

  if (issues.length > 0) {
    throw new PrdParseError(issues);
  }

  return docs.map((doc) => doc.prd);
}

/**
 * The zero-match-glob case is left to implementation by the spec: rather
 * than silently returning `[]` or throwing an unrelated fs error, it is
 * reported through the same `PrdParseError` channel as every other issue.
 */
function noSourceFilesIssue(input: string | readonly string[]): PrdParseIssue {
  const patterns = (Array.isArray(input) ? input : [input]).join(", ");

  return {
    code: "no-source-files",
    path: patterns,
    line: 0,
    heading: "",
    message: `No files matched the given source pattern(s): ${patterns}`,
    suggestion: "Check the glob pattern(s) and confirm the PRD files exist at that path",
  };
}

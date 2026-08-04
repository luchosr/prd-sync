import type { PrdParseIssue } from "./errors.js";
import type { ParsedDocument } from "./parse-document.js";

/**
 * Cross-document key uniqueness (design decision #3): the same code path
 * covers in-file and cross-file duplicates, since `locations[]` entries from
 * the same document are just two entries sharing one `sourcePath`. Epic and
 * story keys live in separate namespaces (`kind:key`).
 */
export function validateUniqueKeys(docs: readonly ParsedDocument[]): PrdParseIssue[] {
  const issues: PrdParseIssue[] = [];
  const seen = new Map<string, { readonly path: string; readonly line: number }>();

  for (const doc of docs) {
    for (const location of doc.locations) {
      const namespaceKey = `${location.kind}:${location.key}`;
      const first = seen.get(namespaceKey);

      if (first) {
        issues.push({
          code: location.kind === "epic" ? "duplicate-epic-key" : "duplicate-story-key",
          path: doc.prd.sourcePath,
          line: location.line,
          heading: location.heading,
          message: `Duplicate ${location.kind} key ${location.key}`,
          suggestion: `Rename one of the two ${location.key} ${location.kind === "epic" ? "epics" : "stories"}`,
          relatedPath: first.path,
          relatedLine: first.line,
        });
      } else {
        seen.set(namespaceKey, { path: doc.prd.sourcePath, line: location.line });
      }
    }
  }

  return issues;
}

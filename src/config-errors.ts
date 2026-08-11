// Mirrors PrdParseError (src/parser/errors.ts) and GithubClientError
// (src/github/errors.ts): an `issues[]` array plus a module-local
// formatIssues whose result becomes `super(message)`. Split out of
// config.ts to keep each file near the project's ~100-line target.
import type { z } from "zod";

export type ConfigIssueCode =
  | "config-not-found"
  | "config-unreadable"
  | "invalid-json"
  | "invalid-field"
  | "missing-token";

export interface ConfigIssue {
  readonly code: ConfigIssueCode;
  readonly location: string;
  readonly message: string;
  readonly suggestion: string;
}

export function formatIssues(issues: readonly ConfigIssue[]): string {
  return issues.map((issue) => `${issue.location} — ${issue.message}\n  ↳ ${issue.suggestion}`).join("\n");
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(formatIssues(issues));
    this.name = "ConfigError";
    this.issues = issues;
  }
}

// Renders zod's PropertyKey[] path the way design §2.2's examples show it:
// "fieldMapping.priority", "sources[0]", "(root)" for the empty path that
// unrecognized_keys carries.
function fieldPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "(root)";
  }

  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }
    return acc.length === 0 ? String(segment) : `${acc}.${String(segment)}`;
  }, "");
}

const FIELD_SUGGESTIONS: Readonly<Record<string, string>> = {
  repo: 'Expected "owner/repo", e.g. "luchosr/prd-sync".',
  sources: 'Provide at least one glob or path to PRD Markdown files, e.g. ["docs/prd/**/*.md"].',
  projectNumber: "The Projects v2 board number shown in its URL (…/projects/<number>).",
  syncLabel: "A non-empty label name applied to synced issues.",
  fieldMapping: 'Provide { "priority"?: string, "estimate"?: string } naming the Projects v2 field(s) to write.',
  throttleMs: "Milliseconds to wait between GitHub mutations (integer >= 0); omit to use the client's default.",
};

const GENERIC_SUGGESTION = "See README.md for the prd-sync.config.json schema.";

function suggestionFor(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    if (issue.keys.includes("labels")) {
      return '"labels" was replaced by "syncLabel": string.';
    }
    return `Unrecognized key(s): ${issue.keys.join(", ")}. ${GENERIC_SUGGESTION}`;
  }

  const [first] = issue.path;
  if (typeof first === "string" && first in FIELD_SUGGESTIONS) {
    return FIELD_SUGGESTIONS[first] ?? GENERIC_SUGGESTION;
  }

  return GENERIC_SUGGESTION;
}

// One `ConfigIssue` per zod issue (design §2.2's ladder, rung 3) — all
// reported at once, like src/parser/'s validate.ts does.
export function toConfigIssue(configPath: string, issue: z.core.$ZodIssue): ConfigIssue {
  return {
    code: "invalid-field",
    location: `${configPath}:${fieldPath(issue.path)}`,
    message: issue.message,
    suggestion: suggestionFor(issue),
  };
}

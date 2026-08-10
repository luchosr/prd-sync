// design §11 L12: the full 4-rule cross-module boundary scanner. A third
// copy of the ~25-line import-regex helper already duplicated in
// src/github/boundaries.test.ts — design §11 explicitly accepts this
// duplication (extracting it needs a tsconfig `include` change outside E3's
// scope). Unlike the "prd-sync" string rule (which exempts *.test.ts
// fixtures that legitimately reference `repo: "prd-sync"`), the import
// rules below have NO test-file exemption: src/github/boundaries.test.ts
// already established that precedent for its own module, and PR3's
// src/sync/test-support.ts is self-contained specifically because of it
// (see apply-progress deviation #5) — this file applies the same rule
// consistently to src/sync/** and src/report/**.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const syncDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(syncDir, "..");
const reportDir = join(srcDir, "report");
const githubDir = join(srcDir, "github");
const parserDir = join(srcDir, "parser");

const IMPORT_SPECIFIER_PATTERN = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".ts"))
    .map((entry) => join(dir, entry));
}

function importSpecifiersIn(filePath: string): readonly string[] {
  const content = readFileSync(filePath, "utf-8");
  return [...content.matchAll(IMPORT_SPECIFIER_PATTERN)].map((match) => match[1] ?? "");
}

// Matches "…/github/<not-index>" (and the parser/sync equivalents): any
// specifier that reaches past the module's public `index.ts`.
const INTERNAL_GITHUB_IMPORT = /(?:^|\/)github\/(?!index(?:\.js)?$)[^/]+$/;
const INTERNAL_PARSER_IMPORT = /(?:^|\/)parser\/(?!index(?:\.js)?$)[^/]+$/;
const INTERNAL_SYNC_IMPORT = /(?:^|\/)sync\/(?!index(?:\.js)?$)[^/]+$/;
// Matches any specifier that touches the module at all, index included.
const ANY_GITHUB_IMPORT = /(?:^|\/)github\//;
const ANY_PARSER_IMPORT = /(?:^|\/)parser\//;
const ANY_SYNC_IMPORT = /(?:^|\/)sync\//;
const ANY_REPORT_IMPORT = /(?:^|\/)report\//;

describe("module boundary: src/sync + src/report", () => {
  it("rule 1: no file under src/sync/** or src/report/** imports an internal src/github or src/parser file (only index.js is public)", () => {
    const offenders: string[] = [];

    for (const dir of [syncDir, reportDir]) {
      for (const file of listTsFiles(dir)) {
        for (const specifier of importSpecifiersIn(file)) {
          if (INTERNAL_GITHUB_IMPORT.test(specifier) || INTERNAL_PARSER_IMPORT.test(specifier)) {
            offenders.push(`${relative(srcDir, file)} -> "${specifier}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("rule 2: no file under src/report/** imports src/github or src/parser at all, and reaches src/sync only through index.js", () => {
    const offenders: string[] = [];

    for (const file of listTsFiles(reportDir)) {
      for (const specifier of importSpecifiersIn(file)) {
        if (ANY_GITHUB_IMPORT.test(specifier) || ANY_PARSER_IMPORT.test(specifier)) {
          offenders.push(`${relative(srcDir, file)} -> "${specifier}" (report must have zero GitHub/parser vocabulary)`);
        }
        if (INTERNAL_SYNC_IMPORT.test(specifier)) {
          offenders.push(`${relative(srcDir, file)} -> "${specifier}" (report must import sync only through index.js)`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("rule 3: src/parser/** and src/github/** never import src/sync or src/report", () => {
    const offenders: string[] = [];

    for (const dir of [parserDir, githubDir]) {
      for (const file of listTsFiles(dir)) {
        for (const specifier of importSpecifiersIn(file)) {
          if (ANY_SYNC_IMPORT.test(specifier) || ANY_REPORT_IMPORT.test(specifier)) {
            offenders.push(`${relative(srcDir, file)} -> "${specifier}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("rule 4: no production file under src/github/** mentions the prd-sync marker namespace", () => {
    const offenders: string[] = [];

    for (const file of listTsFiles(githubDir)) {
      if (file.endsWith(".test.ts")) continue;
      if (readFileSync(file, "utf-8").includes("prd-sync")) {
        offenders.push(relative(srcDir, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("src/sync/test-support.ts never imports src/github/test-support.ts (deliberate — see apply-progress deviation #5)", () => {
    const specifiers = importSpecifiersIn(join(syncDir, "test-support.ts"));

    expect(specifiers.some((specifier) => specifier.includes("github/test-support"))).toBe(false);
  });
});

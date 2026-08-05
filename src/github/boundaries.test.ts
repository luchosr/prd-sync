// Static source-scan (task 4.3), same intent as e1-parser's module-boundary
// contract in the root CLAUDE.md: `src/github/` never imports from
// `src/parser/`, and — forward-looking, since nothing consumes this module
// yet — nothing outside `src/github/` reaches past `index.ts` into an
// internal file. This is a source scan, not a runtime check: it fails loudly
// the day `src/sync/` (or anything else) bypasses the public surface.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const githubDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(githubDir, "..");

const IMPORT_SPECIFIER_PATTERN = /(?:from|import)\s+["']([^"']+)["']/g;

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".ts"))
    .map((entry) => join(dir, entry));
}

function importSpecifiersIn(filePath: string): readonly string[] {
  const content = readFileSync(filePath, "utf-8");
  return [...content.matchAll(IMPORT_SPECIFIER_PATTERN)].map((match) => match[1] ?? "");
}

describe("module boundary: src/github", () => {
  it("no file under src/github/** imports from src/parser", () => {
    const offenders: string[] = [];

    for (const file of listTsFiles(githubDir)) {
      for (const specifier of importSpecifiersIn(file)) {
        if (specifier.includes("/parser/") || specifier === "../parser") {
          offenders.push(`${relative(srcDir, file)} -> "${specifier}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("nothing outside src/github/** imports an internal src/github file directly (only index.ts is public)", () => {
    const offenders: string[] = [];
    const internalGithubImport = /(?:^|\/)github\/(?!index(?:\.js)?$)[^/]+$/;

    for (const file of listTsFiles(srcDir)) {
      if (file.startsWith(githubDir)) continue; // internal imports within the module itself are fine

      for (const specifier of importSpecifiersIn(file)) {
        if (internalGithubImport.test(specifier)) {
          offenders.push(`${relative(srcDir, file)} -> "${specifier}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

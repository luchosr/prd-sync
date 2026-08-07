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

// `\(?` optionally matches dynamic `import("...")` in addition to static
// `import "..."` / `... from "..."` (which already covers re-exports and
// multi-line imports, since `\s` spans newlines and doesn't care what
// precedes the "from"/"import" keyword).
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

describe("IMPORT_SPECIFIER_PATTERN", () => {
  it.each([
    { source: `import { foo } from "./some-module.js";`, expected: ["./some-module.js"] },
    { source: `export { foo } from "./some-module.js";`, expected: ["./some-module.js"] },
    { source: `export * from "./some-module.js";`, expected: ["./some-module.js"] },
    { source: `import "./some-module.js";`, expected: ["./some-module.js"] },
    { source: `import("./some-module.js")`, expected: ["./some-module.js"] },
    { source: `import {\n  foo,\n} from "./some-module.js";`, expected: ["./some-module.js"] },
  ])("extracts the specifier from: $source", ({ source, expected }) => {
    const specifiers = [...source.matchAll(new RegExp(IMPORT_SPECIFIER_PATTERN.source, "g"))].map((m) => m[1]);
    expect(specifiers).toEqual(expected);
  });
});

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

  // E3 D1 added `body` to SyncedIssue; this is the machine-checked form of
  // "src/github/ stays marker-agnostic" (design §2, §11 L12) — production
  // code never mentions the prd-sync marker's syntax, so it can never parse
  // or interpret it. Scoped to non-test files: `*.test.ts` fixtures
  // legitimately set `repo: "prd-sync"` (this project's actual GitHub repo
  // name, predating E3), which is unrelated to marker semantics. The full
  // 4-rule cross-module scanner (including this rule for every module)
  // lands in src/sync/boundaries.test.ts in a later PR.
  it("no production file under src/github/** mentions the prd-sync marker namespace", () => {
    const offenders: string[] = [];

    for (const file of listTsFiles(githubDir)) {
      if (file.endsWith(".test.ts")) continue;
      if (readFileSync(file, "utf-8").includes("prd-sync")) {
        offenders.push(relative(srcDir, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});

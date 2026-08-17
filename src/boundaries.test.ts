// Top-level composition-root boundary scanner (design §1, task 3.6). A
// fourth copy of the ~25-line import-regex helper already duplicated in
// src/github/boundaries.test.ts and src/sync/boundaries.test.ts — those
// files explicitly accept this duplication (extracting it needs a tsconfig
// `include` change outside this change's scope). Same no-test-file-exemption
// precedent as src/sync/boundaries.test.ts: these import rules apply to the
// production composition-root files only (cli.ts, cli-verbose.ts, and the
// config.ts/config-schema.ts/config-errors.ts trio — PR1's apply-progress
// deviation note flagged that the trio must be covered here too).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));

const CLI_FILES = ["cli.ts", "cli-verbose.ts"];
const CONFIG_FILES = ["config.ts", "config-schema.ts", "config-errors.ts"];

const IMPORT_SPECIFIER_PATTERN = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

function importSpecifiersIn(fileName: string): readonly string[] {
  const content = readFileSync(join(srcDir, fileName), "utf-8");
  return [...content.matchAll(IMPORT_SPECIFIER_PATTERN)].map((match) => match[1] ?? "");
}

// Matches "…/github/<not-index>" (and the parser/sync/report equivalents):
// any specifier that reaches past a module's public `index.ts`.
const INTERNAL_MODULE_IMPORT = /(?:^|\/)(github|parser|sync|report)\/(?!index(?:\.js)?$)[^/]+$/;

describe("module boundary: top-level composition root", () => {
  it("cli.ts and cli-verbose.ts reach parser/github/sync/report only through each module's index.js, never an internal file", () => {
    const offenders: string[] = [];

    for (const file of CLI_FILES) {
      for (const specifier of importSpecifiersIn(file)) {
        if (INTERNAL_MODULE_IMPORT.test(specifier)) {
          offenders.push(`${file} -> "${specifier}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("config.ts, config-schema.ts, and config-errors.ts import no project module at all (leaf modules — only zod + node:fs/promises)", () => {
    const offenders: string[] = [];

    for (const file of CONFIG_FILES) {
      for (const specifier of importSpecifiersIn(file)) {
        const isSibling = CONFIG_FILES.some((sibling) => specifier === `./${sibling.replace(/\.ts$/, ".js")}`);
        const isExternal = specifier === "zod" || specifier.startsWith("node:");
        if (!isSibling && !isExternal) {
          offenders.push(`${file} -> "${specifier}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("cli.ts declares the #!/usr/bin/env node shebang as its first line", () => {
    const content = readFileSync(join(srcDir, "cli.ts"), "utf-8");

    expect(content.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });
});

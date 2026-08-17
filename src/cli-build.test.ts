// Build/hashbang sanity (design §8, task 5.5): the one thing that "must be
// verified once by running the built dist/cli.js via the bin link, not
// assumed" (design risk #4 — tsdown/rolldown hashbang preservation). Runs a
// real `pnpm build` and a real subprocess — no network/GITHUB_TOKEN
// required: exercising the compiled commander wiring through to
// resolveToken's missing-token error already proves the whole pipeline
// (shebang -> commander -> config -> token) survived bundling.
import { execFileSync } from "node:child_process";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(srcDir, "..");
const distCli = join(repoRoot, "dist", "cli.js");

describe("build output — dist/cli.js", () => {
  it("pnpm build produces a dist/cli.js with the shebang intact and the executable bit set", () => {
    execFileSync("pnpm", ["build"], { cwd: repoRoot, stdio: "pipe" });

    const content = readFileSync(distCli, "utf-8");
    expect(content.startsWith("#!/usr/bin/env node\n")).toBe(true);

    expect(() => accessSync(distCli, constants.X_OK)).not.toThrow();
    const mode = statSync(distCli).mode;
    expect(mode & 0o111).not.toBe(0);
  }, 60_000);

  it("the built CLI runs directly via its shebang and exits 1 naming GITHUB_TOKEN when unset — proves the compiled pipeline (commander -> config -> resolveToken) is wired end to end", () => {
    let output = "";
    let status = 0;
    try {
      execFileSync(distCli, ["sync", "--dry-run"], {
        cwd: repoRoot,
        env: { ...process.env, GITHUB_TOKEN: "" },
        stdio: "pipe",
        encoding: "utf-8",
      });
    } catch (error) {
      const failure = error as { status: number; stderr: string };
      status = failure.status;
      output = failure.stderr;
    }

    expect(status).toBe(1);
    expect(output).toContain("GITHUB_TOKEN");
  }, 30_000);
});

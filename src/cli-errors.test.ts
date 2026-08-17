// Error-path tests for US-09's three ACs (design §5's mapping table).
// Split out of cli.test.ts for size (config.ts split precedent, PR1).
import { describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";
import { ConfigError } from "./config.js";
import { fakeConfig, fakeDeps, fakeIo } from "./cli-test-support.js";
import { GithubClientError } from "./github/index.js";
import { PrdParseError } from "./parser/index.js";

describe("main — AC2: invalid config names the concrete field", () => {
  it("exits 1 and prints the concrete field path from a ConfigError", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      loadConfig: () =>
        Promise.reject(
          new ConfigError([
            { code: "invalid-field", location: "prd-sync.config.json:repo", message: "expected string, received number", suggestion: 'Expected "owner/repo".' },
          ]),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync", "--dry-run"], io, deps);

    expect(exitCode).toBe(1);
    expect(io.stderrLines.join("")).toContain("prd-sync.config.json:repo");
  });

  it("exits 1 and names the labels -> syncLabel rename for a stale key", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      loadConfig: () =>
        Promise.reject(
          new ConfigError([{ code: "invalid-field", location: "prd-sync.config.json:(root)", message: "Unrecognized key: \"labels\"", suggestion: '"labels" was replaced by "syncLabel": string.' }]),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync", "--dry-run"], io, deps);

    expect(exitCode).toBe(1);
    expect(io.stderrLines.join("")).toContain("syncLabel");
  });
});

describe("main — AC3: token resolution failures name the scope, before any network call", () => {
  it("missing GITHUB_TOKEN exits 1, names repo+project scopes, and calls createClient/assertAuth zero times", async () => {
    const io = fakeIo({});
    const createClient = vi.fn();
    const assertAuth = vi.fn();
    const deps = fakeDeps({ loadConfig: () => Promise.resolve(fakeConfig()), createClient, assertAuth });

    const exitCode = await main(["node", "prd-sync", "sync", "--dry-run"], io, deps);

    expect(exitCode).toBe(1);
    expect(io.stderrLines.join("")).toContain("repo");
    expect(io.stderrLines.join("")).toContain("project");
    expect(createClient).not.toHaveBeenCalled();
    expect(assertAuth).not.toHaveBeenCalled();
  });

  it("a token missing the project scope surfaces assertAuth's GithubClientError message verbatim and exits 1", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      assertAuth: () =>
        Promise.reject(
          new GithubClientError([
            { code: "insufficient-scopes", operation: "assertAuth", message: 'Token is missing required scope(s): project', suggestion: 'Regenerate a classic PAT with the "project" scope(s)…' },
          ]),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync", "--dry-run"], io, deps);

    expect(exitCode).toBe(1);
    expect(io.stderrLines.join("")).toContain("Token is missing required scope(s): project");
  });
});

describe("main — malformed PRD surfaces PrdParseError under a header", () => {
  it("exits 1 and prints the PrdParseError message under a 'PRD parse failed:' header", async () => {
    const io = fakeIo();
    const deps = fakeDeps({
      parsePrd: () =>
        Promise.reject(
          new PrdParseError([
            { code: "duplicate-story-key", path: "docs/prd/PRD.md", line: 12, heading: "US-01", message: "Duplicate key US-01", suggestion: "Rename one of the duplicates." },
          ]),
        ),
    });

    const exitCode = await main(["node", "prd-sync", "sync", "--dry-run"], io, deps);

    expect(exitCode).toBe(1);
    expect(io.stderrLines.join("")).toContain("PRD parse failed:");
    expect(io.stderrLines.join("")).toContain("Duplicate key US-01");
  });
});

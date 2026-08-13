import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, resolveToken } from "./config.js";

describe("loadConfig", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "prd-sync-config-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads and validates a well-formed config file", async () => {
    const path = join(dir, "prd-sync.config.json");
    await writeFile(path, JSON.stringify({ repo: "luchosr/prd-sync", sources: ["docs/prd/**/*.md"] }), "utf8");

    const config = await loadConfig(path);

    expect(config.repo).toEqual({ owner: "luchosr", repo: "prd-sync" });
    expect(config.sources).toEqual(["docs/prd/**/*.md"]);
  });

  it("throws config-not-found for a missing file, naming the path", async () => {
    const path = join(dir, "does-not-exist.json");

    await expect(loadConfig(path)).rejects.toThrow(ConfigError);
    try {
      await loadConfig(path);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const configError = error as ConfigError;
      expect(configError.issues[0]?.code).toBe("config-not-found");
      expect(configError.issues[0]?.location).toBe(path);
    }
  });

  it("throws config-unreadable when the path is not a regular file", async () => {
    // A directory path makes readFile reject with EISDIR, not ENOENT —
    // distinguishing the two rungs without mocking node:fs/promises.
    await expect(loadConfig(dir)).rejects.toThrow(ConfigError);
    try {
      await loadConfig(dir);
      expect.unreachable();
    } catch (error) {
      const configError = error as ConfigError;
      expect(configError.issues[0]?.code).toBe("config-unreadable");
    }
  });

  it("throws invalid-json for malformed JSON, carrying the SyntaxError text", async () => {
    const path = join(dir, "prd-sync.config.json");
    await writeFile(path, "{ not json", "utf8");

    try {
      await loadConfig(path);
      expect.unreachable();
    } catch (error) {
      const configError = error as ConfigError;
      expect(configError.issues[0]?.code).toBe("invalid-json");
      expect(configError.issues[0]?.location).toBe(path);
      expect(configError.message).toContain(path);
    }
  });

  it("throws one invalid-field issue per zod issue, with the concrete field path", async () => {
    const path = join(dir, "prd-sync.config.json");
    await writeFile(path, JSON.stringify({ repo: 42, sources: [] }), "utf8");

    try {
      await loadConfig(path);
      expect.unreachable();
    } catch (error) {
      const configError = error as ConfigError;
      expect(configError.issues).toHaveLength(2);
      expect(configError.issues.map((issue) => issue.location)).toEqual([`${path}:repo`, `${path}:sources`]);
      expect(configError.issues.every((issue) => issue.code === "invalid-field")).toBe(true);
    }
  });

  it("names the labels -> syncLabel rename for the stale key", async () => {
    const path = join(dir, "prd-sync.config.json");
    await writeFile(path, JSON.stringify({ repo: "a/b", sources: ["x"], labels: ["prd-sync"] }), "utf8");

    try {
      await loadConfig(path);
      expect.unreachable();
    } catch (error) {
      const configError = error as ConfigError;
      expect(configError.issues[0]?.location).toBe(`${path}:(root)`);
      expect(configError.issues[0]?.suggestion).toContain("syncLabel");
    }
  });
});

describe("resolveToken", () => {
  it("returns GITHUB_TOKEN when set", () => {
    expect(resolveToken({ GITHUB_TOKEN: "ghp_abc123" })).toBe("ghp_abc123");
  });

  it("throws a missing-token ConfigError naming repo and project scopes when unset", () => {
    try {
      resolveToken({});
      expect.unreachable();
    } catch (error) {
      const configError = error as ConfigError;
      expect(configError).toBeInstanceOf(ConfigError);
      expect(configError.issues[0]?.code).toBe("missing-token");
      expect(configError.issues[0]?.location).toBe("GITHUB_TOKEN");
      expect(configError.message).toContain("repo");
      expect(configError.message).toContain("project");
    }
  });

  it("throws missing-token when GITHUB_TOKEN is an empty string", () => {
    expect(() => resolveToken({ GITHUB_TOKEN: "" })).toThrow(ConfigError);
  });
});

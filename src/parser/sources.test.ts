import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSources, resolveSourcePaths } from "./sources.js";

describe("resolveSourcePaths", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "prd-sync-sources-"));
    await writeFile(join(dir, "b.md"), "# B");
    await writeFile(join(dir, "a.md"), "# A");
    await writeFile(join(dir, "c.txt"), "not markdown");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("resolves and sorts every path matching a glob pattern", async () => {
    const result = await resolveSourcePaths(join(dir, "*.md"));

    expect(result).toEqual([join(dir, "a.md"), join(dir, "b.md")]);
  });

  it("dedupes paths matched by overlapping patterns in a multi-pattern input", async () => {
    const result = await resolveSourcePaths([join(dir, "*.md"), join(dir, "a.md")]);

    expect(result).toEqual([join(dir, "a.md"), join(dir, "b.md")]);
  });

  it("returns an empty array when nothing matches", async () => {
    const result = await resolveSourcePaths(join(dir, "*.nomatch"));

    expect(result).toEqual([]);
  });
});

describe("loadSources", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "prd-sync-sources-"));
    await writeFile(join(dir, "b.md"), "# B content");
    await writeFile(join(dir, "a.md"), "# A content");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the content of every resolved path, sorted by path", async () => {
    const result = await loadSources(join(dir, "*.md"));

    expect(result).toEqual([
      { path: join(dir, "a.md"), content: "# A content" },
      { path: join(dir, "b.md"), content: "# B content" },
    ]);
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrdParseError } from "./errors.js";
import { parsePrd } from "./parse-prd.js";

describe("parsePrd", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "prd-sync-parse-prd-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("parses multiple valid files and returns one Prd per file with the correct sourcePath", async () => {
    await writeFile(join(dir, "a.md"), "## E1 — Epic A\n\n### US-01: Story A\n");
    await writeFile(join(dir, "b.md"), "## E2 — Epic B\n\n### US-02: Story B\n");

    const result = await parsePrd([join(dir, "a.md"), join(dir, "b.md")]);

    expect(result).toHaveLength(2);
    expect(result[0]?.sourcePath).toBe(join(dir, "a.md"));
    expect(result[0]?.epics).toEqual([{ key: "E1", title: "Epic A", body: "" }]);
    expect(result[1]?.sourcePath).toBe(join(dir, "b.md"));
    expect(result[1]?.epics).toEqual([{ key: "E2", title: "Epic B", body: "" }]);
  });

  it("throws one PrdParseError accumulating a parse-time issue and a uniqueness issue together", async () => {
    await writeFile(join(dir, "malformed.md"), "### US-1a: broken\n");
    await writeFile(join(dir, "dup-a.md"), "### US-01: first\n");
    await writeFile(join(dir, "dup-b.md"), "### US-01: second\n");

    await expect(
      parsePrd([join(dir, "malformed.md"), join(dir, "dup-a.md"), join(dir, "dup-b.md")]),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PrdParseError)) return false;
      const codes = [...error.issues.map((issue) => issue.code)].sort();
      return codes.length === 2 && codes.includes("malformed-story-id") && codes.includes("duplicate-story-key");
    });
  });

  it("throws a no-source-files PrdParseError when the glob matches nothing", async () => {
    await expect(parsePrd(join(dir, "*.nomatch"))).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PrdParseError)) return false;
      return error.issues.length === 1 && error.issues[0]?.code === "no-source-files";
    });
  });

  it("resolves normally without throwing when the input has no ID problems", async () => {
    await writeFile(join(dir, "valid.md"), "## E1 — Valid\n\n### US-01: Valid story\n");

    await expect(parsePrd(join(dir, "valid.md"))).resolves.toHaveLength(1);
  });
});

describe("parsePrd against the canonical error-case fixtures", () => {
  it("duplicate-in-file.md: reports a duplicate-story-key issue naming both sites in the same file", async () => {
    await expect(parsePrd("test/fixtures/duplicate-in-file.md")).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PrdParseError)) return false;
      return error.issues.length === 1
        && error.issues[0]?.code === "duplicate-story-key"
        && error.issues[0]?.path === "test/fixtures/duplicate-in-file.md"
        && error.issues[0]?.relatedPath === "test/fixtures/duplicate-in-file.md";
    });
  });

  it("duplicate-cross-file.md + orphan-story.md: reports a duplicate-story-key issue naming both files", async () => {
    await expect(
      parsePrd(["test/fixtures/duplicate-cross-file.md", "test/fixtures/orphan-story.md"]),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PrdParseError)) return false;
      const issue = error.issues[0];
      return error.issues.length === 1
        && issue?.code === "duplicate-story-key"
        && issue.path === "test/fixtures/orphan-story.md"
        && issue.relatedPath === "test/fixtures/duplicate-cross-file.md";
    });
  });

  it("malformed-id.md: reports both a malformed-story-id and a malformed-epic-id issue, naming the exact headings", async () => {
    await expect(parsePrd("test/fixtures/malformed-id.md")).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof PrdParseError)) return false;
      const codes = [...error.issues.map((issue) => issue.code)].sort();
      const headings = error.issues.map((issue) => issue.heading);
      return codes.length === 2
        && codes[0] === "malformed-epic-id"
        && codes[1] === "malformed-story-id"
        && headings.includes("US-1a: broken id missing the dash-number format")
        && headings.includes("E2 —");
    });
  });

  it("orphan-story.md: parses without error, epicKey is null", async () => {
    const [doc] = await parsePrd("test/fixtures/orphan-story.md");

    expect(doc?.stories).toEqual([
      expect.objectContaining({ key: "US-01", epicKey: null }),
    ]);
  });

  it("no-tasks.md: parses without error, tasks is an empty array", async () => {
    const [doc] = await parsePrd("test/fixtures/no-tasks.md");

    expect(doc?.stories[0]?.tasks).toEqual([]);
  });

  it("decoy-headings.md: parses without error, decoys create no epic/story", async () => {
    const [doc] = await parsePrd("test/fixtures/decoy-headings.md");

    expect(doc?.epics).toEqual([{ key: "E1", title: "The one real epic", body: "" }]);
    expect(doc?.stories).toEqual([
      expect.objectContaining({ key: "US-01", title: "The one real story" }),
    ]);
  });
});

describe("parsePrd depth invariance", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "prd-sync-depth-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("produces an identical model for the same content authored at ##/###/#### and ###/####/#####", async () => {
    const shallowPath = join(dir, "shallow.md");
    const deepPath = join(dir, "deep.md");
    await writeFile(
      shallowPath,
      "## E1 — Depth epic\n\n### US-01: Depth story\n\n#### Tasks\n\n- [ ] one\n",
    );
    await writeFile(
      deepPath,
      "### E1 — Depth epic\n\n#### US-01: Depth story\n\n##### Tasks\n\n- [ ] one\n",
    );

    const [shallow] = await parsePrd(shallowPath);
    const [deep] = await parsePrd(deepPath);

    expect(deep?.epics).toEqual(shallow?.epics);
    expect(deep?.stories).toEqual(shallow?.stories);
  });
});

import { describe, expect, it } from "vitest";
import { parseDocument } from "./parse-document.js";

describe("parseDocument", () => {
  it("parses an epic containing a story with fields, tasks and body", () => {
    const source = `# PRD — \`demo\`

## E1 — Checkout flow

Epic description.

### US-01: As a shopper, I want a cart

**Priority:** P0
**Estimate:** 3

#### Acceptance criteria

- Given a cart, when I add an item, then it appears in the cart.

#### Tasks

- [ ] Define the cart type
- [x] Implement add-to-cart
`;

    const result = parseDocument(source, "docs/prd/demo.md");

    expect(result.prd.title).toBe("PRD — demo");
    expect(result.prd.sourcePath).toBe("docs/prd/demo.md");
    expect(result.prd.epics).toEqual([
      { key: "E1", title: "Checkout flow", body: "Epic description." },
    ]);
    expect(result.prd.stories).toHaveLength(1);

    const story = result.prd.stories[0];
    expect(story?.key).toBe("US-01");
    expect(story?.title).toBe("As a shopper, I want a cart");
    expect(story?.epicKey).toBe("E1");
    expect(story?.priority).toBe("P0");
    expect(story?.estimate).toBe(3);
    expect(story?.tasks).toEqual([
      { key: "US-01.T1", title: "Define the cart type", done: false },
      { key: "US-01.T2", title: "Implement add-to-cart", done: true },
    ]);
    expect(story?.body).toContain("Acceptance criteria");
    expect(story?.body).toContain("Given a cart, when I add an item, then it appears in the cart.");
    expect(story?.body).not.toContain("Define the cart type");

    expect(result.issues).toEqual([]);
  });

  it("uses real GFM checkbox markdown through the actual parse pipeline (remark-gfm wired in)", () => {
    const source = `## E1 — Epic

### US-01: Story

#### Tasks

- [ ] Not done yet
- [x] Already done
`;

    const result = parseDocument(source, "docs/prd/gfm.md");
    const tasks = result.prd.stories[0]?.tasks;

    expect(tasks).toEqual([
      { key: "US-01.T1", title: "Not done yet", done: false },
      { key: "US-01.T2", title: "Already done", done: true },
    ]);
  });

  it("classifies epics and stories independent of absolute heading depth", () => {
    const shallow = parseDocument(
      "## E1 — Deep\n\n### US-01: Story\n\n#### Tasks\n\n- [ ] one\n",
      "shallow.md",
    );
    const deep = parseDocument(
      "### E1 — Deep\n\n#### US-01: Story\n\n##### Tasks\n\n- [ ] one\n",
      "deep.md",
    );

    expect(deep.prd.epics).toEqual(shallow.prd.epics);
    expect(deep.prd.stories).toEqual(shallow.prd.stories);
  });

  it("sets epicKey to null for an orphan story appearing before any epic", () => {
    const result = parseDocument("### US-01: Orphan\n\nSome body.\n", "orphan.md");

    expect(result.prd.stories[0]?.epicKey).toBeNull();
  });

  it("closes an open story and epic when a same-or-shallower heading appears, even if unrecognized", () => {
    const source = `## E1 — Epic one

### US-01: First story

Body content.

## 9. Risks

Unrelated closing section.
`;

    const result = parseDocument(source, "closing.md");

    expect(result.prd.stories).toHaveLength(1);
    expect(result.prd.stories[0]?.body).toBe("Body content.");
    expect(result.prd.epics[0]?.body).toBe("");
  });

  it("produces an empty tasks array when the story has no Tasks section", () => {
    const result = parseDocument(
      "## E1 — Epic\n\n### US-01: Story without tasks\n\nJust a description.\n",
      "no-tasks.md",
    );

    expect(result.prd.stories[0]?.tasks).toEqual([]);
  });

  it("reports a malformed-story-id issue for a near-miss story heading and creates no story", () => {
    const result = parseDocument("### US-1a: broken\n", "malformed-story.md");

    expect(result.prd.stories).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "malformed-story-id",
        path: "malformed-story.md",
        heading: "US-1a: broken",
      }),
    ]);
  });

  it("reports a malformed-epic-id issue for a near-miss epic heading and creates no epic", () => {
    const result = parseDocument("## E1 —\n", "malformed-epic.md");

    expect(result.prd.epics).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "malformed-epic-id",
        path: "malformed-epic.md",
        heading: "E1 —",
      }),
    ]);
  });

  it("ignores decoy headings that are not near-misses, without raising an issue", () => {
    const result = parseDocument("## E2E testing\n\nSome notes.\n", "decoy.md");

    expect(result.prd.epics).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it("records epic and story key locations with line numbers for cross-document validation", () => {
    const source = "## E1 — Epic\n\n### US-01: Story\n";

    const result = parseDocument(source, "locations.md");

    expect(result.locations).toEqual([
      { kind: "epic", key: "E1", line: 1, heading: "E1 — Epic" },
      { kind: "story", key: "US-01", line: 3, heading: "US-01: Story" },
    ]);
  });

  it("does not create an epic from a fenced code example resembling the contract", () => {
    const source = "## E1 — Real epic\n\n```markdown\n## E9 — Fake epic\n```\n";

    const result = parseDocument(source, "fenced.md");

    expect(result.prd.epics).toEqual([{ key: "E1", title: "Real epic", body: expect.any(String) }]);
  });

  it("falls back to an empty title when no top-level heading precedes the first epic", () => {
    const result = parseDocument("## E1 — Epic\n", "no-title.md");

    expect(result.prd.title).toBe("");
  });
});

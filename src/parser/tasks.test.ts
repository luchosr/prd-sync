import type { List, ListItem } from "mdast";
import { describe, expect, it } from "vitest";
import { extractTasks } from "./tasks.js";

// Hand-built nodes rather than parsed markdown: recognizing `- [ ]` syntax
// as a checkbox requires the GFM extension, which is a concern of whichever
// module drives the parse (see Issues Found — not this primitive). This
// keeps extractTasks's own tests independent of that upstream choice.
function item(title: string, checked: boolean | null): ListItem {
  return {
    type: "listItem",
    checked,
    children: [{ type: "paragraph", children: [{ type: "text", value: title }] }],
  };
}

function list(...items: ListItem[]): List {
  return { type: "list", children: items };
}

describe("extractTasks", () => {
  it("produces sequential, 1-based, per-story keys in document order", () => {
    const result = extractTasks(
      "US-01",
      list(item("First task", false), item("Second task", true), item("Third task", false)),
    );

    expect(result).toEqual([
      { key: "US-01.T1", title: "First task", done: false },
      { key: "US-01.T2", title: "Second task", done: true },
      { key: "US-01.T3", title: "Third task", done: false },
    ]);
  });

  it("reflects checkbox state via done", () => {
    const result = extractTasks("US-02", list(item("Done already", true)));

    expect(result[0]?.done).toBe(true);
  });

  it("skips list items that are not checkboxes (checked is null)", () => {
    const result = extractTasks(
      "US-03",
      list(item("Not a checkbox", null), item("Real task", false)),
    );

    expect(result).toEqual([{ key: "US-03.T1", title: "Real task", done: false }]);
  });

  it("returns an empty array for a list with no checkbox items", () => {
    const result = extractTasks("US-04", list(item("One", null), item("Two", null)));

    expect(result).toEqual([]);
  });
});

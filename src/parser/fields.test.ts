import type { Paragraph, RootContent } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { extractFields } from "./fields.js";

function paragraphs(markdown: string): Paragraph[] {
  const tree = unified().use(remarkParse).parse(markdown);
  return tree.children.filter(
    (node: RootContent): node is Paragraph => node.type === "paragraph",
  );
}

describe("extractFields", () => {
  it("extracts both fields from a single paragraph using a soft line break", () => {
    const result = extractFields(paragraphs("**Priority:** P0\n**Estimate:** 3\n"));

    expect(result).toEqual({ priority: "P0", estimate: 3 });
  });

  it("extracts both fields when authored as two separate paragraphs", () => {
    const result = extractFields(paragraphs("**Priority:** P1\n\n**Estimate:** 5\n"));

    expect(result).toEqual({ priority: "P1", estimate: 5 });
  });

  it("omits a field whose value fails schema validation, without throwing", () => {
    const result = extractFields(paragraphs("**Priority:** P9\n**Estimate:** 3\n"));

    expect(result).toEqual({ estimate: 3 });
  });

  it("coerces a numeric-looking estimate string to a number", () => {
    const result = extractFields(paragraphs("**Estimate:** 8\n"));

    expect(result.estimate).toBe(8);
  });

  it("returns an empty object when no field lines are present", () => {
    const result = extractFields(paragraphs("Just a description paragraph.\n"));

    expect(result).toEqual({});
  });

  it("rejects a negative estimate", () => {
    const result = extractFields(paragraphs("**Estimate:** -1\n"));

    expect(result).toEqual({});
  });
});

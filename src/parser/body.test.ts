import type { Heading, RootContent } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { headingText, lineOf, toMarkdownBody } from "./body.js";

function contentNodes(markdown: string): RootContent[] {
  return unified().use(remarkParse).parse(markdown).children;
}

function firstHeading(markdown: string): Heading {
  const node = contentNodes(markdown)[0];
  if (!node || node.type !== "heading") {
    throw new Error(`fixture did not parse to a heading: ${markdown}`);
  }
  return node;
}

describe("toMarkdownBody", () => {
  it("round-trips a paragraph followed by an acceptance-criteria bullet list", () => {
    const nodes = contentNodes(
      "As a shopper, I want a cart.\n\n- Given items, when I checkout, then I pay.\n- Given an empty cart, when I checkout, then I am blocked.\n",
    );

    const result = toMarkdownBody(nodes);

    expect(result).toBe(
      "As a shopper, I want a cart.\n\n" +
        "- Given items, when I checkout, then I pay.\n" +
        "- Given an empty cart, when I checkout, then I am blocked.",
    );
  });

  it("preserves heading depth verbatim instead of re-leveling", () => {
    const nodes = contentNodes("#### Notes\n\nSome extra context.\n");

    expect(toMarkdownBody(nodes)).toBe("#### Notes\n\nSome extra context.");
  });

  it("returns an empty string for no content", () => {
    expect(toMarkdownBody([])).toBe("");
  });
});

describe("headingText", () => {
  it("collapses inline formatting to plain text", () => {
    expect(headingText(firstHeading("## E1 — `prd-sync` core\n"))).toBe("E1 — prd-sync core");
  });

  it("trims surrounding whitespace", () => {
    expect(headingText(firstHeading("##   Risks   \n"))).toBe("Risks");
  });
});

describe("lineOf", () => {
  it("returns the node's 1-based source line", () => {
    const nodes = contentNodes("First paragraph.\n\nSecond paragraph.\n");
    const second = nodes[1];
    if (!second) throw new Error("expected a second node");

    expect(lineOf(second)).toBe(3);
  });

  it("returns 0 when the node has no position information", () => {
    expect(lineOf({ type: "paragraph", children: [] })).toBe(0);
  });
});

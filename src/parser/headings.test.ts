import type { Heading } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";
import { classifyHeading, type HeadingKind } from "./headings.js";

function heading(markdown: string): Heading {
  const tree = unified().use(remarkParse).parse(markdown);
  const node = tree.children[0];
  if (!node || node.type !== "heading") {
    throw new Error(`fixture did not parse to a heading: ${markdown}`);
  }
  return node;
}

describe("classifyHeading", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly markdown: string;
    readonly expected: HeadingKind;
  }> = [
    {
      name: "strict epic with em dash",
      markdown: "## E1 — Checkout flow",
      expected: { kind: "epic", key: "E1", title: "Checkout flow" },
    },
    {
      name: "strict epic with en dash",
      markdown: "## E2 – Payments",
      expected: { kind: "epic", key: "E2", title: "Payments" },
    },
    {
      name: "strict epic with hyphen delimiter",
      markdown: "## E3 - Notifications",
      expected: { kind: "epic", key: "E3", title: "Notifications" },
    },
    {
      name: "strict epic one level deeper than the contract example (depth-agnostic)",
      markdown: "### E1 — Checkout flow",
      expected: { kind: "epic", key: "E1", title: "Checkout flow" },
    },
    {
      name: "strict story",
      markdown: "### US-01: As a shopper, I want a cart",
      expected: { kind: "story", key: "US-01", title: "As a shopper, I want a cart" },
    },
    {
      name: "strict story one level deeper than the contract example (depth-agnostic)",
      markdown: "#### US-12: As an admin, I want a report",
      expected: { kind: "story", key: "US-12", title: "As an admin, I want a report" },
    },
    {
      name: "Tasks heading, lowercase",
      markdown: "#### tasks",
      expected: { kind: "tasks" },
    },
    {
      name: "Tasks heading, uppercase",
      markdown: "### TASKS",
      expected: { kind: "tasks" },
    },
    {
      name: "near-miss story: letter suffix breaks the numeric id",
      markdown: "### US-1a: broken",
      expected: { kind: "near-miss", entityType: "story", heading: "US-1a: broken" },
    },
    {
      name: "near-miss epic: delimiter present but title missing",
      markdown: "## E1 —",
      expected: { kind: "near-miss", entityType: "epic", heading: "E1 —" },
    },
    {
      name: "decoy: E2E testing is not an epic near-miss",
      markdown: "## E2E testing",
      expected: { kind: "other" },
    },
    {
      name: "decoy: a heading literally named Estimate",
      markdown: "#### Estimate",
      expected: { kind: "other" },
    },
    {
      name: "unrelated heading",
      markdown: "## Risks",
      expected: { kind: "other" },
    },
  ];

  for (const { name, markdown, expected } of cases) {
    it(`classifies: ${name}`, () => {
      expect(classifyHeading(heading(markdown))).toEqual(expected);
    });
  }
});

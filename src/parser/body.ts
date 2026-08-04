import type { Heading, Nodes, Root, RootContent } from "mdast";
import { toMarkdown } from "mdast-util-to-markdown";
import { toString as mdastToString } from "mdast-util-to-string";

/**
 * Serializes collected body nodes back to readable Markdown (not raw AST).
 * Heading depths are preserved verbatim — re-leveling is a presentation
 * concern out of scope here (design decision #6).
 */
export function toMarkdownBody(nodes: readonly RootContent[]): string {
  const root: Root = { type: "root", children: [...nodes] };
  return toMarkdown(root, { bullet: "-" }).trim();
}

/**
 * Plain-text form of a heading, with inline formatting (code, emphasis)
 * collapsed away — used as the input to `classifyHeading` (design decision #7).
 */
export function headingText(heading: Heading): string {
  return mdastToString(heading).trim();
}

/**
 * The node's 1-based source line, or `0` when position information is
 * unavailable (e.g. a hand-built node in a test).
 */
export function lineOf(node: Nodes): number {
  return node.position?.start.line ?? 0;
}

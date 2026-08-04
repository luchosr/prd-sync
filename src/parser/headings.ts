import type { Heading } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";

const EPIC_STRICT = /^E(\d+)\s*[—–-]\s*(.+)$/;
const EPIC_NEAR_MISS = /^E\d+\s*[—–-]/;
const STORY_STRICT = /^US-(\d+):\s+(.+)$/;
const STORY_NEAR_MISS = /^US[\s\-_]*\d+/i;
const TASKS_HEADING = /^tasks$/i;

export type HeadingKind =
  | { readonly kind: "epic"; readonly key: string; readonly title: string }
  | { readonly kind: "story"; readonly key: string; readonly title: string }
  | { readonly kind: "tasks" }
  | { readonly kind: "near-miss"; readonly entityType: "epic" | "story"; readonly heading: string }
  | { readonly kind: "other" };

/**
 * Classifies a heading node by its text content, independent of its
 * Markdown depth (`##` vs `###`, etc — see design decision #1). Text is
 * collapsed via `mdast-util-to-string` first so inline formatting (code,
 * emphasis) does not affect matching (design decision #7).
 */
export function classifyHeading(heading: Heading): HeadingKind {
  const text = mdastToString(heading).trim();

  const epicMatch = EPIC_STRICT.exec(text);
  if (epicMatch) {
    return { kind: "epic", key: `E${epicMatch[1]}`, title: epicMatch[2].trim() };
  }

  const storyMatch = STORY_STRICT.exec(text);
  if (storyMatch) {
    return { kind: "story", key: `US-${storyMatch[1]}`, title: storyMatch[2].trim() };
  }

  if (TASKS_HEADING.test(text)) {
    return { kind: "tasks" };
  }

  if (EPIC_NEAR_MISS.test(text)) {
    return { kind: "near-miss", entityType: "epic", heading: text };
  }

  if (STORY_NEAR_MISS.test(text)) {
    return { kind: "near-miss", entityType: "story", heading: text };
  }

  return { kind: "other" };
}

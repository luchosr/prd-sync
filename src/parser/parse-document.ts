import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Epic, Prd, UserStory } from "../domain/types.js";
import type { PrdParseIssue } from "./errors.js";
import {
  closeOpenBlocks,
  handleHeading,
  type KeyLocation,
  type WalkState,
} from "./parse-document-walk.js";
import { extractTasks } from "./tasks.js";

export type { KeyLocation };

export interface ParsedDocument {
  readonly prd: Prd;
  readonly issues: PrdParseIssue[];
  readonly locations: KeyLocation[];
}

/**
 * Parses one PRD Markdown source into a typed document plus accumulated
 * issues, via a single flat, depth-relative walk over `root.children`
 * (design decision #1). `remark-gfm` is required here so that `- [ ]` /
 * `- [x]` checkbox syntax actually sets `checked` on `listItem` nodes —
 * without it every real document's tasks silently stay empty.
 */
export function parseDocument(source: string, sourcePath: string): ParsedDocument {
  const root = unified().use(remarkParse).use(remarkGfm).parse(source);

  const state: WalkState = { title: null, epic: null, story: null };
  const epics: Epic[] = [];
  const stories: UserStory[] = [];
  const issues: PrdParseIssue[] = [];
  const locations: KeyLocation[] = [];

  for (const node of root.children) {
    if (node.type === "heading") {
      handleHeading(state, node, { sourcePath, epics, stories, issues, locations });
      continue;
    }

    if (state.story) {
      if (state.story.tasksDepth !== null) {
        if (node.type === "list") state.story.tasks.push(...extractTasks(state.story.key, node));
      } else {
        state.story.content.push(node);
      }
    } else if (state.epic) {
      state.epic.content.push(node);
    }
  }

  closeOpenBlocks(state, epics, stories);

  return {
    prd: { title: state.title ?? "", sourcePath, epics, stories },
    issues,
    locations,
  };
}

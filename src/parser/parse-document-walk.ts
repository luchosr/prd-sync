import type { Heading } from "mdast";
import { headingText, lineOf } from "./body.js";
import { classifyHeading } from "./headings.js";
import {
  appendToOpenContainer,
  closeEpic,
  closeStory,
  type WalkContext,
  type WalkState,
} from "./parse-document-state.js";

export type { KeyLocation, WalkContext, WalkState } from "./parse-document-state.js";
export { closeOpenBlocks } from "./parse-document-state.js";

/**
 * Processes one heading node: the uniform close-by-depth pre-step (design
 * decision #1, extended for the Tasks sub-mode per decision #5), then
 * classification and routing to open/close/record an issue.
 */
export function handleHeading(state: WalkState, heading: Heading, ctx: WalkContext): void {
  const depth = heading.depth;

  if (state.story && state.story.tasksDepth !== null && depth <= state.story.tasksDepth) {
    state.story.tasksDepth = null;
  }
  if (state.story && depth <= state.story.depth) closeStory(state, ctx.stories);
  if (state.epic && depth <= state.epic.depth) closeEpic(state, ctx.epics);

  const kind = classifyHeading(heading);
  const line = lineOf(heading);
  const text = headingText(heading);

  switch (kind.kind) {
    case "epic": {
      state.epic = { key: kind.key, title: kind.title, depth, content: [] };
      ctx.locations.push({ kind: "epic", key: kind.key, line, heading: text });
      return;
    }
    case "story": {
      const epicKey = state.epic && depth > state.epic.depth ? state.epic.key : null;
      state.story = { key: kind.key, title: kind.title, depth, epicKey, content: [], tasks: [], tasksDepth: null };
      ctx.locations.push({ kind: "story", key: kind.key, line, heading: text });
      return;
    }
    case "tasks": {
      if (state.story) state.story.tasksDepth = depth;
      else appendToOpenContainer(state, heading);
      return;
    }
    case "near-miss": {
      const isEpic = kind.entityType === "epic";
      ctx.issues.push({
        code: isEpic ? "malformed-epic-id" : "malformed-story-id",
        path: ctx.sourcePath,
        line,
        heading: text,
        message: `Malformed ${isEpic ? "epic" : "story"} heading: "${text}"`,
        suggestion: isEpic ? 'Use the form "E<n> — <name>"' : 'Use the form "US-<n>: <title>"',
      });
      return;
    }
    case "other": {
      const atDocumentStart =
        state.title === null &&
        state.epic === null &&
        state.story === null &&
        ctx.epics.length === 0 &&
        ctx.stories.length === 0;
      if (atDocumentStart) {
        state.title = text;
      } else {
        appendToOpenContainer(state, heading);
      }
    }
  }
}

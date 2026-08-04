import type { Paragraph, RootContent } from "mdast";
import type { Epic, Task, UserStory } from "../domain/types.js";
import { toMarkdownBody } from "./body.js";
import type { PrdParseIssue } from "./errors.js";
import { extractFields } from "./fields.js";

export interface KeyLocation {
  readonly kind: "epic" | "story";
  readonly key: string;
  readonly line: number;
  readonly heading: string;
}

export interface OpenEpic {
  readonly key: string;
  readonly title: string;
  readonly depth: number;
  readonly content: RootContent[];
}

export interface OpenStory {
  readonly key: string;
  readonly title: string;
  readonly depth: number;
  readonly epicKey: string | null;
  readonly content: RootContent[];
  readonly tasks: Task[];
  tasksDepth: number | null;
}

/** Mutable walk state, held by reference and mutated in place — see design's `WalkState`. */
export interface WalkState {
  title: string | null;
  epic: OpenEpic | null;
  story: OpenStory | null;
}

export interface WalkContext {
  readonly sourcePath: string;
  readonly epics: Epic[];
  readonly stories: UserStory[];
  readonly issues: PrdParseIssue[];
  readonly locations: KeyLocation[];
}

export function closeStory(state: WalkState, stories: UserStory[]): void {
  const story = state.story;
  if (!story) return;
  const paragraphs = story.content.filter((node): node is Paragraph => node.type === "paragraph");
  stories.push({
    key: story.key,
    title: story.title,
    epicKey: story.epicKey,
    body: toMarkdownBody(story.content),
    tasks: story.tasks,
    ...extractFields(paragraphs),
  });
  state.story = null;
}

export function closeEpic(state: WalkState, epics: Epic[]): void {
  const epic = state.epic;
  if (!epic) return;
  epics.push({ key: epic.key, title: epic.title, body: toMarkdownBody(epic.content) });
  state.epic = null;
}

/** Closes any still-open story/epic at end-of-document. */
export function closeOpenBlocks(state: WalkState, epics: Epic[], stories: UserStory[]): void {
  closeStory(state, stories);
  closeEpic(state, epics);
}

export function appendToOpenContainer(state: WalkState, node: RootContent): void {
  if (state.story) state.story.content.push(node);
  else if (state.epic) state.epic.content.push(node);
}

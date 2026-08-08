// Prd -> DesiredIssue[] conversion (design §5). Pure and GitHub-agnostic:
// this module's only input is `Prd[]` (design §1 diagram) — it has no
// awareness of existing issues or their labels. `plan.ts` folds existing
// labels in via `desiredLabels()` once it has looked an item up in the
// IssueIndex, keeping this module's boundary exactly `Prd -> DesiredIssue`.
import type { Epic, Prd, UserStory } from "../domain/types.js";
import { ORPHAN_LABEL } from "./labels.js";
import type { DesiredIssue, DesiredTask } from "./types.js";

export interface ToDesiredOptions {
  readonly syncLabel: string;
}

function managedLabelSet(syncLabel: string): ReadonlySet<string> {
  return new Set([syncLabel, ORPHAN_LABEL]);
}

// D5: `updateIssue` PATCHes `labels` wholesale, so a partial send wipes
// human-added labels. The desired set is the union of every non-managed
// existing label with the managed labels that apply *now* (design §5.3).
// `syncLabel` — not just `managedNow` — is needed to correctly strip a
// stale orphan label on un-orphaning, even though `managedNow` for a live
// item is just `[syncLabel]`.
export function desiredLabels(
  existing: readonly string[],
  syncLabel: string,
  managedNow: readonly string[],
): readonly string[] {
  const managed = managedLabelSet(syncLabel);
  const preserved = existing.filter((label) => !managed.has(label));
  return [...new Set([...preserved, ...managedNow])].sort();
}

function epicTitle(epic: Epic): string {
  return `${epic.key} — ${epic.title}`;
}

function storyTitle(story: UserStory): string {
  return `${story.key}: ${story.title}`;
}

// `#### Tasks` is omitted entirely when there are no tasks, so adding the
// first one is a clean single change (design §5.2).
function storyBody(story: UserStory): string {
  if (story.tasks.length === 0) return story.body;

  const checklist = story.tasks.map((task) => `- [${task.done ? "x" : " "}] ${task.title}`).join("\n");
  return `${story.body}\n\n#### Tasks\n\n${checklist}`;
}

function toDesiredTasks(story: UserStory): readonly DesiredTask[] {
  return story.tasks.map((task) => ({ title: task.title, done: task.done }));
}

function toEpicDesired(epic: Epic, syncLabel: string): DesiredIssue {
  return {
    kind: "epic",
    key: epic.key,
    parentKey: null,
    title: epicTitle(epic),
    body: epic.body,
    tasks: [],
    labels: [syncLabel],
  };
}

function toStoryDesired(story: UserStory, syncLabel: string): DesiredIssue {
  return {
    kind: "story",
    key: story.key,
    parentKey: story.epicKey,
    title: storyTitle(story),
    body: storyBody(story),
    priority: story.priority,
    estimate: story.estimate,
    tasks: toDesiredTasks(story),
    labels: [syncLabel],
  };
}

// Walks each `prd.epics` then each `prd.stories`, both in document order
// (design §5) — no comparator, no sort. That ordering is also the plan's
// apply ordering once plan.ts splits epics from stories.
export function toDesiredIssues(prds: readonly Prd[], options: ToDesiredOptions): readonly DesiredIssue[] {
  const items: DesiredIssue[] = [];

  for (const prd of prds) {
    for (const epic of prd.epics) items.push(toEpicDesired(epic, options.syncLabel));
    for (const story of prd.stories) items.push(toStoryDesired(story, options.syncLabel));
  }

  return items;
}

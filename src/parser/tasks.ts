import type { List } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import type { Task } from "../domain/types.js";

/**
 * Converts a `#### Tasks` checkbox list into `Task[]`. Only items with a
 * checkbox (`checked !== null`) become tasks (design decision #5); plain
 * bullet items in the same list are skipped. Keys are 1-based and scoped to
 * the owning story: `"<storyKey>.T<n>"`, in document order.
 */
export function extractTasks(storyKey: string, list: List): Task[] {
  const tasks: Task[] = [];

  for (const item of list.children) {
    if (item.checked === null || item.checked === undefined) continue;

    tasks.push({
      key: `${storyKey}.T${tasks.length + 1}`,
      title: mdastToString(item).trim(),
      done: item.checked,
    });
  }

  return tasks;
}

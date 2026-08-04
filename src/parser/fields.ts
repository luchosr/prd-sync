import type { Paragraph } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import { z } from "zod";
import type { Priority } from "../domain/types.js";

// zod is confined to validating these two bold-field values (design decision #8).
export const PrioritySchema = z.enum(["P0", "P1", "P2", "P3"]);
export const EstimateSchema = z.coerce.number().int().nonnegative();

const FIELD_LINE = /^\s*(Priority|Estimate)\s*:\s*(.+?)\s*$/i;

export interface ExtractedFields {
  readonly priority?: Priority;
  readonly estimate?: number;
}

/**
 * Reads `**Priority:**` / `**Estimate:**` bold fields from the paragraphs
 * directly under a story. Each paragraph is stringified and matched line by
 * line, which handles both a single paragraph with a soft line break and
 * two separate paragraphs identically (design decision #9). Values that
 * fail schema validation are silently omitted — never an error (rule 3/4).
 */
export function extractFields(paragraphs: readonly Paragraph[]): ExtractedFields {
  let priority: Priority | undefined;
  let estimate: number | undefined;

  for (const paragraph of paragraphs) {
    const text = mdastToString(paragraph);

    for (const line of text.split("\n")) {
      const match = FIELD_LINE.exec(line);
      if (!match) continue;

      const [, name, rawValue] = match;

      if (name.toLowerCase() === "priority") {
        const parsed = PrioritySchema.safeParse(rawValue);
        if (parsed.success) priority = parsed.data;
      } else {
        const parsed = EstimateSchema.safeParse(rawValue);
        if (parsed.success) estimate = parsed.data;
      }
    }
  }

  return { priority, estimate };
}

// Pure leaf: only `zod`. Split out of config.ts to keep each file near the
// project's ~100-line target (design §2.1 describes this as one schema
// table; the split is a file-layout choice, not a public-API change —
// config.ts re-exports everything below).
import { z } from "zod";

const REPO_PATTERN = /^[^/\s]+\/[^/\s]+$/;

// Validated then split once, in one place; the error path stays "repo"
// since the transform runs after the regex already passed (design §2.1).
const repoSchema = z
  .string()
  .regex(REPO_PATTERN, 'Must be "owner/repo" (exactly one "/", no whitespace).')
  .transform((value) => {
    const [owner, repo] = value.split("/");
    return { owner, repo };
  });

export const configSchema = z.strictObject({
  repo: repoSchema,
  projectNumber: z.number().int().positive().optional(),
  sources: z.array(z.string().min(1)).min(1),
  // No `.default()` here — design ADR-2. The literal default lives in
  // src/sync/labels.ts's DEFAULT_SYNC_LABEL; duplicating it here risks
  // drift, and importing it would drag src/sync/'s whole graph into this
  // leaf module just to read one string.
  syncLabel: z.string().min(1).optional(),
  fieldMapping: z
    .strictObject({
      priority: z.string().min(1).optional(),
      estimate: z.string().min(1).optional(),
    })
    .optional(),
  throttleMs: z.number().int().min(0).optional(),
});

export type Config = z.infer<typeof configSchema>;

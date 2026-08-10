// design §10, D9. Five statements: list -> plan -> dry-run short-circuit ->
// apply. dryRun is structural (A7): this is the ONLY place that decides
// whether apply() ever runs — apply() itself takes no dryRun flag.
import { listSyncedIssues } from "../github/index.js";
import { apply } from "./apply.js";
import { buildPlan } from "./plan.js";
import { DEFAULT_SYNC_LABEL } from "./labels.js";
import type { SyncOptions, SyncResult } from "./types.js";

export async function sync(options: SyncOptions): Promise<SyncResult> {
  const syncLabel = options.syncLabel ?? DEFAULT_SYNC_LABEL;
  const existing = await listSyncedIssues(options.ctx, syncLabel);
  const plan = buildPlan(options.prds, existing, { syncLabel, project: options.project });

  if (options.dryRun === true) return { plan };

  const applied = await apply(plan, options.ctx, { syncLabel, project: options.project });
  return { plan, applied };
}

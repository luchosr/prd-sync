// design §8: an ApplyFailure never stores the raw Error. A GithubClientError
// is flattened to its first issue's {message, status, code}; anything else
// becomes message: String(error). This is what preserves e2's token-hygiene
// rule (src/github/errors.ts) across the apply boundary.
import { GithubClientError } from "../github/index.js";
import type { ApplyFailure, ApplyStep, ItemKind } from "./types.js";

export function toApplyFailure(key: string, itemKind: ItemKind, step: ApplyStep, error: unknown): ApplyFailure {
  if (error instanceof GithubClientError) {
    const [primary] = error.issues;
    return { key, itemKind, step, message: primary.message, status: primary.status, code: primary.code };
  }
  return { key, itemKind, step, message: String(error) };
}

// Canonical, deterministic content hash over a DesiredIssue (design §4).
// Hand-written and length-prefixed, not `JSON.stringify` — JSON key order
// follows object-literal source order, so a harmless field reorder during a
// refactor would silently re-hash the entire backlog. Length prefixing makes
// the encoding injection-proof: a body or task title containing the
// delimiter byte cannot forge a field boundary.
//
// Hashes the *desired* state derived from the PRD, computed BEFORE
// appendMarker runs (src/sync/marker.ts). That ordering is what keeps the
// hash non-self-referential — see hash.test.ts's L5 assertions.
import { createHash } from "node:crypto";
import type { DesiredIssue } from "./types.js";

const UNIT_SEPARATOR = "";
const RECORD_SEPARATOR = "";

// Bump this the day the serialization changes on purpose. That is the
// deliberate, loud, one-time mass re-hash escape hatch (design §4).
export const CANONICAL_VERSION = "1";

function field(name: string, value: string): string {
  return `${name}${UNIT_SEPARATOR}${Buffer.byteLength(value, "utf8")}${UNIT_SEPARATOR}${value}${RECORD_SEPARATOR}`;
}

// CRLF/lone-CR -> LF (editor/OS drift), then trimEnd(). Deliberately no
// per-line trailing-whitespace stripping: two trailing spaces are a
// Markdown hard line break, so stripping them would change meaning.
function normalizeBody(body: string): string {
  return body.replace(/\r\n|\r/g, "\n").trimEnd();
}

// Fixed, exhaustive field order (design §4 table). Never reorder without
// bumping CANONICAL_VERSION.
export function serializeDesired(desired: DesiredIssue): string {
  const tasks = desired.tasks.map((task) => `${task.done ? "1" : "0"}${UNIT_SEPARATOR}${task.title.trim()}`).join("\n");
  // Default comparator (UTF-16 code-unit order), never localeCompare — the
  // default is locale-independent and therefore CI-stable.
  const labels = [...desired.labels].sort().join("\n");

  return (
    field("v", CANONICAL_VERSION) +
    field("kind", desired.kind) +
    field("key", desired.key) +
    field("parentKey", desired.parentKey ?? "") +
    field("title", desired.title.trim()) +
    field("body", normalizeBody(desired.body)) +
    field("priority", desired.priority ?? "") +
    field("estimate", desired.estimate === undefined ? "" : String(desired.estimate)) +
    field("tasks", tasks) +
    field("labels", labels)
  );
}

// Truncated to 64 bits (16 hex chars) so the marker stays one short,
// readable line. A collision only ever skips an update, never corrupts or
// duplicates (design §4).
export function contentHash(desired: DesiredIssue): string {
  return createHash("sha256").update(serializeDesired(desired), "utf8").digest("hex").slice(0, 16);
}

// Golden-vector tests are the primary guard for src/sync/hash.ts (design
// §11, L1). A same-input/same-output round-trip test is close to vacuous —
// SHA-256 over a string is trivially self-consistent — so the real
// assertions here are against frozen, hand-verified 16-hex digests. Any
// change to field order, delimiter, prefix scheme, or normalization must
// break this file loudly.
import { describe, expect, it } from "vitest";
import { appendMarker, stripMarker } from "./marker.js";
import { contentHash, serializeDesired } from "./hash.js";
import type { DesiredIssue } from "./types.js";

const EPIC: DesiredIssue = {
  kind: "epic",
  key: "E1",
  parentKey: null,
  title: "E1 — Parser",
  body: "Handles PRD markdown parsing.",
  tasks: [],
  labels: ["prd-sync"],
};

const STORY_WITH_TASKS: DesiredIssue = {
  kind: "story",
  key: "US-01",
  parentKey: "E1",
  title: "US-01: As a developer, I want to parse a PRD",
  body: "Given a PRD file, when parsed, then a Prd object is returned.",
  priority: "P0",
  estimate: 3,
  tasks: [
    { title: "Write parser", done: true },
    { title: "Write tests", done: false },
  ],
  labels: ["prd-sync", "prd-sync:orphan"],
};

const STORY_NO_TASKS: DesiredIssue = {
  kind: "story",
  key: "US-02",
  parentKey: "E1",
  title: "US-02: As a developer, I want validation",
  body: "Validate PRD structure.",
  tasks: [],
  labels: ["prd-sync"],
};

const ESTIMATE_ZERO: DesiredIssue = {
  kind: "story",
  key: "US-03",
  parentKey: "E1",
  title: "US-03: Zero estimate",
  body: "Body text.",
  estimate: 0,
  tasks: [],
  labels: ["prd-sync"],
};

const ESTIMATE_UNDEFINED: DesiredIssue = {
  kind: "story",
  key: "US-03",
  parentKey: "E1",
  title: "US-03: Zero estimate",
  body: "Body text.",
  tasks: [],
  labels: ["prd-sync"],
};

const UNICODE_BODY: DesiredIssue = {
  kind: "story",
  key: "US-04",
  parentKey: null,
  title: "US-04: Emoji support \u{1F389}",
  body: "Supports unicode: café, naïve, 日本語, \u{1F389}\u{1F680}.",
  tasks: [],
  labels: ["prd-sync"],
};

const CRLF_BODY: DesiredIssue = {
  kind: "story",
  key: "US-05",
  parentKey: null,
  title: "US-05: CRLF body",
  body: "Line one.\r\nLine two.\r\nLine three.",
  tasks: [],
  labels: ["prd-sync"],
};

const MULTI_LABEL: DesiredIssue = {
  kind: "story",
  key: "US-06",
  parentKey: "E1",
  title: "US-06: Multi-label",
  body: "Body.",
  tasks: [],
  labels: ["zzz-label", "prd-sync", "aaa-label"],
};

describe("contentHash — L1 golden vectors", () => {
  it.each([
    ["epic", EPIC, "2abb2ced558c86ec"],
    ["story with tasks (priority + estimate + orphan label)", STORY_WITH_TASKS, "e007c3720642b121"],
    ["story without tasks", STORY_NO_TASKS, "a79e142c4f95eea9"],
    ["estimate: 0", ESTIMATE_ZERO, "0be1bc46c22d9f6e"],
    ["estimate: undefined (absent)", ESTIMATE_UNDEFINED, "ba51bb001cd144b2"],
    ["unicode/emoji body and title", UNICODE_BODY, "efa8244a1632371f"],
    ["CRLF body, normalized to LF before hashing", CRLF_BODY, "45a963ea85a9ab67"],
    ["multiple labels, sorted before hashing", MULTI_LABEL, "2767c4a3a4792a54"],
  ])("%s -> frozen digest", (_name, desired, expected) => {
    expect(contentHash(desired)).toBe(expected);
  });

  it("estimate 0 and estimate undefined produce different hashes (0 is not absent)", () => {
    expect(contentHash(ESTIMATE_ZERO)).not.toBe(contentHash(ESTIMATE_UNDEFINED));
  });

  it("is a 16-character lowercase hex string", () => {
    expect(contentHash(EPIC)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("contentHash — L2 input-order independence", () => {
  it("is identical regardless of object-literal property order and label array order", () => {
    const orderA: DesiredIssue = {
      kind: "story",
      key: "US-07",
      parentKey: "E1",
      title: "US-07: Order check",
      body: "Body.",
      tasks: [{ title: "A", done: false }],
      labels: ["b-label", "a-label"],
    };
    const orderB: DesiredIssue = {
      labels: ["a-label", "b-label"],
      tasks: [{ title: "A", done: false }],
      body: "Body.",
      title: "US-07: Order check",
      parentKey: "E1",
      key: "US-07",
      kind: "story",
    };

    expect(contentHash(orderA)).toBe(contentHash(orderB));
  });
});

describe("contentHash — L3 delimiter-injection ambiguity", () => {
  it("does not collide when a body contains the raw field-separator bytes", () => {
    const withRawDelimiters: DesiredIssue = {
      kind: "story",
      key: "US-08",
      parentKey: null,
      title: "US-08: Delimiter check",
      body: "weirdlabels",
      tasks: [],
      labels: [],
    };
    const realLabel: DesiredIssue = {
      kind: "story",
      key: "US-08",
      parentKey: null,
      title: "US-08: Delimiter check",
      body: "weird",
      tasks: [],
      labels: ["labels"],
    };

    expect(contentHash(withRawDelimiters)).not.toBe(contentHash(realLabel));
  });
});

describe("contentHash — L5 order-of-operations (append-vs-hash inversion)", () => {
  it("equals the hash computed after stripping a marker that was appended post-hash", () => {
    const hash = contentHash(STORY_WITH_TASKS);
    const bodyWithMarker = appendMarker(STORY_WITH_TASKS.body, { key: STORY_WITH_TASKS.key, hash });
    const rehashed = contentHash({ ...STORY_WITH_TASKS, body: stripMarker(bodyWithMarker) });

    expect(rehashed).toBe(hash);
  });

  it("never hashes a body containing an appended marker comment", () => {
    // Distinct from the bare "prd-sync:" substring, which also legitimately
    // appears inside the "prd-sync:orphan" managed label (see the labels
    // field of STORY_WITH_TASKS) — the real bug this guards against is
    // serializing the *marker comment itself*, not any string mentioning
    // the sync namespace.
    const serialized = serializeDesired(STORY_WITH_TASKS);

    expect(serialized).not.toContain("<!-- prd-sync:key=");
  });
});

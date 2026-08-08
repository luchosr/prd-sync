// Reads and writes the `<!-- prd-sync:key=... hash=... -->` marker src/sync/
// uses to recognize its own issues on GitHub. src/github/ never imports this
// file and never parses the marker itself (E3 D1) — it only carries the raw
// body string.

export interface Marker {
  readonly key: string;
  readonly hash: string;
}

// Anchored to a whole line (design §3): prevents a marker inside a fenced
// code block from matching mid-line, and prevents a `-->` elsewhere in prose
// from truncating the match. Tolerant on read, strict on write.
const MARKER_LINE =
  /^[ \t]*<!--[ \t]*prd-sync:key=([A-Za-z0-9][A-Za-z0-9._-]*)[ \t]+hash=([0-9a-f]{16})[ \t]*-->[ \t]*$/;

export function formatMarker(marker: Marker): string {
  return `<!-- prd-sync:key=${marker.key} hash=${marker.hash} -->`;
}

// Tolerant: scans every line, last match wins (deterministic tie-break — see
// design §3). Zero matches, or an absent/null body, returns null.
export function parseMarker(body: string | null | undefined): Marker | null {
  const lines = (body ?? "").split(/\r?\n/);
  let found: Marker | null = null;

  for (const line of lines) {
    const match = MARKER_LINE.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      found = { key: match[1], hash: match[2] };
    }
  }

  return found;
}

// Removes every marker line plus the blank line immediately preceding it,
// then trims trailing whitespace — this is what keeps stripMarker(appendMarker(b, m))
// equal to b.trimEnd() regardless of how many markers accumulated.
export function stripMarker(body: string): string {
  const lines = body.split(/\r?\n/);
  const kept: string[] = [];

  for (const line of lines) {
    if (MARKER_LINE.test(line)) {
      if (kept[kept.length - 1] === "") kept.pop();
      continue;
    }
    kept.push(line);
  }

  return kept.join("\n").trimEnd();
}

// Deterministic and idempotent: always strips first, so a stale or duplicate
// marker never accumulates. The trailing "\n" is fixed so the byte output
// does not depend on whether the source body ended with a newline.
export function appendMarker(body: string, marker: Marker): string {
  return `${stripMarker(body)}\n\n${formatMarker(marker)}\n`;
}

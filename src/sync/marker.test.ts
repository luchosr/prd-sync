import { describe, expect, it } from "vitest";
import { appendMarker, formatMarker, parseMarker, stripMarker, type Marker } from "./marker.js";

const KEY = "US-01";
const HASH = "3f9a1c0b7e2d4a58"; // 16 lowercase hex chars, per the marker format
const MARKER: Marker = { key: KEY, hash: HASH };

describe("formatMarker", () => {
  it("renders the exact HTML-comment shape", () => {
    expect(formatMarker(MARKER)).toBe(`<!-- prd-sync:key=${KEY} hash=${HASH} -->`);
  });
});

describe("parseMarker", () => {
  it("returns null for undefined and null bodies", () => {
    expect(parseMarker(undefined)).toBeNull();
    expect(parseMarker(null)).toBeNull();
  });

  it("returns null when no line matches", () => {
    expect(parseMarker("Just a regular story body.\n\nNo marker here.")).toBeNull();
  });

  it("extracts key and hash from a body carrying exactly one marker", () => {
    const body = `Some description.\n\n<!-- prd-sync:key=${KEY} hash=${HASH} -->\n`;

    expect(parseMarker(body)).toEqual(MARKER);
  });

  it("does not match a look-alike marker inside a fenced code block mid-line", () => {
    const body = ["Body text.", "", "```", `text <!-- prd-sync:key=${KEY} hash=${HASH} --> trailing`, "```"].join("\n");

    expect(parseMarker(body)).toBeNull();
  });

  it("does not let a `-->` in prose truncate the match", () => {
    const body = ["The arrow --> points right.", "", `<!-- prd-sync:key=${KEY} hash=${HASH} -->`].join("\n");

    expect(parseMarker(body)).toEqual(MARKER);
  });

  it("resolves to the last matching line when two markers are present (last wins)", () => {
    const other: Marker = { key: "US-02", hash: "0000000000000000" };
    const body = [formatMarker(MARKER), "", formatMarker(other)].join("\n");

    expect(parseMarker(body)).toEqual(other);
  });
});

describe("appendMarker", () => {
  it("appends a blank line then the formatted marker, with a trailing newline", () => {
    expect(appendMarker("Body text.", MARKER)).toBe(`Body text.\n\n${formatMarker(MARKER)}\n`);
  });

  it("produces the same byte output regardless of the body's trailing newline", () => {
    expect(appendMarker("Body text.\n", MARKER)).toBe(appendMarker("Body text.", MARKER));
    expect(appendMarker("Body text.\n\n\n", MARKER)).toBe(appendMarker("Body text.", MARKER));
  });

  it("handles an empty body", () => {
    expect(appendMarker("", MARKER)).toBe(`\n\n${formatMarker(MARKER)}\n`);
  });

  it("is idempotent: appending twice equals appending once", () => {
    const once = appendMarker("Body text.", MARKER);
    const twice = appendMarker(once, MARKER);

    expect(twice).toBe(once);
  });

  it("replaces a stale marker rather than accumulating markers", () => {
    const stale: Marker = { key: KEY, hash: "1111111111111111" };
    const withStale = appendMarker("Body text.", stale);

    const updated = appendMarker(withStale, MARKER);

    expect(parseMarker(updated)).toEqual(MARKER);
    expect(updated.match(/<!-- prd-sync:/g)).toHaveLength(1);
  });
});

describe("stripMarker", () => {
  it("round-trips: stripping an appended marker returns the trimmed original body", () => {
    const body = "Body text.";

    expect(stripMarker(appendMarker(body, MARKER))).toBe(body.trimEnd());
  });

  it("removes every marker line, not just the last", () => {
    const other: Marker = { key: "US-02", hash: "0000000000000000" };
    const body = ["Body.", "", formatMarker(MARKER), "", formatMarker(other)].join("\n");

    expect(stripMarker(body)).toBe("Body.");
  });

  it("returns the body unchanged when it carries no marker", () => {
    expect(stripMarker("Plain body.\n")).toBe("Plain body.");
  });
});

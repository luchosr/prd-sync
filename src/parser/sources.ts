import { glob, readFile } from "node:fs/promises";

export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Resolves one or more glob patterns to a sorted, deduped list of matching
 * paths. This is the only module allowed to import `node:fs/promises`.
 */
export async function resolveSourcePaths(
  input: string | readonly string[],
): Promise<readonly string[]> {
  const patterns = Array.isArray(input) ? input : [input];
  const matches = new Set<string>();

  for await (const match of glob(patterns)) {
    matches.add(match);
  }

  return [...matches].sort();
}

/**
 * Resolves the given patterns and reads each matched file's content,
 * returning results sorted by path.
 */
export async function loadSources(
  input: string | readonly string[],
): Promise<readonly SourceFile[]> {
  const paths = await resolveSourcePaths(input);

  return Promise.all(
    paths.map(async (path): Promise<SourceFile> => ({
      path,
      content: await readFile(path, "utf8"),
    })),
  );
}

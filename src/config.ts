// Pure leaf module (design §2): no import from src/parser/, src/github/,
// src/sync/, or src/report/ — only zod (via the sibling schema/error
// modules) and node:fs/promises. Public surface (design §2.2): re-export
// the schema/error types, then loadConfig + resolveToken.
import { readFile } from "node:fs/promises";
import { ConfigError, toConfigIssue } from "./config-errors.js";
import { configSchema, type Config } from "./config-schema.js";

export { configSchema, type Config } from "./config-schema.js";
export {
  ConfigError,
  formatIssues,
  type ConfigIssue,
  type ConfigIssueCode,
} from "./config-errors.js";

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reads, parses, and validates `prd-sync.config.json` at `path`. Every
 * failure — unreadable file, malformed JSON, or a schema violation — is
 * reported as a `ConfigError`, never a raw throw (design §2.2's ladder).
 */
export async function loadConfig(path: string): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new ConfigError([
        {
          code: "config-not-found",
          location: path,
          message: "File not found.",
          suggestion: "Create a prd-sync.config.json at this path, or pass --config <path> to an existing one.",
        },
      ]);
    }
    throw new ConfigError([
      {
        code: "config-unreadable",
        location: path,
        message: errorMessage(error),
        suggestion: "Check that the path points at a readable JSON file (not a directory) and its permissions.",
      },
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError([
      {
        code: "invalid-json",
        location: path,
        message: `Not valid JSON: ${errorMessage(error)}`,
        suggestion: "Fix the JSON syntax error above; a linter or `jq .` will point at the exact character.",
      },
    ]);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => toConfigIssue(path, issue)));
  }

  return result.data;
}

/**
 * The token is read exclusively from `GITHUB_TOKEN` (spec: "Token
 * resolution") — never from the config schema, a CLI flag, or any other
 * source, so a config file can never commit a PAT.
 *
 * This throws before any network call, so it must name the required scopes
 * itself rather than deferring to assertAuth() (design §5, risk #7): the
 * accepted duplication is only the "repo"/"project" literal pair against
 * src/github/auth.ts's private REQUIRED_SCOPES — exporting that list would
 * widen src/github/'s public surface just to serve this one message.
 */
export function resolveToken(env: NodeJS.ProcessEnv): string {
  const token = env.GITHUB_TOKEN;

  if (token === undefined || token.length === 0) {
    throw new ConfigError([
      {
        code: "missing-token",
        location: "GITHUB_TOKEN",
        message: "Not set.",
        suggestion:
          'Create a classic PAT with the "repo" and "project" scopes at https://github.com/settings/tokens, then set GITHUB_TOKEN.',
      },
    ]);
  }

  return token;
}

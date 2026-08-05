// The `run(operation, fn, schema)` choke point (design decision #1).
// Wires PR1's queue/rate-limit/errors/schemas with PR2's transport/auth
// into a concrete `ClientContext`. Feature modules (PR3) receive only the
// returned context — never `transport`, `queue`, or `auth` directly.
import type { CreateQueueOptions } from "./queue.js";
import { createQueue } from "./queue.js";
import { parseGithubResponse } from "./schemas.js";
import type { GraphqlClient, RestClient } from "./transport.js";
import { createTransport, lowerCaseHeaders, normalizeFailure } from "./transport.js";
import type { ClientContext, RawRestResponse, RepoRef, RestResult } from "./context.js";
import type { GithubWarning } from "./errors.js";
import type { ZodType } from "zod";

export interface CreateClientOptions {
  readonly auth: string;
  readonly repo: RepoRef;
  readonly queue?: CreateQueueOptions;
  readonly onWarning?: (warning: GithubWarning) => void;
}

export function createClient(options: CreateClientOptions): ClientContext {
  const transport = createTransport(options.auth);
  const queue = createQueue(options.queue);

  async function rest<T>(
    operation: string,
    request: (octokit: RestClient) => Promise<RawRestResponse>,
    schema: ZodType<T>,
  ): Promise<RestResult<T>> {
    return queue.enqueue(operation, async () => {
      let raw: RawRestResponse;
      try {
        raw = await request(transport.rest);
      } catch (error) {
        throw normalizeFailure(error);
      }

      return {
        data: parseGithubResponse(schema, operation, raw.data),
        headers: lowerCaseHeaders(raw.headers),
      };
    });
  }

  async function gql<T>(
    operation: string,
    request: (client: GraphqlClient) => Promise<unknown>,
    schema: ZodType<T>,
  ): Promise<T> {
    return queue.enqueue(operation, async () => {
      let raw: unknown;
      try {
        raw = await request(transport.gql);
      } catch (error) {
        throw normalizeFailure(error);
      }

      return parseGithubResponse(schema, operation, raw);
    });
  }

  return {
    repo: options.repo,
    projectFieldCache: new Map(),
    rest,
    gql,
    warn(warning: GithubWarning): void {
      options.onWarning?.(warning);
    },
  };
}

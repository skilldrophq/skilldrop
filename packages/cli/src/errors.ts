import { Data } from "effect";

export class CliError extends Data.TaggedError("CliError")<{
  readonly message: string;
}> {}

export const messageFromCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

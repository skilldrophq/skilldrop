import { Schema } from "effect"

export class CliError extends Schema.TaggedErrorClass<CliError>()("CliError", {
  message: Schema.String
}) {}

export const messageFromCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, Layer, Logger } from "effect"
import { Command } from "effect/unstable/cli"
import { SkilldropApi } from "./api.ts"
import { command } from "./commands.ts"

const program = command.pipe(
  Command.run({ version: "0.1.0" }),
  Effect.catchTag("CliError", (error) => Console.error(error.message).pipe(Effect.andThen(Effect.fail(error))))
)

program.pipe(
  Effect.provide(Layer.mergeAll(NodeServices.layer, SkilldropApi.layer, Logger.layer([Logger.consolePretty()]))),
  Effect.scoped,
  NodeRuntime.runMain({ disableErrorReporting: true })
)

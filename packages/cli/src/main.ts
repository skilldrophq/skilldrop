import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Config, Console, Effect, Layer, Logger } from "effect"
import { Command } from "effect/unstable/cli"
import { SkilldropApi } from "./api.ts"
import { makeCommand } from "./commands.ts"

const program = Effect.gen(function*() {
  const devMode = yield* Config.boolean("SKILLDROP_DEV").pipe(Config.withDefault(false))
  return yield* makeCommand(devMode).pipe(Command.run({ version: "0.1.0" }))
}).pipe(
  Effect.catchTag("CliError", (error) => Console.error(error.message).pipe(Effect.andThen(Effect.fail(error))))
)

program.pipe(
  Effect.provide(Layer.mergeAll(NodeServices.layer, SkilldropApi.layer, Logger.layer([Logger.consolePretty()]))),
  Effect.scoped,
  NodeRuntime.runMain({ disableErrorReporting: true })
)

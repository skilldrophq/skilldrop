import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Console, Effect, Layer, Logger } from "effect";
import { Command } from "effect/unstable/cli";
import pkg from "../package.json" with { type: "json" };
import { SkilldropApi } from "./api.ts";
import { makeCommand } from "./commands.ts";
import { errorMessage } from "./ui.ts";

const version = pkg.version;

const program = Effect.gen(function* () {
  const devMode = yield* Config.boolean("SKILLDROP_DEV").pipe(
    Config.withDefault(false),
  );
  return yield* makeCommand(devMode).pipe(Command.run({ version }));
}).pipe(
  Effect.catchTag("CliError", (error) =>
    Console.error(errorMessage(error.message)).pipe(
      Effect.andThen(Effect.fail(error)),
    ),
  ),
);

program.pipe(
  Effect.provide(
    Layer.mergeAll(
      NodeServices.layer,
      SkilldropApi.layer,
      Logger.layer([Logger.consolePretty()]),
    ),
  ),
  Effect.scoped,
  NodeRuntime.runMain({ disableErrorReporting: true }),
);

import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Command from "alchemy/Command";
import * as Effect from "effect/Effect";
import { Bucket } from "./src/bucket";
import { makeWorker } from "./src/worker";

export default Alchemy.Stack(
  "Skilldrop",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const website = yield* Command.Build("Website", {
      command: "bun run build",
      cwd: "../frontend",
      outdir: "dist",
    });
    const bucket = yield* Bucket;
    const worker = yield* makeWorker({
      directory: website.outdir,
      domain: stage === "prod" ? "skilldrop.dev" : undefined,
      hash: website.hash.output.as<string>(),
    });

    return {
      bucketName: bucket.bucketName,
      url: worker.url,
    };
  }),
);

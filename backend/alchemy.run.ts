import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { Bucket } from "./src/bucket";
import Worker from "./src/worker";

export default Alchemy.Stack(
  "Skilldrop",
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const bucket = yield* Bucket;
    const worker = yield* Worker;

    return {
      bucketName: bucket.bucketName,
      url: worker.url,
    };
  }),
);

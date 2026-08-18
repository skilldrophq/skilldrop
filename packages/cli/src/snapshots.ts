import { Effect } from "effect";
import { parseSnapshotId, SkilldropApi } from "./api.ts";
import { verifySnapshot } from "./inspect.ts";
import type { SkillBundle } from "./skill.ts";

export const loadVerifiedSnapshot = Effect.fn("loadVerifiedSnapshot")(
  function* (apiUrl: string, snapshot: string) {
    const api = yield* SkilldropApi;
    const id = yield* parseSnapshotId(snapshot);
    const metadata = yield* api.metadata(apiUrl, id);
    const compressed = yield* api.download(apiUrl, id);
    const verified = yield* verifySnapshot(metadata, compressed);
    return { metadata, verified };
  },
);

export const publishSnapshot = Effect.fn("publishSnapshot")(function* (
  apiUrl: string,
  bundle: SkillBundle,
) {
  const api = yield* SkilldropApi;
  const created = yield* api.create(apiUrl, bundle.id);
  yield* api.upload(created.upload_url, bundle.bytes);
  return {
    id: created.id,
    url: new URL(`/s/${created.id}`, apiUrl).toString(),
  };
});

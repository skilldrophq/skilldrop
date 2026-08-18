import { describe, expect, test } from "bun:test";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import type { Scope } from "effect/Scope";
import { SkilldropApi, SnapshotMetadata } from "../src/api.ts";
import { sha256 } from "../src/archive.ts";
import { buildSkillBundle } from "../src/skill.ts";
import { loadVerifiedSnapshot, publishSnapshot } from "../src/snapshots.ts";

const run = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices | Scope>,
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

describe("snapshot transfer", () => {
  test("retrieves and verifies a snapshot behind one seam", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "snapshot-transfer" });
        yield* fs.writeFile(path.join(root, "SKILL.md"), new TextEncoder().encode("# Transfer\n"));
        const bundle = yield* buildSkillBundle(root);
        const metadata = new SnapshotMetadata({
          id: "1234567890123456789012",
          size: bundle.bytes.byteLength,
          sha256: yield* sha256(bundle.bytes),
          manifest: bundle.manifest,
          uploaded_at: "2026-08-19T00:00:00.000Z",
        });
        const requested: Array<string> = [];
        const api = SkilldropApi.of({
          create: () => Effect.die("not used"),
          upload: () => Effect.die("not used"),
          metadata: (_apiUrl, id) => {
            requested.push(`metadata:${id}`);
            return Effect.succeed(metadata);
          },
          download: (_apiUrl, id) => {
            requested.push(`download:${id}`);
            return Effect.succeed(bundle.bytes);
          },
        });
        const loaded = yield* loadVerifiedSnapshot(
          "https://skilldrop.test",
          metadata.id,
        ).pipe(Effect.provideService(SkilldropApi, api));
        return { loaded, requested };
      }),
    );

    expect(result.requested).toEqual([
      "metadata:1234567890123456789012",
      "download:1234567890123456789012",
    ]);
    expect(result.loaded.metadata.id).toBe("1234567890123456789012");
    expect(result.loaded.verified.files.map((file) => file.path)).toEqual([
      "SKILL.md",
    ]);
  });

  test("publishes a bundle through the transfer seam", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "snapshot-publish" });
        yield* fs.writeFile(path.join(root, "SKILL.md"), new TextEncoder().encode("# Publish\n"));
        const bundle = yield* buildSkillBundle(root);
        const events: Array<string> = [];
        const api = SkilldropApi.of({
          create: (_apiUrl, id) => {
            events.push(`create:${id}`);
            return Effect.succeed({ id: "published123", upload_url: "https://upload.test/bundle" });
          },
          upload: (url, bytes) => {
            events.push(`upload:${url}:${bytes.byteLength}`);
            return Effect.void;
          },
          metadata: () => Effect.die("not used"),
          download: () => Effect.die("not used"),
        });
        const published = yield* publishSnapshot(
          "https://skilldrop.test/base",
          bundle,
        ).pipe(Effect.provideService(SkilldropApi, api));
        return { bundle, events, published };
      }),
    );

    expect(result.events).toEqual([
      `create:${result.bundle.id}`,
      `upload:https://upload.test/bundle:${result.bundle.bytes.byteLength}`,
    ]);
    expect(result.published.url).toBe("https://skilldrop.test/s/published123");
  });
});

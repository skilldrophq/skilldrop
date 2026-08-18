import { describe, expect, test } from "bun:test";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import type { Scope } from "effect/Scope";
import { gunzip, sha256 } from "../src/archive.ts";
import {
  buildSkillBundle,
  installVerifiedSkill,
  verifySkillBundle,
} from "../src/skill.ts";

const encoder = new TextEncoder();

const run = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices | Scope>,
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

describe("skill bundles", () => {
  test("packages the bundled Skilldrop CLI skill", async () => {
    const skillPath = new URL("../skills/use-skilldrop", import.meta.url);
    const bundle = await run(buildSkillBundle(skillPath.pathname));
    const repeated = await run(buildSkillBundle(skillPath.pathname));
    const hash = await run(sha256(bundle.bytes));
    const contentHash = await run(
      gunzip(bundle.bytes).pipe(Effect.flatMap(sha256)),
    );
    const verified = await run(verifySkillBundle(bundle.bytes, hash));

    expect(verified.manifest.name).toBe("use-skilldrop");
    expect(bundle.id).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.id).toBe(contentHash);
    expect(repeated.id).toBe(bundle.id);
    expect(verified.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "agents/openai.yaml",
    ]);
  });

  test("builds, verifies, and installs a skill without running its scripts", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "review-pr" });
        yield* fs.writeFile(
          path.join(root, "SKILL.md"),
          encoder.encode("# Review PRs\n"),
        );
        yield* fs.makeDirectory(path.join(root, "scripts"));
        yield* fs.writeFile(
          path.join(root, "scripts", "check.sh"),
          encoder.encode("#!/bin/sh\nexit 42\n"),
          { mode: 0o755 },
        );

        const bundle = yield* buildSkillBundle(root);
        const hash = yield* sha256(bundle.bytes);
        const verified = yield* verifySkillBundle(bundle.bytes, hash);
        const destinationRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "installed-skills",
        });
        const destination = yield* installVerifiedSkill(
          destinationRoot,
          verified.manifest,
          verified.files,
        );

        return {
          destination,
          skill: yield* fs.readFileString(path.join(destination, "SKILL.md")),
          script: yield* fs.readFileString(
            path.join(destination, "scripts", "check.sh"),
          ),
        };
      }),
    );

    expect(result.skill).toBe("# Review PRs\n");
    expect(result.script).toContain("exit 42");
  });

  test("honors .skillignore and excludes the ignore file from the bundle", async () => {
    const files = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "ignored-skill",
        });
        yield* fs.writeFile(
          path.join(root, "SKILL.md"),
          encoder.encode("# Ignored files\n"),
        );
        yield* fs.writeFile(
          path.join(root, ".env"),
          encoder.encode("SECRET=do-not-share\n"),
        );
        yield* fs.writeFile(
          path.join(root, ".skillignore"),
          encoder.encode(
            [
              ".env",
              "fixtures/",
              "*.private",
              "!references/keep.private",
              "/root-only.txt",
              "secrets.[jt]son",
            ].join("\n"),
          ),
        );
        yield* fs.makeDirectory(path.join(root, "fixtures"));
        yield* fs.writeFile(
          path.join(root, "fixtures", "customer.json"),
          encoder.encode("{}\n"),
        );
        yield* fs.makeDirectory(path.join(root, "references"));
        yield* fs.writeFile(
          path.join(root, "references", "public.md"),
          encoder.encode("Public\n"),
        );
        yield* fs.writeFile(
          path.join(root, "references", "notes.private"),
          encoder.encode("Private\n"),
        );
        yield* fs.writeFile(
          path.join(root, "references", "keep.private"),
          encoder.encode("Keep\n"),
        );
        yield* fs.writeFile(
          path.join(root, "root-only.txt"),
          encoder.encode("Ignored at root\n"),
        );
        yield* fs.writeFile(
          path.join(root, "references", "root-only.txt"),
          encoder.encode("Kept when nested\n"),
        );
        yield* fs.writeFile(
          path.join(root, "secrets.json"),
          encoder.encode("{}\n"),
        );

        const bundle = yield* buildSkillBundle(root);
        return bundle.manifest.files.map((file) => file.path);
      }),
    );

    expect(files).toEqual([
      "SKILL.md",
      "references/keep.private",
      "references/public.md",
      "references/root-only.txt",
    ]);
  });

  test("rejects symlinks that point outside the skill root", async () => {
    const error = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "linked-skill",
        });
        const outside = yield* fs.makeTempDirectoryScoped({
          prefix: "private-fixture",
        });
        yield* fs.writeFile(
          path.join(root, "SKILL.md"),
          encoder.encode("# Linked skill\n"),
        );
        yield* fs.writeFile(
          path.join(outside, ".env"),
          encoder.encode("SECRET=do-not-share\n"),
        );
        yield* fs.symlink(
          path.join(outside, ".env"),
          path.join(root, "leaked.env"),
        );
        return yield* buildSkillBundle(root).pipe(Effect.flip);
      }),
    );

    expect(error.message).toContain("symlink");
  });

  test("rejects a tampered compressed bundle", async () => {
    const error = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "safe-skill",
        });
        yield* fs.writeFile(
          path.join(root, "SKILL.md"),
          encoder.encode("# Safe\n"),
        );
        const bundle = yield* buildSkillBundle(root);
        const hash = yield* sha256(bundle.bytes);
        const tampered = bundle.bytes.slice();
        tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
        return yield* verifySkillBundle(tampered, hash).pipe(Effect.flip);
      }),
    );

    expect(error.message).toContain("checksum");
  });
});

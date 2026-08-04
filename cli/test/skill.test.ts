import { describe, expect, test } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Path } from "effect"
import type { Scope } from "effect/Scope"
import { sha256 } from "../src/archive.ts"
import { buildSkillBundle, installVerifiedSkill, verifySkillBundle } from "../src/skill.ts"

const encoder = new TextEncoder()

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices | Scope>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped))

describe("skill bundles", () => {
  test("builds, verifies, and installs a skill without running its scripts", async () => {
    const result = await run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "review-pr" })
      yield* fs.writeFile(path.join(root, "SKILL.md"), encoder.encode("# Review PRs\n"))
      yield* fs.makeDirectory(path.join(root, "scripts"))
      yield* fs.writeFile(path.join(root, "scripts", "check.sh"), encoder.encode("#!/bin/sh\nexit 42\n"), { mode: 0o755 })

      const bundle = yield* buildSkillBundle(root)
      const hash = yield* sha256(bundle.bytes)
      const verified = yield* verifySkillBundle(bundle.bytes, hash)
      const destinationRoot = yield* fs.makeTempDirectoryScoped({ prefix: "installed-skills" })
      const destination = yield* installVerifiedSkill(destinationRoot, verified.manifest, verified.files)

      return {
        destination,
        skill: yield* fs.readFileString(path.join(destination, "SKILL.md")),
        script: yield* fs.readFileString(path.join(destination, "scripts", "check.sh"))
      }
    }))

    expect(result.skill).toBe("# Review PRs\n")
    expect(result.script).toContain("exit 42")
  })

  test("rejects a tampered compressed bundle", async () => {
    const error = await run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "safe-skill" })
      yield* fs.writeFile(path.join(root, "SKILL.md"), encoder.encode("# Safe\n"))
      const bundle = yield* buildSkillBundle(root)
      const hash = yield* sha256(bundle.bytes)
      const tampered = bundle.bytes.slice()
      tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1
      return yield* verifySkillBundle(tampered, hash).pipe(Effect.flip)
    }))

    expect(error.message).toContain("checksum")
  })
})

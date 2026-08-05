import { describe, expect, test } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { Effect, FileSystem, Path } from "effect"
import type { Scope } from "effect/Scope"
import { SnapshotMetadata } from "../src/api.ts"
import { ManifestFile, sha256, SkillManifest } from "../src/archive.ts"
import { renderSnapshotInspection, verifySnapshot } from "../src/inspect.ts"
import { buildSkillBundle } from "../src/skill.ts"

const id = "1234567890123456789012"
const markdownHash = "a".repeat(64)
const scriptHash = "b".repeat(64)
const bundleHash = "c".repeat(64)
const encoder = new TextEncoder()

const run = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices | Scope>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped))

describe("snapshot inspection", () => {
  test("renders verified file checksums and executable warnings", () => {
    const metadata = new SnapshotMetadata({
      id,
      size: 5_120,
      sha256: bundleHash,
      uploaded_at: "2026-08-05T10:00:00.000Z",
      manifest: new SkillManifest({
        protocol_version: 1,
        name: "review-pr",
        files: [
          new ManifestFile({ path: "SKILL.md", size: 12, sha256: markdownHash }),
          new ManifestFile({ path: "scripts/check.sh", size: 24, sha256: scriptHash })
        ]
      })
    })

    const output = renderSnapshotInspection(metadata, [
      { path: "SKILL.md", content: new Uint8Array(12), mode: 0o644 },
      { path: "scripts/check.sh", content: new Uint8Array(24), mode: 0o755 }
    ])

    expect(output).toContain(`Snapshot ${id}`)
    expect(output).toContain("protocol: 1")
    expect(output).toContain("bundle: 5.0 KiB (5120 bytes)")
    expect(output).toContain(`bundle sha256: ${bundleHash.slice(0, 7)}…`)
    expect(output).toContain(`sha256: ${markdownHash.slice(0, 7)}…`)
    expect(output).not.toContain(bundleHash)
    expect(output).not.toContain(markdownHash)
    expect(output).toContain("mode: 0755 executable")
    expect(output).toContain("Executable files (1)\n  warning: review these files before installing\n  scripts/check.sh")
    expect(output).toContain(`Install with: sk install ${id}`)
  })

  test("reports when the snapshot has no executable files", () => {
    const manifest = new SkillManifest({
      protocol_version: 1,
      name: "review-pr",
      files: [new ManifestFile({ path: "SKILL.md", size: 12, sha256: markdownHash })]
    })
    const metadata = new SnapshotMetadata({
      id,
      size: 12,
      sha256: bundleHash,
      uploaded_at: "2026-08-05T10:00:00.000Z",
      manifest
    })

    const output = renderSnapshotInspection(metadata, [
      { path: "SKILL.md", content: new Uint8Array(12), mode: 0o644 }
    ])

    expect(output).toContain("Executable files (0)\n  none")
  })

  test("verifies downloaded snapshot metadata and bundle contents", async () => {
    const bundle = await run(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "inspect-command" })
      yield* fs.writeFile(path.join(root, "SKILL.md"), encoder.encode("# Review PRs\n"))
      yield* fs.makeDirectory(path.join(root, "scripts"))
      yield* fs.writeFile(path.join(root, "scripts", "check.sh"), encoder.encode("#!/bin/sh\n"), { mode: 0o755 })
      const built = yield* buildSkillBundle(root)
      return { ...built, sha256: yield* sha256(built.bytes) }
    }))
    const metadata = new SnapshotMetadata({
      id,
      size: bundle.bytes.byteLength,
      sha256: bundle.sha256,
      manifest: bundle.manifest,
      uploaded_at: "2026-08-05T10:00:00.000Z"
    })

    const verified = await run(verifySnapshot(metadata, bundle.bytes))

    expect(verified.manifest.name).toBe(bundle.manifest.name)
    expect(verified.files.map((file) => [file.path, file.mode])).toEqual([
      ["SKILL.md", 0o644],
      ["scripts/check.sh", 0o755]
    ])

    const mismatchedMetadata = new SnapshotMetadata({
      id,
      size: bundle.bytes.byteLength,
      sha256: bundle.sha256,
      manifest: new SkillManifest({
        protocol_version: 1,
        name: "another-skill",
        files: bundle.manifest.files
      }),
      uploaded_at: metadata.uploaded_at
    })
    const error = await run(verifySnapshot(mismatchedMetadata, bundle.bytes).pipe(Effect.flip))
    expect(error.message).toContain("manifest does not match")
  })
})

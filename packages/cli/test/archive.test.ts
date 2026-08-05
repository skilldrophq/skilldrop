import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { NodeCrypto } from "@effect/platform-node"
import { decodeTar, encodeTar, gzip, gunzip, sha256 } from "../src/archive.ts"

const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect)

describe("skill archive", () => {
  test("round trips regular files", async () => {
    const entries = [
      { path: "SKILL.md", content: new TextEncoder().encode("# Review PRs\n"), mode: 0o644 },
      { path: "scripts/check.sh", content: new TextEncoder().encode("#!/bin/sh\n"), mode: 0o755 }
    ]
    const archive = encodeTar(entries)
    const compressed = await run(gzip(archive))
    const restored = decodeTar(await run(gunzip(compressed)))

    expect(restored.map((entry) => [entry.path, entry.mode, new TextDecoder().decode(entry.content)]))
      .toEqual([
        ["SKILL.md", 0o644, "# Review PRs\n"],
        ["scripts/check.sh", 0o755, "#!/bin/sh\n"]
      ])
  })

  test("rejects traversal paths", () => {
    expect(() => encodeTar([{ path: "../SKILL.md", content: new Uint8Array(), mode: 0o644 }])).toThrow()
  })

  test("hashes bytes with the platform crypto service", async () => {
    const digest = await Effect.runPromise(
      sha256(new TextEncoder().encode("skilldrop")).pipe(Effect.provide(NodeCrypto.layer))
    )
    expect(digest).toHaveLength(64)
  })
})

import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClientRequest } from "effect/unstable/http"
import pkg from "../package.json" with { type: "json" }
import { parseSnapshotId, SKILLDROP_USER_AGENT, withSkilldropUserAgent } from "../src/api.ts"

const canonicalId = "7fx2kaAbCDefGhijkLmNop"

describe("snapshot IDs", () => {
  test("parses short and canonical IDs and URLs", async () => {
    const shortId = canonicalId.slice(0, 7)
    expect(await Effect.runPromise(parseSnapshotId(shortId))).toBe(shortId)
    expect(await Effect.runPromise(parseSnapshotId(`https://skilldrop.dev/s/${shortId}`))).toBe(shortId)
    expect(await Effect.runPromise(parseSnapshotId(canonicalId))).toBe(canonicalId)
    expect(await Effect.runPromise(parseSnapshotId(`https://skilldrop.dev/s/${canonicalId}`))).toBe(canonicalId)
  })

  test("keeps accepting legacy prefixed IDs", async () => {
    const legacyId = `sk_${canonicalId}`
    expect(await Effect.runPromise(parseSnapshotId(legacyId))).toBe(legacyId)
    expect(await Effect.runPromise(parseSnapshotId(`https://skilldrop.dev/s/${legacyId}`))).toBe(legacyId)
  })

  test("rejects malformed IDs", async () => {
    const error = await Effect.runPromise(parseSnapshotId("7fx2ka").pipe(Effect.flip))
    expect(error.message).toContain("Invalid Skilldrop snapshot")
  })
})

test("identifies CLI requests with a versioned user-agent", () => {
  expect(SKILLDROP_USER_AGENT).toBe(`skilldrop-cli/${pkg.version}`)
  const request = HttpClientRequest.get("https://skilldrop.dev").pipe(withSkilldropUserAgent)
  expect(request.headers["user-agent"]).toBe(SKILLDROP_USER_AGENT)
})

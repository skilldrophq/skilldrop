import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClientRequest } from "effect/unstable/http"
import pkg from "../package.json" with { type: "json" }
import { parseSnapshotId, SKILLDROP_USER_AGENT, withSkilldropUserAgent } from "../src/api.ts"

const canonicalId = "PL1mY4-71OQ6swagAcabqX"
const contentId = "5af18c2b19114f9d46e2e70acb7832f1eae3e19da095ce7cbad1329b12ea4e98"

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

  test("parses content-addressed IDs and URLs", async () => {
    const shortId = contentId.slice(0, 7)
    expect(await Effect.runPromise(parseSnapshotId(shortId))).toBe(shortId)
    expect(await Effect.runPromise(parseSnapshotId(contentId))).toBe(contentId)
    expect(await Effect.runPromise(parseSnapshotId(`https://skilldrop.dev/s/${contentId}`))).toBe(contentId)
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

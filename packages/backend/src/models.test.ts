import { expect, test } from "bun:test";
import * as Schema from "effect/Schema";
import { CanonicalSnapshotId, SnapshotId } from "./models";

const canonicalId = "PL1mY4-71OQ6swagAcabqX";
const contentId = "5af18c2b19114f9d46e2e70acb7832f1eae3e19da095ce7cbad1329b12ea4e98";

test("accepts prefix-free snapshot IDs", () => {
  expect(Schema.decodeUnknownSync(SnapshotId)(canonicalId)).toBe(canonicalId);
  expect(Schema.decodeUnknownSync(SnapshotId)(canonicalId.slice(0, 7))).toBe(
    canonicalId.slice(0, 7),
  );
});

test("keeps accepting legacy prefixed snapshot IDs", () => {
  const legacyId = `sk_${canonicalId}`;
  expect(Schema.decodeUnknownSync(SnapshotId)(legacyId)).toBe(legacyId);
});

test("accepts content-addressed snapshot IDs and prefixes", () => {
  expect(Schema.decodeUnknownSync(SnapshotId)(contentId)).toBe(contentId);
  expect(Schema.decodeUnknownSync(CanonicalSnapshotId)(contentId)).toBe(contentId);
  expect(Schema.decodeUnknownSync(SnapshotId)(contentId.slice(0, 7))).toBe(
    contentId.slice(0, 7),
  );
});

test("rejects malformed snapshot IDs", () => {
  expect(() => Schema.decodeUnknownSync(SnapshotId)("7fx2ka")).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(SnapshotId)(`${canonicalId}x`),
  ).toThrow();
});

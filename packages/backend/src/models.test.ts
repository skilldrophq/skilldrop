import { expect, test } from "bun:test";
import * as Schema from "effect/Schema";
import { SnapshotId } from "./models";

const canonicalId = "PL1mY4-71OQ6swagAcabqX";

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

test("rejects malformed snapshot IDs", () => {
  expect(() => Schema.decodeUnknownSync(SnapshotId)("7fx2ka")).toThrow();
  expect(() =>
    Schema.decodeUnknownSync(SnapshotId)(`${canonicalId}x`),
  ).toThrow();
});

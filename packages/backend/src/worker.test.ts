import { expect, test } from "bun:test";

import type { CanonicalSnapshotId } from "./models";
import {
  isSkilldropCliUserAgent,
  snapshotAliasCandidates,
  snapshotContentMatchesId,
} from "./worker";

test("builds Git-style snapshot aliases from seven characters", () => {
  const id = "PL1mY4-71OQ6swagAcabqX" as CanonicalSnapshotId;
  const candidates = snapshotAliasCandidates(id);

  expect(candidates[0]).toBe("PL1mY4-");
  expect(candidates[1]).toBe("PL1mY4-7");
  expect(candidates.at(-1)).toBe(id);
  expect(candidates).toHaveLength(16);
});

test("builds content-addressed aliases through the full SHA-256", () => {
  const id = "5af18c2b19114f9d46e2e70acb7832f1eae3e19da095ce7cbad1329b12ea4e98" as CanonicalSnapshotId;
  const candidates = snapshotAliasCandidates(id);

  expect(candidates[0]).toBe("5af18c2");
  expect(candidates[1]).toBe("5af18c2b");
  expect(candidates.at(-1)).toBe(id);
  expect(candidates).toHaveLength(58);
});

test("verifies content-addressed IDs without rejecting legacy IDs", () => {
  const id = "5af18c2b19114f9d46e2e70acb7832f1eae3e19da095ce7cbad1329b12ea4e98" as CanonicalSnapshotId;
  const legacyId = "PL1mY4-71OQ6swagAcabqX" as CanonicalSnapshotId;

  expect(snapshotContentMatchesId(id, id)).toBe(true);
  expect(snapshotContentMatchesId(id, "0".repeat(64))).toBe(false);
  expect(snapshotContentMatchesId(legacyId, "0".repeat(64))).toBe(true);
});

test("recognizes versioned Skilldrop CLI user-agents", () => {
  expect(isSkilldropCliUserAgent("skilldrop-cli/0.0.2")).toBe(true);
  expect(isSkilldropCliUserAgent("curl/8.7.1")).toBe(false);
  expect(isSkilldropCliUserAgent("")).toBe(false);
});

import { expect, test } from "bun:test";

import type { CanonicalSnapshotId } from "./models";
import { isSkilldropCliUserAgent, snapshotAliasCandidates } from "./worker";

test("builds Git-style snapshot aliases from seven characters", () => {
  const id = "PL1mY4-71OQ6swagAcabqX" as CanonicalSnapshotId;
  const candidates = snapshotAliasCandidates(id);

  expect(candidates[0]).toBe("PL1mY4-");
  expect(candidates[1]).toBe("PL1mY4-7");
  expect(candidates.at(-1)).toBe(id);
  expect(candidates).toHaveLength(16);
});

test("recognizes versioned Skilldrop CLI user-agents", () => {
  expect(isSkilldropCliUserAgent("skilldrop-cli/0.0.2")).toBe(true);
  expect(isSkilldropCliUserAgent("curl/8.7.1")).toBe(false);
  expect(isSkilldropCliUserAgent("")).toBe(false);
});

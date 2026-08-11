import { expect, test } from "bun:test";

import type { CanonicalSnapshotId } from "./models";
import { isSkilldropCliUserAgent, snapshotAliasCandidates } from "./worker";

test("builds Git-style snapshot aliases from seven characters", () => {
  const id = "7fx2kaAbCDefGhijkLmNop" as CanonicalSnapshotId;
  const candidates = snapshotAliasCandidates(id);

  expect(candidates[0]).toBe("7fx2kaA");
  expect(candidates[1]).toBe("7fx2kaAb");
  expect(candidates.at(-1)).toBe(id);
  expect(candidates).toHaveLength(16);
});

test("recognizes versioned Skilldrop CLI user-agents", () => {
  expect(isSkilldropCliUserAgent("skilldrop-cli/0.0.2")).toBe(true);
  expect(isSkilldropCliUserAgent("curl/8.7.1")).toBe(false);
  expect(isSkilldropCliUserAgent("")).toBe(false);
});

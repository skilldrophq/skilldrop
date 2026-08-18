import { describe, expect, test } from "bun:test";
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import type { Scope } from "effect/Scope";
import {
  makeAgentTopology,
  resolveAgentSelection,
  rootsForScopes,
} from "../src/agents.ts";

const run = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices | Scope>,
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

describe("agent topology", () => {
  test("resolves shared roots once for install, list, and doctor consumers", async () => {
    const topology = await run(
      makeAgentTopology({
        home: "/home/me",
        configHome: "/config/me",
        projectRoot: "/repo",
      }),
    );

    const sharedProjectRoot = rootsForScopes(topology, ["project"]).find(
      (root) => root.path === "/repo/.agents/skills",
    );
    expect(sharedProjectRoot?.agents.map((agent) => agent.name)).toEqual([
      "codex",
      "cursor",
      "gemini-cli",
      "github-copilot",
      "opencode",
      "universal",
    ]);
    expect(
      rootsForScopes(topology, ["global"]).find((root) =>
        root.agents.some((agent) => agent.name === "goose"),
      )?.path,
    ).toBe("/config/me/goose/skills");

    const selected = topology.definitions.filter((agent) =>
      agent.name === "claude-code" || agent.name === "universal",
    );
    expect(selected).toHaveLength(2);
    const selection = resolveAgentSelection(topology, selected, "project");
    expect(selection.canonicalRoot).toBe("/repo/.agents/skills");
    expect(selection.targetRoots).toEqual([
      "/repo/.claude/skills",
      "/repo/.agents/skills",
    ]);
  });
});

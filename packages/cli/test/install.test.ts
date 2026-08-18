import { describe, expect, test } from "bun:test";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import type { Scope } from "effect/Scope";
import type { AgentSelection } from "../src/agents.ts";
import { ManifestFile, SkillManifest } from "../src/archive.ts";
import {
  executeInstallation,
  prepareInstallation,
  renderInstallationPlan,
  type InstallableSkill,
} from "../src/install.ts";

const encoder = new TextEncoder();

const run = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices | Scope>,
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

const skill = new SkillManifest({
  protocol_version: 1,
  name: "review-pr",
  files: [new ManifestFile({ path: "SKILL.md", size: 13, sha256: "a".repeat(64) })],
});

const installable: InstallableSkill = {
  manifest: skill,
  files: [{ path: "SKILL.md", content: encoder.encode("# Review PR\n"), mode: 0o644 }],
};

describe("skill installation", () => {
  test("prepares one authoritative plan with overwrite warnings", async () => {
    const plan = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "install-plan" });
        const canonicalRoot = path.join(root, "canonical");
        const claudeRoot = path.join(root, "claude");
        yield* fs.makeDirectory(path.join(claudeRoot, "review-pr"), { recursive: true });
        const selection: AgentSelection = {
          agents: [
            {
              name: "claude-code",
              displayName: "Claude Code",
              projectSkillsDir: ".claude/skills",
              globalSkillsDir: claudeRoot,
              detectionPath: "",
            },
          ],
          canonicalRoot,
          targetRoots: [claudeRoot, canonicalRoot],
        };
        return yield* prepareInstallation({
          skill: installable,
          selection,
          scope: "project",
          copyFiles: false,
        });
      }),
    );

    expect(plan.mode).toBe("symlink");
    expect(plan.destinations).toHaveLength(2);
    expect(plan.existing).toHaveLength(1);
    expect(plan.existing[0]).toEndWith("claude/review-pr");
    expect(renderInstallationPlan(plan)).toContain("overwrites:");
  });

  test("executes the prepared plan through copy fallback reporting", async () => {
    const result = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "install-execute" });
        const targetRoot = path.join(root, "target");
        const selection: AgentSelection = {
          agents: [],
          canonicalRoot: path.join(root, "canonical"),
          targetRoots: [targetRoot],
        };
        const plan = yield* prepareInstallation({
          skill: installable,
          selection,
          scope: "project",
          copyFiles: false,
        });
        const executed = yield* executeInstallation(plan, installable);
        return {
          executed,
          content: yield* fs.readFileString(path.join(targetRoot, "review-pr", "SKILL.md")),
        };
      }),
    );

    expect(result.executed.fallbackCopies).toEqual([]);
    expect(result.content).toBe("# Review PR\n");
  });
});

import { describe, expect, test } from "bun:test";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import type { Scope } from "effect/Scope";
import type { Agent } from "../src/agents.ts";
import {
  dim,
  discoverInstalledSkills,
  renderInstalledSkills,
} from "../src/local-skills.ts";

const encoder = new TextEncoder();
const claude: Agent = {
  name: "claude-code",
  displayName: "Claude Code",
  projectSkillsDir: ".claude/skills",
  globalSkillsDir: "/home/me/.claude/skills",
  detectionPath: "/home/me/.claude",
};
const universal: Agent = {
  name: "universal",
  displayName: "Universal",
  projectSkillsDir: ".agents/skills",
  globalSkillsDir: "/home/me/.agents/skills",
  detectionPath: "",
};

const run = <A, E>(
  effect: Effect.Effect<A, E, NodeServices.NodeServices | Scope>,
) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

describe("installed skill discovery", () => {
  test("finds skills in project and global roots and ignores other directories", async () => {
    const skills = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fs.makeTempDirectoryScoped({
          prefix: "skilldrop-project",
        });
        const global = yield* fs.makeTempDirectoryScoped({
          prefix: "skilldrop-global",
        });
        yield* fs.makeDirectory(path.join(project, "review-pr"), {
          recursive: true,
        });
        yield* fs.writeFile(
          path.join(project, "review-pr", "SKILL.md"),
          encoder.encode("# Review PR\n"),
        );
        yield* fs.makeDirectory(path.join(project, "not-a-skill"), {
          recursive: true,
        });
        yield* fs.makeDirectory(path.join(global, "explain-code"), {
          recursive: true,
        });
        yield* fs.writeFile(
          path.join(global, "explain-code", "SKILL.md"),
          encoder.encode("# Explain code\n"),
        );

        return yield* discoverInstalledSkills([
          { path: project, scope: "project", agents: [] },
          { path: global, scope: "global", agents: [] },
        ]);
      }),
    );

    expect(skills.map((skill) => [skill.name, skill.scope])).toEqual([
      ["explain-code", "global"],
      ["review-pr", "project"],
    ]);
  });

  test("sorts project before global when a skill exists in both scopes", async () => {
    const skills = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project = yield* fs.makeTempDirectoryScoped({
          prefix: "skilldrop-project",
        });
        const global = yield* fs.makeTempDirectoryScoped({
          prefix: "skilldrop-global",
        });
        for (const root of [project, global]) {
          yield* fs.makeDirectory(path.join(root, "review-pr"), {
            recursive: true,
          });
          yield* fs.writeFile(
            path.join(root, "review-pr", "SKILL.md"),
            encoder.encode("# Review PR\n"),
          );
        }
        return yield* discoverInstalledSkills([
          { path: global, scope: "global", agents: [] },
          { path: project, scope: "project", agents: [] },
        ]);
      }),
    );

    expect(skills.map((skill) => skill.scope)).toEqual(["project", "global"]);
  });

  test("deduplicates the same physical skill root", async () => {
    const skills = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "skilldrop-shared",
        });
        yield* fs.makeDirectory(path.join(root, "review-pr"), {
          recursive: true,
        });
        yield* fs.writeFile(
          path.join(root, "review-pr", "SKILL.md"),
          encoder.encode("# Review PR\n"),
        );
        return yield* discoverInstalledSkills([
          { path: root, scope: "global", agents: [universal] },
          { path: root, scope: "global", agents: [universal] },
        ]);
      }),
    );

    expect(skills).toHaveLength(1);
  });

  test("groups the list by agent and scope and renders dimmed prompt metadata", () => {
    const output = renderInstalledSkills([
      {
        name: "review-pr",
        path: "/repo/.agents/skills/review-pr",
        scope: "project",
        agents: [universal],
      },
      {
        name: "docs",
        path: "/home/me/.claude/skills/docs",
        scope: "global",
        agents: [claude],
      },
    ]);

    expect(output).toContain("Installed skills 2 total");
    expect(output).toContain("● Claude Code\n  GLOBAL\n    docs");
    expect(output).toContain("● Universal\n  PROJECT\n    review-pr");

    const forceColor = process.env.FORCE_COLOR;
    const noColor = process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";
    delete process.env.NO_COLOR;
    expect(dim("project")).toBe("\u001b[2mproject\u001b[22m");
    if (forceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = forceColor;
    if (noColor !== undefined) process.env.NO_COLOR = noColor;
  });

  test("renders the same scoped skill once across multiple agents", () => {
    const output = renderInstalledSkills([
      {
        name: "review-pr",
        path: "/home/me/.claude/skills/review-pr",
        scope: "global",
        agents: [claude],
      },
      {
        name: "review-pr",
        path: "/home/me/.agents/skills/review-pr",
        scope: "global",
        agents: [universal],
      },
    ]);

    expect(output).toContain("Installed skills 1 total");
    expect(output).toContain(
      "● Claude Code + Universal\n  GLOBAL\n    review-pr",
    );
    expect(output.match(/    review-pr/g)).toHaveLength(1);
    expect(output).toContain("/home/me/.claude/skills/review-pr");
    expect(output).toContain("/home/me/.agents/skills/review-pr");
  });
});

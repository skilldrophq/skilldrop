import { Effect, FileSystem, Path } from "effect";
import type { AgentSelection } from "./agents.ts";
import type { ArchiveEntry, SkillManifest } from "./archive.ts";
import { installVerifiedSkill, linkInstalledSkill } from "./skill.ts";
import { heading, rows, section, ui, warningMessage } from "./ui.ts";

export interface InstallableSkill {
  readonly manifest: SkillManifest;
  readonly files: ReadonlyArray<ArchiveEntry>;
}

export interface InstallationPlan {
  readonly skillName: string;
  readonly fileCount: number;
  readonly scope: "project" | "global";
  readonly agents: AgentSelection["agents"];
  readonly mode: "copy" | "symlink";
  readonly canonicalRoot: string;
  readonly targetRoots: ReadonlyArray<string>;
  readonly destinations: ReadonlyArray<string>;
  readonly existing: ReadonlyArray<string>;
}

export interface InstallationResult {
  readonly fallbackCopies: ReadonlyArray<string>;
}

export const prepareInstallation = Effect.fn("prepareInstallation")(
  function* (input: {
    readonly skill: InstallableSkill;
    readonly selection: AgentSelection;
    readonly scope: "project" | "global";
    readonly copyFiles: boolean;
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const mode =
      input.copyFiles || input.selection.targetRoots.length === 1
        ? "copy"
        : "symlink";
    const roots =
      mode === "copy"
        ? input.selection.targetRoots
        : [input.selection.canonicalRoot, ...input.selection.targetRoots];
    const uniqueRoots = [...new Set(roots)];
    const destinations = uniqueRoots.map((root) =>
      path.join(root, input.skill.manifest.name),
    );
    const existing: Array<string> = [];
    for (const destination of destinations) {
      if (
        yield* fs.exists(destination).pipe(Effect.orElseSucceed(() => false))
      ) {
        existing.push(destination);
      }
    }
    return {
      skillName: input.skill.manifest.name,
      fileCount: input.skill.files.length,
      scope: input.scope,
      agents: input.selection.agents,
      mode,
      canonicalRoot: input.selection.canonicalRoot,
      targetRoots: input.selection.targetRoots,
      destinations,
      existing,
    } satisfies InstallationPlan;
  },
);

export const renderInstallationPlan = (plan: InstallationPlan) => {
  const lines = [
    heading(
      "Install",
      `${plan.skillName} · ${plan.fileCount} ${plan.fileCount === 1 ? "file" : "files"}`,
    ),
    ...rows([
      ["scope", plan.scope],
      ["agents", plan.agents.map((agent) => agent.displayName).join(", ")],
      ["method", plan.mode],
    ]),
    "",
    section("Destinations", plan.destinations.length),
    ...plan.destinations.map(
      (destination) => `  ${ui.accent("→")} ${ui.path(destination)}`,
    ),
  ];
  if (plan.existing.length > 0) {
    const noun = plan.existing.length === 1 ? "installation" : "installations";
    lines.push(
      "",
      warningMessage(
        `${plan.existing.length} existing ${noun} will be replaced`,
      ),
    );
    lines.push(
      ...plan.existing.map((destination) => `  ${ui.path(destination)}`),
    );
  }
  return lines.join("\n");
};

export const executeInstallation = Effect.fn("executeInstallation")(function* (
  plan: InstallationPlan,
  skill: InstallableSkill,
) {
  const fallbackCopies: Array<string> = [];
  if (plan.mode === "copy") {
    for (const targetRoot of plan.targetRoots) {
      yield* installVerifiedSkill(
        targetRoot,
        skill.manifest,
        skill.files,
        true,
      );
    }
  } else {
    const canonical = yield* installVerifiedSkill(
      plan.canonicalRoot,
      skill.manifest,
      skill.files,
      true,
    );
    for (const targetRoot of plan.targetRoots) {
      const result = yield* linkInstalledSkill(
        canonical,
        targetRoot,
        skill.manifest.name,
        skill.files,
      );
      if (result.mode === "copy") fallbackCopies.push(result.path);
    }
  }
  return { fallbackCopies } satisfies InstallationResult;
});

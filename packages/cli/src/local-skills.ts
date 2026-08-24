import { Effect, FileSystem, Path } from "effect";
import {
  type Agent,
  type AgentRoot,
  loadAgentTopology,
  rootsForScopes,
  type SkillScope,
} from "./agents.ts";
import { CliError, messageFromCause } from "./errors.ts";
import { heading, ui, warningMessage } from "./ui.ts";

export type { AgentRoot as SkillRoot, SkillScope } from "./agents.ts";

export interface InstalledSkill {
  readonly name: string;
  readonly path: string;
  readonly scope: SkillScope;
  readonly agents: ReadonlyArray<Agent>;
}

const scopeOrder = (scope: SkillScope) => (scope === "project" ? 0 : 1);

export const discoverInstalledSkills = Effect.fn("discoverInstalledSkills")(
  function* (roots: ReadonlyArray<AgentRoot>) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const installed: Array<InstalledSkill> = [];
    const seen = new Set<string>();

    for (const root of roots) {
      if (
        !(yield* fs.exists(root.path).pipe(Effect.orElseSucceed(() => false)))
      )
        continue;
      const children = yield* fs.readDirectory(root.path).pipe(
        Effect.mapError(
          (cause) =>
            new CliError({
              message: `Could not list installed skills in ${root.path}: ${messageFromCause(cause)}`,
            }),
        ),
      );
      children.sort((left, right) => left.localeCompare(right));
      for (const name of children) {
        const skillPath = path.join(root.path, name);
        const hasSkillMarkdown = yield* fs
          .exists(path.join(skillPath, "SKILL.md"))
          .pipe(Effect.orElseSucceed(() => false));
        const key = `${root.scope}:${skillPath}`;
        if (hasSkillMarkdown && !seen.has(key)) {
          seen.add(key);
          installed.push({
            name,
            path: skillPath,
            scope: root.scope,
            agents: root.agents,
          });
        }
      }
    }

    return installed.sort(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        scopeOrder(left.scope) - scopeOrder(right.scope) ||
        left.path.localeCompare(right.path),
    );
  },
);

export const loadInstalledSkills = Effect.fn("loadInstalledSkills")(function* (
  scopes: ReadonlyArray<SkillScope> = ["project", "global"],
) {
  const topology = yield* loadAgentTopology();
  return yield* discoverInstalledSkills(rootsForScopes(topology, scopes));
});

export const skillAgentGroup = (skill: InstalledSkill) => {
  const universal = skill.agents.find((agent) => agent.name === "universal");
  if (universal !== undefined) return universal.displayName;
  return skill.agents.map((agent) => agent.displayName).join(", ") || "Other";
};

const groupBy = <A>(items: ReadonlyArray<A>, keyOf: (item: A) => string) => {
  const groups = new Map<string, Array<A>>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [item]);
    else group.push(item);
  }
  return groups;
};

export const renderInstalledSkills = (
  skills: ReadonlyArray<InstalledSkill>,
) => {
  if (skills.length === 0) return warningMessage("No installed skills found");
  const deduplicated = new Map<
    string,
    {
      readonly name: string;
      readonly scope: SkillScope;
      readonly agents: Set<string>;
      readonly paths: Set<string>;
    }
  >();
  for (const skill of skills) {
    const key = `${skill.scope}:${skill.name}`;
    const existing = deduplicated.get(key);
    if (existing === undefined) {
      deduplicated.set(key, {
        name: skill.name,
        scope: skill.scope,
        agents: new Set([skillAgentGroup(skill)]),
        paths: new Set([skill.path]),
      });
    } else {
      existing.agents.add(skillAgentGroup(skill));
      existing.paths.add(skill.path);
    }
  }
  const entries = [...deduplicated.values()].map((entry) => ({
    ...entry,
    group: [...entry.agents]
      .sort((left, right) => left.localeCompare(right))
      .join(" + "),
    paths: [...entry.paths].sort((left, right) => left.localeCompare(right)),
  }));
  const groups = groupBy(entries, (entry) => entry.group);
  const lines = [heading("Installed skills", `${entries.length} total`)];
  for (const [group, groupedSkills] of [...groups].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    lines.push("", `${ui.accent("●")} ${ui.bold(group)}`);
    const scopes = groupBy(groupedSkills, (entry) => entry.scope);
    for (const scope of ["project", "global"] as const) {
      const scopedEntries = scopes.get(scope);
      if (scopedEntries === undefined) continue;
      lines.push(`  ${ui.dim(scope.toUpperCase())}`);
      for (const entry of scopedEntries.sort((left, right) =>
        left.name.localeCompare(right.name),
      )) {
        lines.push(`    ${ui.bold(entry.name)}`);
        for (const path of entry.paths)
          lines.push(`      ${ui.dim("↳")} ${ui.path(path)}`);
      }
    }
  }
  return lines.join("\n");
};

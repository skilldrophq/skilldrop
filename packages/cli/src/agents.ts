import { Config, Effect, FileSystem, Path } from "effect"
import { CliError } from "./errors.ts"

export const agentNames = [
  "aider-desk",
  "claude-code",
  "codex",
  "cursor",
  "gemini-cli",
  "github-copilot",
  "goose",
  "opencode",
  "openhands",
  "universal"
] as const

export type AgentName = typeof agentNames[number]
export type SkillScope = "project" | "global"

export interface Agent {
  readonly name: AgentName
  readonly displayName: string
  readonly projectSkillsDir: string
  readonly globalSkillsDir: string
  readonly detectionPath: string
}

export interface AgentRoot {
  readonly path: string
  readonly scope: SkillScope
  readonly agents: ReadonlyArray<Agent>
}

export interface AgentTopology {
  readonly home: string
  readonly projectRoot: string
  readonly definitions: ReadonlyArray<Agent>
  readonly roots: ReadonlyArray<AgentRoot>
  readonly canonicalRoots: Readonly<Record<SkillScope, string>>
}

export interface AgentSelection {
  readonly agents: ReadonlyArray<Agent>
  readonly canonicalRoot: string
  readonly targetRoots: ReadonlyArray<string>
}

export const makeAgentTopology = Effect.fn("makeAgentTopology")(function*(input: {
  readonly home: string
  readonly configHome: string
  readonly projectRoot: string
}) {
  const path = yield* Path.Path
  const definitions: ReadonlyArray<Agent> = [
    { name: "aider-desk", displayName: "AiderDesk", projectSkillsDir: ".aider-desk/skills", globalSkillsDir: path.join(input.home, ".aider-desk/skills"), detectionPath: path.join(input.home, ".aider-desk") },
    { name: "claude-code", displayName: "Claude Code", projectSkillsDir: ".claude/skills", globalSkillsDir: path.join(input.home, ".claude/skills"), detectionPath: path.join(input.home, ".claude") },
    { name: "codex", displayName: "Codex", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(input.home, ".agents/skills"), detectionPath: path.join(input.home, ".codex") },
    { name: "cursor", displayName: "Cursor", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(input.home, ".agents/skills"), detectionPath: path.join(input.home, ".cursor") },
    { name: "gemini-cli", displayName: "Gemini CLI", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(input.home, ".agents/skills"), detectionPath: path.join(input.home, ".gemini") },
    { name: "github-copilot", displayName: "GitHub Copilot", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(input.home, ".agents/skills"), detectionPath: path.join(input.home, ".copilot") },
    { name: "goose", displayName: "Goose", projectSkillsDir: ".goose/skills", globalSkillsDir: path.join(input.configHome, "goose/skills"), detectionPath: path.join(input.configHome, "goose") },
    { name: "opencode", displayName: "OpenCode", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(input.home, ".agents/skills"), detectionPath: path.join(input.configHome, "opencode") },
    { name: "openhands", displayName: "OpenHands", projectSkillsDir: ".openhands/skills", globalSkillsDir: path.join(input.home, ".openhands/skills"), detectionPath: path.join(input.home, ".openhands") },
    { name: "universal", displayName: "Universal", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(input.home, ".agents/skills"), detectionPath: "" }
  ]
  const roots = new Map<string, { path: string; scope: SkillScope; agents: Array<Agent> }>()
  for (const scope of ["project", "global"] as const) {
    for (const agent of definitions) {
      const root = scope === "project"
        ? path.join(input.projectRoot, ...agent.projectSkillsDir.split("/"))
        : agent.globalSkillsDir
      const key = `${scope}:${root}`
      const existing = roots.get(key)
      if (existing === undefined) roots.set(key, { path: root, scope, agents: [agent] })
      else existing.agents.push(agent)
    }
  }
  return {
    home: input.home,
    projectRoot: input.projectRoot,
    definitions,
    roots: [...roots.values()],
    canonicalRoots: {
      project: path.join(input.projectRoot, ".agents", "skills"),
      global: path.join(input.home, ".agents", "skills")
    }
  } satisfies AgentTopology
})

export const loadAgentTopology = Effect.fn("loadAgentTopology")(function*() {
  const path = yield* Path.Path
  const home = yield* Config.string("HOME").pipe(
    Effect.mapError(() => new CliError({ message: "Could not determine the home directory" }))
  )
  const configHome = yield* Config.string("XDG_CONFIG_HOME").pipe(
    Effect.orElseSucceed(() => path.join(home, ".config"))
  )
  return yield* makeAgentTopology({
    home,
    configHome,
    projectRoot: path.resolve(".")
  })
})

export const rootsForScopes = (
  topology: AgentTopology,
  scopes: ReadonlyArray<SkillScope> = ["project", "global"]
) => topology.roots.filter((root) => scopes.includes(root.scope))

export const detectInstalledAgents = Effect.fn("detectInstalledAgents")(function*(
  topology: AgentTopology
) {
  const fs = yield* FileSystem.FileSystem
  const detected: Array<Agent> = []
  for (const agent of topology.definitions) {
    if (agent.name !== "universal" && (yield* fs.exists(agent.detectionPath).pipe(Effect.orElseSucceed(() => false)))) {
      detected.push(agent)
    }
  }
  return detected
})

export const resolveAgentSelection = (
  topology: AgentTopology,
  selected: ReadonlyArray<Agent>,
  scope: SkillScope
): AgentSelection => {
  const selectedNames = new Set(selected.map((agent) => agent.name))
  const targetRoots = topology.roots.flatMap((root) =>
    root.scope === scope && root.agents.some((agent) => selectedNames.has(agent.name))
      ? [root.path]
      : []
  )
  return {
    agents: selected,
    canonicalRoot: topology.canonicalRoots[scope],
    targetRoots
  }
}

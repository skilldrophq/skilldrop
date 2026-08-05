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

export interface Agent {
  readonly name: AgentName
  readonly displayName: string
  readonly projectSkillsDir: string
  readonly globalSkillsDir: string
  readonly detectionPath: string
}

export interface AgentSelection {
  readonly agents: ReadonlyArray<Agent>
  readonly canonicalRoot: string
  readonly targetRoots: ReadonlyArray<string>
}

export const loadAgents = Effect.fn("loadAgents")(function*() {
  const path = yield* Path.Path
  const home = yield* Config.string("HOME").pipe(
    Effect.mapError(() => new CliError({ message: "Could not determine the home directory" }))
  )
  const configHome = yield* Config.string("XDG_CONFIG_HOME").pipe(Effect.orElseSucceed(() => path.join(home, ".config")))
  const definitions: ReadonlyArray<Agent> = [
    { name: "aider-desk", displayName: "AiderDesk", projectSkillsDir: ".aider-desk/skills", globalSkillsDir: path.join(home, ".aider-desk/skills"), detectionPath: path.join(home, ".aider-desk") },
    { name: "claude-code", displayName: "Claude Code", projectSkillsDir: ".claude/skills", globalSkillsDir: path.join(home, ".claude/skills"), detectionPath: path.join(home, ".claude") },
    { name: "codex", displayName: "Codex", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(home, ".agents/skills"), detectionPath: path.join(home, ".codex") },
    { name: "cursor", displayName: "Cursor", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(home, ".agents/skills"), detectionPath: path.join(home, ".cursor") },
    { name: "gemini-cli", displayName: "Gemini CLI", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(home, ".agents/skills"), detectionPath: path.join(home, ".gemini") },
    { name: "github-copilot", displayName: "GitHub Copilot", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(home, ".agents/skills"), detectionPath: path.join(home, ".copilot") },
    { name: "goose", displayName: "Goose", projectSkillsDir: ".goose/skills", globalSkillsDir: path.join(configHome, "goose/skills"), detectionPath: path.join(configHome, "goose") },
    { name: "opencode", displayName: "OpenCode", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(home, ".agents/skills"), detectionPath: path.join(configHome, "opencode") },
    { name: "openhands", displayName: "OpenHands", projectSkillsDir: ".openhands/skills", globalSkillsDir: path.join(home, ".openhands/skills"), detectionPath: path.join(home, ".openhands") },
    { name: "universal", displayName: "Universal", projectSkillsDir: ".agents/skills", globalSkillsDir: path.join(home, ".agents/skills"), detectionPath: "" }
  ]
  return { home, definitions }
})

export const detectInstalledAgents = Effect.fn("detectInstalledAgents")(function*(agents: ReadonlyArray<Agent>) {
  const fs = yield* FileSystem.FileSystem
  const detected: Array<Agent> = []
  for (const agent of agents) {
    if (agent.name !== "universal" && (yield* fs.exists(agent.detectionPath).pipe(Effect.orElseSucceed(() => false)))) {
      detected.push(agent)
    }
  }
  return detected
})

export const resolveAgentSelection = Effect.fn("resolveAgentSelection")(function*(
  selected: ReadonlyArray<Agent>,
  scope: "project" | "global"
) {
  const path = yield* Path.Path
  const { home } = yield* loadAgents()
  const base = scope === "global" ? home : path.resolve(".")
  const canonicalRoot = path.join(base, ".agents", "skills")
  const roots = new Set<string>()
  for (const agent of selected) {
    roots.add(scope === "global"
      ? agent.globalSkillsDir
      : path.join(base, ...agent.projectSkillsDir.split("/")))
  }
  return {
    agents: selected,
    canonicalRoot,
    targetRoots: [...roots]
  } satisfies AgentSelection
})

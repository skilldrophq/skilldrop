import { fileURLToPath } from "node:url"
import { Console, Effect, FileSystem, Option, Path } from "effect"
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli"
import { agentNames, detectInstalledAgents, loadAgents, resolveAgentSelection, type Agent, type AgentName } from "./agents.ts"
import { SkilldropApi, parseSnapshotId } from "./api.ts"
import { sha256, type ArchiveEntry, type SkillManifest } from "./archive.ts"
import { renderSnapshotInspection, verifySnapshot } from "./inspect.ts"
import { buildSkillBundle, installVerifiedSkill, linkInstalledSkill, verifySkillBundle } from "./skill.ts"

const productionApiUrl = "https://skilldrop.dev"
const bundledSkillPath = fileURLToPath(new URL("../skills/use-skilldrop", import.meta.url))

interface InstallableSkill {
  readonly manifest: SkillManifest
  readonly files: ReadonlyArray<ArchiveEntry>
}

export const makeCommand = (devMode: boolean) => {
  const base = Command.make("sk").pipe(
    Command.withDescription("Share and install agent skills")
  )
  const root = devMode
    ? base.pipe(Command.withSharedFlags({
        apiUrl: Flag.string("api-url").pipe(
          Flag.withDescription("Skilldrop server URL (development only)"),
          Flag.withDefault(productionApiUrl)
        )
      }))
    : base

  const getApiUrl = Effect.fn("getApiUrl")(function*() {
    if (!devMode) return productionApiUrl
    const options = yield* root
    return (options as { readonly apiUrl: string }).apiUrl
  })

  const loadSnapshot = Effect.fn("loadSnapshot")(function*(snapshot: string) {
    const apiUrl = yield* getApiUrl()
    const api = yield* SkilldropApi
    const id = yield* parseSnapshotId(snapshot)
    const metadata = yield* api.metadata(apiUrl, id)
    const compressed = yield* api.download(apiUrl, id)
    const verified = yield* verifySnapshot(metadata, compressed)
    return { metadata, verified }
  })

  const share = Command.make(
  "share",
  {
    path: Argument.string("path").pipe(Argument.withDescription("Path to a skill directory"))
  },
  Effect.fn("shareCommand")(function*({ path }) {
    const apiUrl = yield* getApiUrl()
    const api = yield* SkilldropApi
    yield* Console.log(`Validating ${path}…`)
    const bundle = yield* buildSkillBundle(path)
    const created = yield* api.create(apiUrl)
    yield* api.upload(created.upload_url, bundle.bytes)
    const url = new URL(`/s/${created.id}`, apiUrl).toString()
    yield* Console.log(`Shared ${bundle.manifest.name}`)
    yield* Console.log(url)
    yield* Console.log(`Install with: sk install ${url}`)
  })
).pipe(
  Command.withDescription("Create an immutable snapshot of a local skill"),
  Command.withAlias("s"),
  Command.withExamples([{ command: "sk share ~/.claude/skills/review-pr", description: "Share a local skill" }])
)

  const inspect = Command.make(
    "inspect",
    {
      snapshot: Argument.string("snapshot").pipe(Argument.withDescription("Snapshot URL or ID"))
    },
    Effect.fn("inspectCommand")(function*({ snapshot }) {
      const { metadata, verified } = yield* loadSnapshot(snapshot)
      yield* Console.log(renderSnapshotInspection(metadata, verified.files))
    })
  ).pipe(
    Command.withDescription("Verify and inspect a shared skill without installing it"),
    Command.withExamples([{ command: "sk inspect https://skilldrop.dev/s/7fx2ka…", description: "Inspect a shared skill" }])
  )

  const agent = Flag.choice("agent", agentNames).pipe(
  Flag.withAlias("a"),
  Flag.withDescription("Agent to install for (repeatable)"),
  Flag.atMost(10)
)

  const scope = Flag.choice("scope", ["project", "global"] as const).pipe(
  Flag.withDescription("Install in this project or globally"),
  Flag.optional
)

  const yes = Flag.boolean("yes").pipe(
    Flag.withAlias("y"),
    Flag.withDescription("Accept detected defaults and skip confirmation")
  )

  const copy = Flag.boolean("copy").pipe(
    Flag.withDescription("Copy into each agent directory instead of symlinking")
  )

  const installSkill = Effect.fn("installSkill")(function*(
    verified: InstallableSkill,
    requestedNames: ReadonlyArray<AgentName>,
    requestedScope: Option.Option<"project" | "global">,
    acceptDefaults: boolean,
    copyFiles: boolean,
    defaultScope: "project" | "global"
  ) {
    const path = yield* Path.Path
    const fs = yield* FileSystem.FileSystem
    const { definitions } = yield* loadAgents()
    let selected: ReadonlyArray<Agent>
    if (requestedNames.length > 0) {
      selected = requestedNames.map((name) => definitions.find((candidate) => candidate.name === name)!)
    } else {
      const detected = yield* detectInstalledAgents(definitions)
      if (acceptDefaults) {
        selected = [...detected, ...definitions.filter((candidate) => candidate.name === "universal")]
      } else {
        const initial = detected.length > 0
          ? new Set(detected.map((candidate) => candidate.name))
          : new Set<AgentName>(["claude-code", "codex", "opencode"])
        const prompted = yield* Prompt.run(Prompt.multiSelect({
          message: "Which agents do you want to install to?",
          min: 1,
          choices: definitions.map((candidate) => ({
            title: candidate.displayName,
            value: candidate,
            selected: initial.has(candidate.name)
          }))
        }))
        const universal = definitions.find((candidate) => candidate.name === "universal")!
        selected = prompted.some((candidate) => candidate.name === "universal")
          ? prompted
          : [...prompted, universal]
      }
    }

    const selectedScope = Option.match(requestedScope, {
      onNone: () => acceptDefaults
        ? Effect.succeed(defaultScope)
        : Prompt.run(Prompt.select({
            message: "Installation scope",
            choices: [
              { title: "Project", value: "project" as const, description: "Install in the current project" },
              { title: "Global", value: "global" as const, description: "Install for all projects" }
            ]
          })),
      onSome: (value) => Effect.succeed(value)
    })
    const installScope = yield* selectedScope
    const selection = yield* resolveAgentSelection(selected, installScope)
    const mode = copyFiles || selection.targetRoots.length === 1 ? "copy" : "symlink"
    const destinations = mode === "copy" ? selection.targetRoots : [selection.canonicalRoot, ...selection.targetRoots]
    const uniqueDestinations = [...new Set(destinations)]
    const existing: Array<string> = []
    for (const root of uniqueDestinations) {
      const destination = path.join(root, verified.manifest.name)
      if (yield* fs.exists(destination).pipe(Effect.orElseSucceed(() => false))) existing.push(destination)
    }

    yield* Console.log("")
    yield* Console.log(`Install ${verified.manifest.name} (${verified.files.length} files)`)
    yield* Console.log(`  scope: ${installScope}`)
    yield* Console.log(`  agents: ${selected.map((item) => item.displayName).join(", ")}`)
    yield* Console.log(`  method: ${mode}`)
    for (const destination of uniqueDestinations) yield* Console.log(`  → ${destination}`)
    for (const destination of existing) yield* Console.log(`  overwrites: ${destination}`)

    if (!acceptDefaults) {
      const confirmed = yield* Prompt.run(Prompt.confirm({ message: "Proceed with installation?" }))
      if (!confirmed) {
        yield* Console.log("Installation cancelled")
        return
      }
    }

    if (mode === "copy") {
      for (const targetRoot of selection.targetRoots) {
        yield* installVerifiedSkill(targetRoot, verified.manifest, verified.files, true)
      }
    } else {
      const canonical = yield* installVerifiedSkill(selection.canonicalRoot, verified.manifest, verified.files, true)
      for (const targetRoot of selection.targetRoots) {
        const result = yield* linkInstalledSkill(canonical, targetRoot, verified.manifest.name, verified.files)
        if (result.mode === "copy") yield* Console.log(`Symlink unavailable; copied to ${result.path}`)
      }
    }
    yield* Console.log(`Installed ${verified.manifest.name}`)
  })

  const install = Command.make(
  "install",
  {
    snapshot: Argument.string("snapshot").pipe(Argument.withDescription("Snapshot URL or ID")),
    agent,
    scope,
    yes,
    copy
  },
  Effect.fn("installCommand")(function*({ snapshot, agent: requestedNames, scope: requestedScope, yes, copy }) {
    const { verified } = yield* loadSnapshot(snapshot)
    yield* installSkill(verified, requestedNames, requestedScope, yes, copy, "project")
  })
).pipe(
  Command.withDescription("Verify and install a shared skill"),
  Command.withAlias("i"),
  Command.withExamples([{ command: "sk install https://skilldrop.dev/s/7fx2ka…", description: "Install a shared skill" }])
)

  const setup = Command.make(
    "setup",
    { agent, scope, yes, copy },
    Effect.fn("setupCommand")(function*({ agent: requestedNames, scope: requestedScope, yes, copy }) {
      const bundle = yield* buildSkillBundle(bundledSkillPath)
      const hash = yield* sha256(bundle.bytes)
      const verified = yield* verifySkillBundle(bundle.bytes, hash)
      yield* installSkill(verified, requestedNames, requestedScope, yes, copy, "global")
    })
  ).pipe(
    Command.withDescription("Install the bundled skill for using the sk CLI"),
    Command.withExamples([{ command: "sk setup --yes", description: "Install the Skilldrop skill globally" }])
  )

  return root.pipe(Command.withSubcommands([share, inspect, install, setup]))
}

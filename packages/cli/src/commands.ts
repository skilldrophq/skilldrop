import { fileURLToPath } from "node:url";
import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";
import {
  type Agent,
  type AgentName,
  agentNames,
  detectInstalledAgents,
  loadAgents,
  resolveAgentSelection,
} from "./agents.ts";

import { type SkillManifest, sha256 } from "./archive.ts";
import { renderDoctorReport, runDoctor } from "./doctor.ts";
import { CliError } from "./errors.ts";
import {
  executeInstallation,
  type InstallableSkill,
  prepareInstallation,
  renderInstallationPlan,
} from "./install.ts";
import { renderSnapshotInspection } from "./inspect.ts";
import {
  dim,
  loadInstalledSkills,
  renderInstalledSkills,
  type SkillScope,
  skillAgentGroup,
} from "./local-skills.ts";
import { buildSkillBundle, verifySkillBundle } from "./skill.ts";
import { loadVerifiedSnapshot, publishSnapshot } from "./snapshots.ts";

const productionApiUrl = "https://skilldrop.dev";
const bundledSkillPath = fileURLToPath(
  new URL("../skills/use-skilldrop", import.meta.url),
);

const renderOutboundManifest = (bundle: {
  readonly bytes: Uint8Array;
  readonly id: string;
  readonly manifest: SkillManifest;
}) =>
  [
    `Outbound files (${bundle.manifest.files.length + 1}):`,
    ...bundle.manifest.files.map(
      (file) => `  ${file.path} (${file.size} bytes)`,
    ),
    "  skilldrop.manifest.json (generated)",
    `Bundle: ${bundle.bytes.byteLength} bytes compressed`,
    `Content ID: ${bundle.id}`,
  ].join("\n");

export const makeCommand = (devMode: boolean) => {
  const base = Command.make("sk").pipe(
    Command.withDescription("Share and install agent skills"),
  );
  const root = devMode
    ? base.pipe(
        Command.withSharedFlags({
          apiUrl: Flag.string("api-url").pipe(
            Flag.withDescription("Skilldrop server URL (development only)"),
            Flag.withDefault(productionApiUrl),
          ),
        }),
      )
    : base;

  const getApiUrl = Effect.fn("getApiUrl")(function* () {
    if (!devMode) return productionApiUrl;
    const options = yield* root;
    return (options as { readonly apiUrl: string }).apiUrl;
  });

  const loadSnapshot = Effect.fn("loadSnapshot")(function* (snapshot: string) {
    const apiUrl = yield* getApiUrl();
    return yield* loadVerifiedSnapshot(apiUrl, snapshot);
  });

  const agent = Flag.choice("agent", agentNames).pipe(
    Flag.withAlias("a"),
    Flag.withDescription("Agent to install for (repeatable)"),
    Flag.atMost(10),
  );

  const scope = Flag.choice("scope", ["project", "global"] as const).pipe(
    Flag.withDescription("Install in this project or globally"),
    Flag.optional,
  );

  const yes = Flag.boolean("yes").pipe(
    Flag.optional,
    Flag.withAlias("y"),
    Flag.withDescription("Accept detected defaults and skip confirmation"),
  );

  const copy = Flag.boolean("copy").pipe(
    Flag.optional,
    Flag.withDescription(
      "Copy into each agent directory instead of symlinking",
    ),
  );

  const share = Command.make(
    "share",
    {
      path: Argument.string("path").pipe(
        Argument.withDescription("Path to a skill directory"),
        Argument.optional,
      ),
      dryRun: Flag.boolean("dry-run").pipe(
        Flag.withDescription(
          "Show the exact outbound manifest without uploading",
        ),
        Flag.optional,
      ),
    },
    Effect.fn("shareCommand")(function* ({ path, dryRun }) {
      const selectedPath = yield* Option.match(path, {
        onNone: () =>
          Effect.gen(function* () {
            const skills = yield* loadInstalledSkills();
            if (skills.length === 0) {
              return yield* new CliError({
                message:
                  "No installed skills found. Pass a path with: sk share <path>",
              });
            }
            return yield* Prompt.run(
              Prompt.select({
                message: "Which skill do you want to share?",
                choices: skills.map((skill) => ({
                  title: `${skill.name} ${dim(`${skill.scope} · ${skillAgentGroup(skill)}`)}`,
                  description: skill.path,
                  value: skill.path,
                })),
              }),
            );
          }),
        onSome: Effect.succeed,
      });
      yield* Console.log(`Validating ${selectedPath}…`);
      const bundle = yield* buildSkillBundle(selectedPath);
      yield* Console.log(renderOutboundManifest(bundle));
      if (Option.isSome(dryRun) && dryRun.value) {
        yield* Console.log("Dry run complete; nothing was uploaded");
        return;
      }
      const apiUrl = yield* getApiUrl();
      const published = yield* publishSnapshot(apiUrl, bundle);
      yield* Console.log(`Shared ${bundle.manifest.name}`);
      yield* Console.log(published.url);
      yield* Console.log(`Install with: sk install ${published.url}`);
    }),
  ).pipe(
    Command.withDescription("Create an immutable snapshot of a local skill"),
    Command.withAlias("s"),
    Command.withExamples([
      {
        command: "sk share ~/.claude/skills/review-pr",
        description: "Share a local skill",
      },
      {
        command: "sk share ./my-skill --dry-run",
        description: "Preview the outbound manifest",
      },
    ]),
  );

  const validate = Command.make(
    "validate",
    {
      path: Argument.string("path").pipe(
        Argument.withDescription("Path to a skill directory"),
      ),
    },
    Effect.fn("validateCommand")(function* ({ path }) {
      const bundle = yield* buildSkillBundle(path);
      yield* Console.log(`Valid ${bundle.manifest.name}`);
      yield* Console.log(`  files: ${bundle.manifest.files.length}`);
      yield* Console.log(`  bundle: ${bundle.bytes.byteLength} bytes`);
    }),
  ).pipe(
    Command.withDescription("Validate a local skill without sharing it"),
    Command.withExamples([
      {
        command: "sk validate ./my-skill",
        description: "Validate a local skill",
      },
    ]),
  );

  const list = Command.make(
    "list",
    {
      scope: Flag.choice("scope", ["project", "global"] as const).pipe(
        Flag.withDescription("Only list skills from this scope"),
        Flag.optional,
      ),
    },
    Effect.fn("listCommand")(function* ({ scope }) {
      const scopes: ReadonlyArray<SkillScope> = Option.match(scope, {
        onNone: () => ["project", "global"],
        onSome: (value) => [value],
      });
      const skills = yield* loadInstalledSkills(scopes);
      yield* Console.log(renderInstalledSkills(skills));
    }),
  ).pipe(
    Command.withDescription("List installed skills"),
    Command.withAlias("ls"),
    Command.withExamples([
      {
        command: "sk list --scope project",
        description: "List project skills",
      },
    ]),
  );

  const doctor = Command.make(
    "doctor",
    {},
    Effect.fn("doctorCommand")(function* () {
      const checks = yield* runDoctor();
      yield* Console.log(renderDoctorReport(checks));
    }),
  ).pipe(Command.withDescription("Check the local Skilldrop environment"));

  const inspect = Command.make(
    "inspect",
    {
      snapshot: Argument.string("snapshot").pipe(
        Argument.withDescription("Snapshot URL or ID"),
      ),
    },
    Effect.fn("inspectCommand")(function* ({ snapshot }) {
      const { metadata, verified } = yield* loadSnapshot(snapshot);
      yield* Console.log(renderSnapshotInspection(metadata, verified.files));
    }),
  ).pipe(
    Command.withDescription(
      "Verify and inspect a shared skill without installing it",
    ),
    Command.withExamples([
      {
        command: "sk inspect https://skilldrop.dev/s/PL1mY4-",
        description: "Inspect a shared skill",
      },
    ]),
  );

  const installSkill = Effect.fn("installSkill")(function* (
    verified: InstallableSkill,
    requestedNames: ReadonlyArray<AgentName>,
    requestedScope: Option.Option<"project" | "global">,
    acceptDefaults: boolean,
    copyFiles: boolean,
    defaultScope: "project" | "global",
  ) {
    const { definitions } = yield* loadAgents();
    let selected: ReadonlyArray<Agent>;
    if (requestedNames.length > 0) {
      selected = requestedNames.map(
        (name) => definitions.find((candidate) => candidate.name === name)!,
      );
    } else {
      const detected = yield* detectInstalledAgents(definitions);
      if (acceptDefaults) {
        selected = [
          ...detected,
          ...definitions.filter((candidate) => candidate.name === "universal"),
        ];
      } else {
        const initial =
          detected.length > 0
            ? new Set(detected.map((candidate) => candidate.name))
            : new Set<AgentName>(["claude-code", "codex", "opencode"]);
        const prompted = yield* Prompt.run(
          Prompt.multiSelect({
            message: "Which agents do you want to install to?",
            min: 1,
            choices: definitions.map((candidate) => ({
              title: candidate.displayName,
              value: candidate,
              selected: initial.has(candidate.name),
            })),
          }),
        );
        const universal = definitions.find(
          (candidate) => candidate.name === "universal",
        )!;
        selected = prompted.some((candidate) => candidate.name === "universal")
          ? prompted
          : [...prompted, universal];
      }
    }

    const selectedScope = Option.match(requestedScope, {
      onNone: () =>
        acceptDefaults
          ? Effect.succeed(defaultScope)
          : Prompt.run(
              Prompt.select({
                message: "Installation scope",
                choices: [
                  {
                    title: "Project",
                    value: "project" as const,
                    description: "Install in the current project",
                  },
                  {
                    title: "Global",
                    value: "global" as const,
                    description: "Install for all projects",
                  },
                ],
              }),
            ),
      onSome: (value) => Effect.succeed(value),
    });
    const installScope = yield* selectedScope;
    const selection = yield* resolveAgentSelection(selected, installScope);
    const plan = yield* prepareInstallation({
      skill: verified,
      selection,
      scope: installScope,
      copyFiles,
    });

    yield* Console.log("");
    yield* Console.log(renderInstallationPlan(plan));

    if (!acceptDefaults) {
      const confirmed = yield* Prompt.run(
        Prompt.confirm({ message: "Proceed with installation?" }),
      );
      if (!confirmed) {
        yield* Console.log("Installation cancelled");
        return;
      }
    }

    const result = yield* executeInstallation(plan, verified);
    for (const fallback of result.fallbackCopies) {
      yield* Console.log(`Symlink unavailable; copied to ${fallback}`);
    }
    yield* Console.log(`Installed ${verified.manifest.name}`);
  });

  const install = Command.make(
    "install",
    {
      snapshot: Argument.string("snapshot").pipe(
        Argument.withDescription("Snapshot URL or ID"),
      ),
      agent,
      scope,
      yes,
      copy,
    },
    Effect.fn("installCommand")(function* ({
      snapshot,
      agent: requestedNames,
      scope: requestedScope,
      yes,
      copy,
    }) {
      const { metadata, verified } = yield* loadSnapshot(snapshot);
      yield* Console.log(
        renderSnapshotInspection(metadata, verified.files, {
          includeInstallCommand: false,
        }),
      );
      yield* installSkill(
        verified,
        requestedNames,
        requestedScope,
        Option.getOrElse(yes, () => false),
        Option.getOrElse(copy, () => false),
        "project",
      );
    }),
  ).pipe(
    Command.withDescription("Verify and install a shared skill"),
    Command.withAlias("i"),
    Command.withExamples([
      {
        command: "sk install https://skilldrop.dev/s/PL1mY4-",
        description: "Install a shared skill",
      },
    ]),
  );

  const setup = Command.make(
    "setup",
    { agent, scope, yes, copy },
    Effect.fn("setupCommand")(function* ({
      agent: requestedNames,
      scope: requestedScope,
      yes,
      copy,
    }) {
      const bundle = yield* buildSkillBundle(bundledSkillPath);
      const hash = yield* sha256(bundle.bytes);
      const verified = yield* verifySkillBundle(bundle.bytes, hash);
      yield* installSkill(
        verified,
        requestedNames,
        requestedScope,
        Option.getOrElse(yes, () => false),
        Option.getOrElse(copy, () => false),
        "global",
      );
    }),
  ).pipe(
    Command.withDescription("Install the bundled skill for using the sk CLI"),
    Command.withExamples([
      {
        command: "sk setup --yes",
        description: "Install the Skilldrop skill globally",
      },
    ]),
  );

  return root.pipe(
    Command.withSubcommands([
      share,
      validate,
      list,
      doctor,
      inspect,
      install,
      setup,
    ]),
  );
};

# Skilldrop CLI

Install it from npm:

```sh
npm install --global @skilldrop/cli
```

The repository also ships `Formula/skilldrop.rb` for Homebrew taps. Once the repository coordinate is set, users can install it with `brew install <owner>/<tap>/skilldrop`.

The installed binary is `sk`. Share an agent skill:

```sh
sk share ~/.claude/skills/review-pr
```

Sharing prints the exact outbound file list before any upload. Use `--dry-run` to stop after producing that manifest:

```sh
sk share ~/.claude/skills/review-pr --dry-run
```

Skilldrop refuses every symlink in a skill, including links that resolve outside its root. A root `.skillignore` excludes local-only files and supports gitignore-style comments, negation, glob patterns, and trailing `/` directory patterns. The ignore file itself is never uploaded.

Run `sk share` without a path to choose from installed project and global skills. Validate locally without uploading, or list installed skills and their scope:

```sh
sk validate ~/.claude/skills/review-pr
sk list
sk list --scope project
```

The list is grouped by agent target. Skills with the same name and scope across multiple targets are shown once under a combined heading, with every installation path retained.

Check the local runtime, detected agents, and project/global installation targets:

```sh
sk doctor
```

Install a shared skill:

```sh
sk install https://skilldrop.dev/s/PL1mY4-71OQ6swagAcabqX
```

Inspect and verify a snapshot before installing it:

```sh
sk inspect https://skilldrop.dev/s/PL1mY4-71OQ6swagAcabqX
```

Inspection prints snapshot metadata, the verified bundle checksum, every file's size, checksum and mode, plus a separate executable-file warning list. It never extracts or executes the bundle.

Install the bundled `use-skilldrop` agent skill so your coding agent knows how to use the CLI:

```sh
sk setup
```

Interactive setup asks which agents to target and whether to install for the current project or globally. `sk setup --yes` installs globally using detected defaults.

Installation follows the same model as the Skills CLI: it detects installed agents, includes the universal `.agents/skills` destination, asks whether the install is project-scoped or global, and uses a canonical copy with symlinks when multiple agent directories are selected. Pass `--copy` for independent copies or `--yes` for non-interactive defaults.

The MVP agent registry includes AiderDesk, Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Goose, OpenCode, OpenHands, and the universal agents directory.

Run `sk --help` for all options.

## License

Skilldrop is licensed under the [Apache License 2.0](LICENSE). The Skilldrop name and brand assets are not granted under that license; see the repository trademark notice for details.

For local backend development, run `bun run dev`. This enables the otherwise unavailable `--api-url` flag:

```sh
bun run dev --api-url http://localhost:8787 share ./my-skill
```

# Skilldrop

Share local skills for coding agents with a single command.

Skilldrop turns an agent skill directory into an immutable, inspectable link. Someone else can verify the snapshot and install it into the project or global skill directory used by their agent—without creating a repository or publishing a package.

```sh
# Install the CLI
npm install --global @skilldrophq/cli

# Share a local skill
sk share ~/.claude/skills/review-pr

# Inspect a snapshot before installing it
sk inspect https://skilldrop.dev/s/PL1mY4-

# Install it
sk install https://skilldrop.dev/s/PL1mY4-
```

The installed executable is called `sk`. See the [CLI reference](packages/cli/README.md) or run `sk --help` for all options.

## Why Skilldrop?

Skilldrop is a transfer layer for skills you already have and want to send to another person, machine, or compatible coding agent. Each distinct share creates a content-addressed, immutable snapshot of the directory at that moment. Sharing unchanged content again returns the same link.

Before installation, `sk inspect` verifies the bundle and reports its metadata, checksum, file paths, sizes, modes, and executable files. Inspection does not extract or execute the bundle. Skilldrop also validates archive paths and link entries before writing files, and never automatically runs scripts contained in a skill.

The CLI can detect and install for AiderDesk, Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Goose, OpenCode, OpenHands, and the universal `.agents/skills` directory. When several agent destinations are selected, it uses one canonical copy and symlinks the others by default; use `--copy` for independent copies.

## Install and use

Install the latest published CLI with npm:

```sh
npm install --global @skilldrophq/cli
```

Homebrew users can install it from a configured Skilldrop tap:

```sh
brew install <owner>/<tap>/skilldrop
```

Useful commands:

```sh
sk share                                    # choose an installed skill interactively
sk share ./my-skill                         # create an immutable snapshot
sk validate ./my-skill                      # validate without uploading
sk list                                     # list project and global skills
sk doctor                                   # diagnose the local environment
sk inspect <snapshot-url-or-id>             # verify without installing
sk install <snapshot-url-or-id>             # install interactively
sk install <snapshot> --agent codex         # choose an agent
sk install <snapshot> --scope global --yes  # non-interactive install
sk setup                                    # install the bundled agent skill
```

Pass the skill directory—not the `SKILL.md` file—to `sk share`.

## Development

### Requirements

- [Bun](https://bun.sh/)
- Node.js 20 or newer for the published CLI

Clone the repository and install dependencies:

```sh
git clone https://github.com/skilldrophq/skilldrop.git
cd skilldrop
bun install
```

Run the CLI checks and tests:

```sh
bun run check:cli
bun run test:cli
bun run build:cli
```

Run the website locally:

```sh
bun run --cwd packages/frontend dev
```

Run the local backend and point the development CLI at it:

```sh
bun run --cwd packages/backend dev
bun run --cwd packages/cli dev --api-url http://localhost:8787 share ./my-skill
```

The `repos/` directory contains vendored reference repositories. Treat it as read-only and do not import from it. In a clean clone, `mise run setup` adds those references as squashed Git subtrees.

## Project layout

| Path | Purpose |
| --- | --- |
| `packages/cli` | `sk` command-line client and bundled agent skill |
| `packages/frontend` | Astro website and documentation |
| `packages/backend` | API, snapshot storage, and Alchemy deployment |
| `.github/workflows` | CLI release automation for npm and Homebrew |

## Contributing

Contributions are welcome. Please open an issue before substantial changes so the direction can be discussed, then submit a focused pull request with tests or documentation updates where appropriate.

Keep changes scoped to the package they affect and run the relevant checks before opening a pull request. Do not add secrets, private skills, or generated deployment state to the repository.

## License and trademarks

The source code is available under the [Apache License 2.0](LICENSE). The Skilldrop name, logos, and brand assets are not licensed under Apache 2.0; see [TRADEMARKS.md](TRADEMARKS.md). Third-party notices are listed in [NOTICE](NOTICE).

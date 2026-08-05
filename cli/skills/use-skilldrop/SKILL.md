---
name: use-skilldrop
description: Use the Skilldrop `sk` command-line interface to share local agent skills through immutable links, inspect and verify snapshots, install shared skills, choose agent destinations and installation scope, or install the bundled Skilldrop skill. Use when a user asks to transfer, share, inspect, verify, or install an agent skill with Skilldrop, interpret a Skilldrop URL or snapshot ID, select `sk install` flags, or troubleshoot the `sk` CLI.
---

# Use Skilldrop

Use `sk --help` or `sk <command> --help` before acting when the installed CLI may differ from this skill.

## Share a local skill

Run:

```sh
sk share <path-to-skill-directory>
```

Pass the directory containing the root `SKILL.md`, not the Markdown file itself. Report the resulting `https://skilldrop.dev/s/<id>` URL and preserve it exactly. Sharing creates a new immutable snapshot; sharing the same directory again creates another link.

Before sharing, check that the directory:

- has a non-empty UTF-8 `SKILL.md` at its root;
- contains regular files and directories only, with no symbolic links;
- does not contain a `skilldrop.manifest.json`, which is reserved;
- contains no secrets or unrelated private files.

Skilldrop uploads the complete directory. Ask for confirmation before sharing when the user has not clearly authorized an upload.

## Inspect a shared skill

Run:

```sh
sk inspect <snapshot-url-or-id>
```

Inspect before installing when the snapshot is unfamiliar. Skilldrop downloads and verifies the immutable bundle, then prints its metadata, bundle checksum, file paths, sizes, checksums, modes, and executable-file warnings. Inspection does not extract or execute its contents. If verification fails, stop and request a fresh link.

## Install a shared skill

Run:

```sh
sk install <snapshot-url-or-id>
```

Accept either a Skilldrop URL or its 22-character snapshot ID. Legacy IDs beginning with `sk_` remain valid. By default, let the CLI detect agents, prompt for project or global scope, show destinations and replacements, and ask for confirmation.

Use flags only when the user's intent is clear:

```sh
sk install <snapshot> --agent codex --scope project
sk install <snapshot> --agent claude-code --agent codex --scope global
sk install <snapshot> --copy
sk install <snapshot> --yes
```

- Repeat `--agent` (`-a`) to choose multiple agents.
- Use `--scope project` for the current repository or `--scope global` for all projects.
- Use `--copy` for independent copies instead of the default canonical-copy-and-symlink strategy used for multiple destinations.
- Use `--yes` (`-y`) only when prompts may be skipped safely. It accepts detected defaults and can replace listed destinations.

Do not execute scripts from an installed skill unless the user separately requests it. Skilldrop verifies and writes bundle contents but does not run them.

## Install this guidance

Run `sk setup` to install this bundled `use-skilldrop` skill. Interactive setup asks for agents and scope. For a global non-interactive install, run:

```sh
sk setup --yes
```

Use `--agent`, `--scope`, and `--copy` to override setup destinations or installation mode.

## Troubleshoot

- Run `sk --version` and `sk <command> --help` to confirm the available interface.
- If a share fails, check the root `SKILL.md`, symbolic links, reserved manifest name, file sizes, and directory contents.
- If an install fails verification, do not bypass it; request a fresh link from the sharer.
- If an agent is not detected, pass its supported name explicitly with `--agent`.

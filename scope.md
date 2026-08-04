# Skilldrop — Product Scope

## Product

Skilldrop is a lightweight service for sharing local agent skills through installable links.

It is designed for individual developers and small teams.

It is not:

- a marketplace;
- a skill discovery platform;
- an enterprise workspace;
- an organization or permission management system;
- a Git-based package registry.

The core interaction is intentionally limited to:

```bash
sk share <path-to-skill>
sk install <uri>
```

---

# MVP

## Share a skill

```bash
sk share ~/.claude/skills/review-pr
```

The CLI:

1. validates that the directory contains `SKILL.md`;
2. checks for invalid paths, unsafe symlinks and size limits;
3. packages the complete directory;
4. uploads an immutable snapshot;
5. returns a shareable URL.

Example:

```text
Shared review-pr

https://skilldrop.dev/s/7fx2ka
```

No Git repository, account or configuration is required.

## Install a skill

```bash
sk install https://skilldrop.dev/s/7fx2ka
```

The CLI:

1. downloads the snapshot;
2. verifies its checksum;
3. displays the files that will be installed;
4. detects the available agent or asks for a target;
5. copies the skill into the appropriate directory.

Examples:

```bash
sk install https://skilldrop.dev/s/7fx2ka --agent claude
sk install https://skilldrop.dev/s/7fx2ka --agent codex
```

Installing a skill must never automatically execute scripts contained inside it.

## Shared URL

The MVP has no web application or formatted preview.

Visiting:

```text
https://skilldrop.dev/s/7fx2ka
```

returns the raw contents of `SKILL.md` as plain text.

The complete bundle remains accessible to the CLI through an associated download endpoint, for example:

```text
https://skilldrop.dev/s/7fx2ka/archive
```

The snapshot is immutable. Sharing the same directory again generates a new URL.

## MVP boundaries

The MVP does not include:

- accounts;
- private skills;
- personal dashboards;
- collections;
- search;
- marketplace features;
- versions;
- updates;
- organizations;
- groups;
- comments;
- analytics;
- formatted web pages.

---

# Post-MVP

## Accounts

Users can create an account to manage the skills they have shared.

The personal area contains:

- public skills;
- private skills;
- creation date;
- expiration status;
- copyable installation URL;
- deletion controls.

Anonymous public sharing can remain available.

## Private skills

Private snapshots require authentication or a secret installation token.

The free plan includes up to three active private skills.

The limit should apply to active private links rather than total historical uploads, so users can delete or expire an old private skill and create another one.

Public and unlisted skills remain free.

Pricing for additional private skills is to be determined.

## Personal skill list

Authenticated users can see the snapshots they have created.

This is a management interface, not a public profile or marketplace.

There is no global directory of users or skills.

## Shared lists

Users can group multiple skills into a shareable list.

Example:

```text
Federico’s Rust Agent Setup

- review-rust-pr
- investigate-tokio-errors
- write-adr
- prepare-release
```

Lists are free for everyone.

They can be used to share:

- a personal agent setup;
- a project-specific toolkit;
- onboarding material for a small team;
- a curated development workflow.

A list is a lightweight collaboration primitive. It does not create an organization, workspace or group.

Possible CLI support:

```bash
sk list create rust-toolkit
sk list add rust-toolkit review-rust-pr
sk list add rust-toolkit write-adr
sk list share rust-toolkit
```

Or, to avoid overloading `list`:

```bash
sk collection create rust-toolkit
sk collection add rust-toolkit review-rust-pr
sk collection share rust-toolkit
```

## Formatted web preview

After the MVP, the shared URL uses content negotiation.

When opened by a normal browser, it displays:

- formatted `SKILL.md`;
- file tree;
- snapshot metadata;
- checksum;
- installation command;
- warnings for executable or potentially unsafe files.

When requested through `curl`, another CLI or an explicit plain-text content type, it returns the raw Markdown.

Example:

```bash
curl https://skilldrop.dev/s/7fx2ka
```

returns raw `SKILL.md`.

A browser opening the same URL receives the formatted preview.

## Target audience

Skilldrop is built for:

- developers with personal global skills;
- developers moving skills between machines;
- people sharing an experimental skill with a colleague;
- small engineering teams exchanging project conventions;
- skill authors testing something before placing it in Git.

Skilldrop deliberately does not target enterprise administration.

There are no planned:

- organizations;
- enterprise workspaces;
- role-based permissions;
- team billing structures;
- SSO integrations;
- administrator dashboards.

---

# Positioning

## One-line description

> Turn any local agent skill into an installable link.

## Primary message

> Share agent skills without creating a repository.

## Product analogy

> Pastebin or transfer.sh for agent skills.

## Competitive boundary

> Skills.sh helps developers discover public skills. Skilldrop helps them send a skill they already have.

## Product rule

Every new feature should answer this question:

> Does this make it easier to send, receive or organize skills between developers?

Features primarily intended for global discovery do not belong in Skilldrop.
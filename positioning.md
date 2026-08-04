# Skilldrop — Product Positioning

## Product thesis

Agent skills often begin as local, personal or team-specific folders.

Before they become polished open-source packages, they need to be moved:

- from one developer to another;
- from one machine to another;
- from Claude Code to Codex;
- from a private experiment to a team workflow;
- from a chat-generated prototype to a repository.

Today, doing this usually means creating a Git repository, copying folders manually, sending ZIP files or explaining where every agent expects its skills to be installed.

**Skilldrop makes a local agent skill shareable with one command.**

```bash
sk share code-review
# → https://skilldrop.dev/s/7fx2ka
```

```bash
sk install https://skilldrop.dev/s/7fx2ka
```

---

## Category

**Agent skill transfer**

Alternative descriptions:

- file transfer for agent skills;
- portable skill snapshots;
- peer-to-peer-style sharing for agent capabilities;
- Gist or transfer.sh for agent skills.

Skilldrop should avoid presenting itself as:

- an agent skill marketplace;
- a package registry;
- a discovery platform;
- a GitHub alternative;
- a long-term package-maintenance platform.

---

## Positioning statement

> For developers and teams who create custom skills for coding agents, Skilldrop is the fastest way to transfer a local skill to another person, machine or agent.
>
> Unlike skill directories and Git-based package managers, Skilldrop shares the exact local skill as an immutable, inspectable snapshot without requiring a repository, release or publishing workflow.

---

## One-line positioning

> **Share local agent skills in seconds. No repository required.**

Alternative:

> **The missing transfer layer for agent skills.**

More developer-oriented:

> **Turn any local agent skill into an installable link.**

---

## Competitive boundary

### Skills.sh

Skills.sh helps users:

- discover public skills;
- browse popular and trending skills;
- install skills from public sources;
- compare adoption through install counts;
- find official and curated packages.

Its core question is:

> **Which skill should I install?**

### Skilldrop

Skilldrop helps users:

- share a skill they already possess;
- transfer a local or private skill;
- test a skill with a teammate before publishing it;
- move skills between agents and machines;
- inspect the precise files contained in a shared snapshot.

Its core question is:

> **How do I send you this skill?**

### Memorable distinction

> **Skills.sh helps you find skills. Skilldrop helps you send yours.**

---

## Primary audience

### Individual developers

Developers using Claude Code, Codex, Cursor or similar agents who maintain personal global skills.

Typical situation:

> “I made a useful skill locally and want to use it on another machine.”

### Small engineering teams

Teams that have informal conventions and workflows that are useful as agent skills but are not ready for a dedicated repository.

Typical situation:

> “I made this review skill for our codebase. Try it before we add it to the engineering repository.”

### Skill authors

People iterating on a skill before formally releasing it through GitHub or making it discoverable through a directory.

Typical situation:

> “Here is the exact snapshot I tested. Install it and tell me whether it works.”

---

## Core jobs to be done

### Transfer

> Move a skill from this machine to another environment without manually copying files.

### Share

> Give a colleague an installable link without creating and documenting a repository.

### Test

> Let someone install the exact snapshot I am currently using.

### Inspect

> Understand what a shared skill contains before placing it in an agent’s global directory.

### Promote

> Start with an informal snapshot and later move the validated skill into Git and the public ecosystem.

---

## Product principles

### Snapshot, not package

Every share operation creates an immutable snapshot.

```bash
sk share review-pr
# → /s/7fx2ka
```

Changing and sharing the skill again creates a different snapshot:

```bash
sk share review-pr
# → /s/q9mc31
```

Skilldrop does not need semantic versioning for its initial product.

### Local-first

The primary source is a folder already present on the user’s machine.

```bash
sk share ~/.claude/skills/review-pr
```

The user should not have to push anything to GitHub first.

### Inspect before install

A shared snapshot should expose:

- its `SKILL.md`;
- the complete file tree;
- file sizes;
- checksums;
- executable files;
- compatibility metadata;
- potential security warnings.

### Cross-agent

Skilldrop should understand where supported agents store global and project-level skills.

```bash
sk install 7fx2ka --agent claude
sk install 7fx2ka --agent codex
sk install 7fx2ka --agent all
```

### Ephemeral when useful

Not every skill needs to exist forever. By default a skill will live for 90d

```bash
sk share review-pr --expires 1w
sk share internal-release # 90d
```

### No discovery pressure

A snapshot does not automatically become publicly searchable.

Creating a link is not the same as publishing a package.

---

## What Skilldrop should not build

To preserve the positioning, the initial product should avoid:

- a public marketplace;
- global skill search;
- trending and popular pages;
- install leaderboards;
- stars and reviews;
- creator profiles;
- package dependencies;
- repository synchronization;
- semantic-version resolution;
- an “Explore skills” homepage.

Those features would move Skilldrop directly into the territory already occupied by public skill directories.

---

## Relationship with the wider ecosystem

Skilldrop sits before formal publication:

```text
Local skill
    ↓
Skilldrop snapshot
    ↓
Peer or team testing
    ↓
Git repository
    ↓
Public directory such as skills.sh
```

The services are complementary rather than mutually exclusive.

A mature workflow could eventually support:

```bash
sk export <uri-or-id> ./skills/review-pr
```

The exported folder could then be committed to Git and distributed through existing public tooling.

---

## Message hierarchy

### Hero

> **Share local agent skills in seconds.**

Turn any Claude Code, Codex or compatible agent skill into an installable link—without creating a repository.

```bash
sk share review-pr
```

### Primary call to action

> **Install the CLI**

```bash
curl -fsSL getsk.dev/install | sh
```

### Secondary message

> Built a useful skill locally? Send the exact snapshot to a teammate, another machine or another agent.

### Trust message

> Inspect every file before installation. Skilldrop never automatically executes scripts contained in a shared skill.

---

## Tagline options

Best default:

> **Drop a skill. Pick it up anywhere.**

Most descriptive:

> **Share agent skills without Git.**

Most category-defining:

> **The transfer layer for agent skills.**

Most developer-oriented:

> **Local skill. Installable link.**

Most playful:

> **Send skills, not ZIP files.**

---

## Elevator pitch

Skilldrop is a CLI and lightweight hosting service for sharing local agent skills.

Run `sk share` on a global Claude Code, Codex or compatible skill and Skilldrop creates an immutable link containing the exact folder snapshot. Another developer can inspect it and install it with `sk install`.

There is no Git repository to create, no package to publish and no marketplace involved.

---

## Positioning guardrail

Every potential feature should be evaluated with this question:

> **Does this help someone transfer a skill they already have?**

If it primarily helps users discover skills they did not already know about, it probably belongs to a directory such as skills.sh rather than Skilldrop.

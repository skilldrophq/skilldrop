#!/usr/bin/env bash

set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to add subtrees while the worktree has uncommitted changes." >&2
  echo "Commit or stash your changes, then run 'mise run setup' again." >&2
  exit 1
fi

mkdir -p repos

if [[ -e repos/skills ]]; then
  echo "Skipping repos/skills: already present."
else
  git subtree add --prefix=repos/skills https://github.com/vercel-labs/skills main --squash
fi

if [[ -e repos/effect ]]; then
  echo "Skipping repos/effect: already present."
else
  git subtree add --prefix=repos/effect https://github.com/Effect-TS/effect main --squash
fi

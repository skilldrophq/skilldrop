---
name: code-review
description: Review a code change for correctness, security, and maintainability. Use when asked to review a diff, pull request, patch, or changed files.
---

# Code Review

Read the changed code and enough surrounding context to understand it.

1. Check correctness, security, edge cases, and test coverage.
2. Report only actionable findings caused by the change.
3. Rank findings using `references/severity.md`.
4. Follow `references/checklist.md` for a quick final pass.
5. Format the response with `templates/review.md`.

For each finding, name the file and line, explain the impact, and suggest the smallest practical fix. If there are no findings, say so plainly and mention any tests you could not run.

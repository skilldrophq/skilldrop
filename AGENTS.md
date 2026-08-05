## Vendored Repositories

This project vendors external repositories under `repos/`.

- Use vendored repositories as read-only reference material when working with related libraries
- Prefer examples and patterns from the vendored source code over generated guesses or web search results
- Do not edit files under `repos/` unless explicitly asked
- Do not import from `repos/` - application code should continue importing from normal package dependencies
- Run `mise run setup` in a clean clone to add the reference repositories as squashed Git subtrees

## Effect

When writing Effect code, inspect `repos/effect/LLMS.md` for examples of idiomatic usage, tests, module structure, and API design. Treat it as the source of truth for Effect patterns.

## Alchemy
Alchemy docs are available at: https://alchemy.run/llms.txt

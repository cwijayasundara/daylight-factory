---
description: Phase 0 — interactively brainstorm an idea or feature with Claude Code and produce a validated prd.md ready for /daylight:run or /daylight:goal.
argument-hint: "[topic | rough-notes | docs/file] [--out prd.md]"
---
Use the `daylight:brainstorm` skill (`${CLAUDE_PLUGIN_ROOT}/skills/brainstorm/SKILL.md`) with $ARGUMENTS.

Guide the user through focused discovery, write the agreed PRD (default `prd.md` or `--out <path>`), validate it with `node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" prd check <path>`, and once the user approves it, offer to commit it and start `/daylight:run` or `/daylight:goal`.

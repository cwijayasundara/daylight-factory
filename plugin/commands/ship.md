---
description: Idea to deployed app in one command — chains /daylight:init -> /daylight:brainstorm -> (single PRD approval) -> auto-commit -> /daylight:goal.
argument-hint: "<idea | docs/file> [--stack ts|python|rust] [--gates 0|2] [--github]"
---
Drive the full lights-on lifecycle from idea to deployed app with **only product-decision interruptions** (never ask the user to commit boilerplate or fix empty test suites):

1. **Scaffold (automatic):** If `daylight.yaml` does not exist in the current directory, run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" init [--stack ...] [--gates ...] [--github]
   ```
   (default `--gates 0` unless the user passed `--gates 2`; pass `--github` to auto-create a private GitHub repo via `gh` when no `origin` remote exists).
2. **Brainstorm PRD (1 human alignment gate):** Follow `${CLAUDE_PLUGIN_ROOT}/skills/brainstorm/SKILL.md` with the user's idea/docs, write `prd.md`, and validate it with `node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" prd check prd.md`. Present a concise summary (scope, key contracts, NFRs, open questions) and ask: *"PRD ready (`prd.md`). Reply `approve` to start the autonomous build, or tell me what to adjust."*
3. **Auto-commit & Ship (unattended):** As soon as the user approves the PRD, immediately commit the baseline (`git add -A && git commit -m "initial baseline"`; push to `origin main` if `origin` exists) without asking, then execute `/daylight:goal prd.md --agents` (or omit `--agents` if `--gates 2`) and keep resuming until `{"ok":true,"stage":"done"}` or a true human gate / non-generator escalation.

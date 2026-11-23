---
description: Keep the factory running until the goal is done — supervised auto-resume across inner-loop escalations instead of one-shot runs.
argument-hint: "<prd.md> [--agents] [--max-resumes 3]"
---
Drive the Daylight CLI to completion in the current working directory. Never run the phases manually; never edit generated code.

1. Extract the PRD path and flags from $ARGUMENTS (`--max-resumes`, default 3, is yours to consume — never pass it to the CLI).
2. Run with the Bash tool (timeout: 600000 ms):
```bash
DAYLIGHT_RUN="${DAYLIGHT_RUN:-adhoc-$(date +%F)}" node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" run <prd> <flags> --summary-out summary.json
```
3. Interpret the JSON and act, at most `--max-resumes` times:
   - `{"ok":true,"stage":"done"}` → **goal reached**: report summary, PR, deployed port, smoke result, cost. Stop.
   - `stage":"gate1"` or `stage":"gate2"` → **human decision required**: present the artefacts, ask me, apply `daylight gate decide`, then resume (does not count against the cap).
   - `stage":"inner"` with tasks escalated → read `.daylight/escalations/*.md` for the cited root cause, summarize it for me in one paragraph, then **resume with `--resume`** — the generator is seeded with the prior evaluator findings on its next attempt.
   - Any other failure (plan/harness class, preflight, triage) → stop and report; resuming will not help.
4. If the cap is exhausted without `done`, report the outstanding escalations and the exact resume command.

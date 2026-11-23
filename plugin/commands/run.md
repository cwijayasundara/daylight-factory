---
description: Run the Daylight factory on a PRD, GitHub issue or task file (PRD to reviewed PR to Docker deployment).
argument-hint: "<prd.md | issue-url | task-file> [--agents] [--resume] [--help]"
---
If $ARGUMENTS contains `--help` (or is empty), print this usage and stop:

```
/daylight:run <work-item> [--agents] [--resume] [--stop-after <phase>] [--design-from <dir>] [--plan-from <file>]
  work-item   PRD file (must contain a Non-functional requirements section), GitHub issue URL, or scheduled task file
  --agents    0-gate mode (design and PR approved by agent approvers); omit it for 2 human gates
  --resume    continue an interrupted/escalated run from its last checkpoint
Phases: triage -> ingest (brownfield) -> design -> Gate 1 -> plan -> inner loop -> sensors -> judge -> PR -> Gate 2 -> deploy -> wiki -> reflect
Config: daylight.yaml (see `daylight config --resolved`). Setup check: `daylight doctor`. Vibe mode: `/daylight:mode`.
```

Otherwise: **the orchestrator is the Daylight CLI — never improvise or run the phases manually.** Execute it in the current working directory with the Bash tool (timeout: 600000 ms; a full run takes several minutes):

```bash
DAYLIGHT_RUN="${DAYLIGHT_RUN:-adhoc-$(date +%F)}" node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" run $ARGUMENTS --summary-out summary.json
```

Then interpret the JSON result:

- **`{"ok":true,"stage":"done",...}`** — read `summary.json` and report: tasks passed, gates, PR URL, deployed container/port, smoke result, and total cost.
- **`stage":"gate1"` (design escalated to a human)** — present `docs/design/` artefacts (`node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" gate present`), then ask me to approve or reject. Approve:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" gate decide design --decision approve
  ```
  Reject uses `--decision reject --feedback "<my feedback>"`. Either way, resume with `--resume`.
- **`stage":"gate2"` (PR escalated to a human)** — show `.daylight/pr-body.md` and the diff stat, ask me to approve or reject. Approve:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" gate decide pr --decision approve --head "$(git rev-parse HEAD)"
  ```
  then resume with `--resume`.
- **Any other failure** — read `.daylight/escalations/*.md` and the tail of `.daylight/audit/<run>.jsonl`, summarize the root cause for me, and ask before resuming with `--resume`. Never edit generated code by hand; the factory fixes its own output via the fix loop.
- **Bash timeout (no JSON)** — the run is still checkpointed in `.daylight/run-state.json`; immediately re-run the same command with `--resume` added until it prints JSON.

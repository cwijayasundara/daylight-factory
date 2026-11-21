---
description: Run the Daylight factory on a PRD, GitHub issue or task file (PRD to reviewed PR to Docker deployment).
argument-hint: "<prd.md | issue-url | task-file> [--help]"
---
If the argument is `--help` (or empty), print this usage and stop:

```
/daylight:run <work-item> [--help]
  work-item   PRD file (must contain a Non-functional requirements section), GitHub issue URL, or scheduled task file
Phases: triage -> ingest (brownfield) -> design -> Gate 1 -> plan -> inner loop -> sensors -> judge -> PR -> Gate 2 -> deploy -> wiki -> reflect
Config: daylight.yaml (see `daylight config --resolved`). Setup check: `daylight doctor`.
```

Otherwise execute the orchestrator skill with $ARGUMENTS (added in later increments).

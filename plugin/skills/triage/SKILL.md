---
name: triage
description: Phase P0. Normalise a work item (PRD, GitHub issue, scheduled task), classify size, risk tier and spec-needed, and route out-of-scope items to a human.
---
Run `daylight workitem <arg>` then `daylight triage <arg> [--paths a,b] [--base main]`. The script applies the tier rules (defaults + daylight.yaml from the base branch) and logs the rationale. You may raise size or spec-needed with evidence from the repo but never lower a tier the script set. If the item is non-software or human-owned, the script routes it to a human: do not attempt it.

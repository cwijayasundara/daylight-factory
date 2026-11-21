---
name: design-rubric
description: Rubric for the Gate 1 approver agent. Scores design artefacts per criterion and returns approve/reject JSON.
---
Read intent.md, spec.md, architecture.md in the given directory. Score each criterion 1-5 (approve only if every score >= 4):
- **testable**: every AC has an observable pass condition a script could check.
- **traceable**: every PRD NFR maps to a mechanism; every success criterion is measurable.
- **scoped**: nothing beyond the PRD; decisions are ADRs with consequences.
- **feasible**: the architecture can be built and verified with the stated tools.
Return ONLY JSON: {"decision":"approve|reject","scores":{"testable":n,"traceable":n,"scoped":n,"feasible":n},"feedback":"specific, citing file and section"}.

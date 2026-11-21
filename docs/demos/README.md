# Demo evidence

All runs are `daylight run prd.md --agents` (agent approvers at both gates) on local sample repos; nothing was pushed anywhere and no GitHub PR objects exist (no remotes; see ADR-019).

| attempt | repo | result | why it stopped |
|---|---|---|---|
| gf1 | greenfield | stopped at trace | harness bug: spec-style test output was not parsed (fixed, regression test) |
| gf2 | greenfield | stopped in inner loop | planner made a test-only task (no red possible); Opus evaluator strict on a smoke script, retry cap 2 (planner rule + cap fixed) |
| gf3 | greenfield | **reached Gate 2 with a complete PR**; Opus approver rejected | /code-review raised 5 important findings the PR did not address (e.g. unbounded request body). Gate worked; the pipeline has no reject-then-fix loop yet |
| bf1 | brownfield | stopped at scope check | harness bug: scope measured from main instead of the task's branch point (fixed, regression test) |
| bf2 | brownfield | stopped at scope check | **genuine catch**: task t4 edited src/main.ts outside its declared paths |

Per the 3-strikes rule (greenfield) and the turn limit, no run reached deploy, so there is no passing deployment/smoke evidence. `greenfield.json` (gf3) and `brownfield.json` (bf2) are the last runs' summaries and honestly show `ok: false`.

Artefacts: `audit/gf3.jsonl`, `gf3-report.html` (self-contained report), `gf3-pr-body.md`, `gf3-reviews/`, `failed-first-attempt/`, `dream.json` + `dream-pr.md` (harness-improvement branch from gf2 data), `code-mode-benchmark.md`, `headless-matrix.txt` (12 headless phases through real `claude -p` without Code Mode).

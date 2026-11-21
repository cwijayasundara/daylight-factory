# Demo evidence

All runs are `daylight run prd.md --agents` (agent approvers at both gates) on local sample repos; the early local runs (gf1-gf3, bf1, bf2 in the first table) pushed nothing; the later runs (gh1, gh2, bh1-bh7) used private GitHub sample repos and left branches and PRs there (gh2 produced the merged PR #2; the others were closed or are stale). See docs/analysis/deep-dive-fable-5-2.md for why the brownfield runs keep failing.

| attempt | repo | result | why it stopped |
|---|---|---|---|
| gf1 | greenfield | stopped at trace | harness bug: spec-style test output was not parsed (fixed, regression test) |
| gf2 | greenfield | stopped in inner loop | planner made a test-only task (no red possible); Opus evaluator strict on a smoke script, retry cap 2 (planner rule + cap fixed) |
| gf3 | greenfield | **reached Gate 2 with a complete PR**; Opus approver rejected | /code-review raised 5 important findings the PR did not address (e.g. unbounded request body). Gate worked; the pipeline has no reject-then-fix loop yet |
| bf1 | brownfield | stopped at scope check | harness bug: scope measured from main instead of the task's branch point (fixed, regression test) |
| bf2 | brownfield | stopped at scope check | **genuine catch**: task t4 edited src/main.ts outside its declared paths |

Per the 3-strikes rule (greenfield) and the turn limit, no run reached deploy, so there is no passing deployment/smoke evidence. `greenfield.json` (gf3) and `brownfield.json` (bf2) are the last runs' summaries and honestly show `ok: false`.

Artefacts: `audit/gf3.jsonl`, `gf3-report.html` (self-contained report), `gf3-pr-body.md`, `gf3-reviews/`, `failed-first-attempt/`, `dream.json` + `dream-pr.md` (harness-improvement branch from gf2 data), `code-mode-benchmark.md`, `headless-matrix.txt` (12 headless phases through real `claude -p` without Code Mode).

## Later runs (GitHub sample repos, final harness fixes applied one at a time)
| attempt | result | cause |
|---|---|---|
| gh1 | stopped at Gate 2 after 2 fix rounds | review findings with no repro treated as blocking (fixed: AC-60 classification) |
| **gh2** | **success**: PR #2 merged, deployed on :8080, smoke passed, 0 touchpoints, 485 s | - |
| bh1 | Gate 1 parse failure | approver prose around JSON |
| bh2, bh5 | scope stop: fix task edited eslint/tsconfig | generator rewrote its own lint/type config |
| bh3 | t2 escalated 5x | red proof impossible (behaviour already built) |
| bh4 | deploy failed: stale tree | local base diverged after squash merge |
| bh6 | scope stop | TDD task's own tests flagged out of paths |
| bh7 | interrupted by operator at Gate 2 | stopped for the deep-dive analysis |

None of the brownfield runs has completed. The deep-dive analysis says why and what to change first.

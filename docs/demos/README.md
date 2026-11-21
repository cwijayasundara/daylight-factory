# Demo evidence

All runs are `daylight run prd.md --agents` (agent approvers at both gates) on local sample repos; the early local runs (gf1-gf3, bf1, bf2 in the first table) pushed nothing; the later runs (gh1-gh3, bh1-bh8) used private GitHub sample repos and left branches and PRs there (gh2 produced the merged PR #2; the others were closed or are stale). See docs/analysis/deep-dive-fable-5-2.md for why the brownfield runs keep failing.

| attempt | repo | result | why it stopped |
|---|---|---|---|
| gf1 | greenfield | stopped at trace | harness bug: spec-style test output was not parsed (fixed, regression test) |
| gf2 | greenfield | stopped in inner loop | planner made a test-only task (no red possible); Opus evaluator strict on a smoke script, retry cap 2 (planner rule + cap fixed) |
| gf3 | greenfield | **reached Gate 2 with a complete PR**; Opus approver rejected | /code-review raised 5 important findings the PR did not address (e.g. unbounded request body). Gate worked; the pipeline has no reject-then-fix loop yet |
| bf1 | brownfield | stopped at scope check | harness bug: scope measured from main instead of the task's branch point (fixed, regression test) |
| bf2 | brownfield | stopped at scope check | **genuine catch**: task t4 edited src/main.ts outside its declared paths |

`greenfield.json` and `brownfield.json` are now the summaries of the final-harness runs gh3 and bh8 (table below), generated from `audit/gh3.jsonl` and `audit/bh8.jsonl`. Earlier gf3/bf2 summaries were replaced; their audit (`audit/gf3.jsonl`) is kept.

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

The deep-dive analysis (docs/analysis/deep-dive-fable-5-2.md) said what to change first; steps 2-4 of docs/STATUS.md did that. Final-harness runs:

| attempt | result | notes |
|---|---|---|
| **gh3** (greenfield, from `baseline`) | **success**: PR #3, deployed on :8080, smoke passed, 0 touchpoints, 840 s, $2.37 | regression check on the final harness |
| **bh8** (brownfield, from `baseline`) | **success**: PR #5 merged, deployed on :8081, smoke passed, 1361 s summed over 5 sessions, about $4.80, **2 touchpoints** | first brownfield run to complete. t1, t2, t4 passed first attempt; t3 (Dockerfile/compose) escalated twice and the run was resumed. A fix task followed review. |

Three harness bugs surfaced live in bh8 and were fixed test-first: TDD required a failing test for a config-only task (`tddApplies`); the generator was told to declare a waiver the evaluator then rejected (`tddInstruction`); and the final scope check blamed a resumed task for the harness's own `daylight.yaml` commit (`x_task_start.base`). The 2 touchpoints are those escalations; the AC-95 test expects 0 for greenfield and 2 for brownfield accordingly. The bh8 run state was edited by hand once (t3 cleared so it re-ran under the fixed code); the audit chain is intact in the original; `audit/bh8.jsonl` here has the operator email and hostname redacted, so its hash chain no longer verifies.

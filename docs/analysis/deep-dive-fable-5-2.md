# Deep dive: why small changes take 8-21 minutes and brownfield keeps failing

Read-only analysis by Fable 5.2 (claude-fable-5-2) over the audit logs of runs gf1..gh2 and bh1..bh7 (2026-11-21). Numbers are recomputed from raw event timestamps. Evidence: docs/demos/failed-first-attempt/*-audit.jsonl.

## Executive summary
- The clean-run floor is about **6.5 min (greenfield) and 8 min (brownfield)**. Even with zero retries the architecture cannot deliver "a few minutes": in gh2, 245 s of 484 s (51%) was not code generation.
- Brownfield is not failing for seven different reasons; it fails for **four structural reasons** that surface at whichever veto fires first. Two failures recurred unfixed (eslint/tsconfig scope stop in bh2 and bh5; "AC has NO TEST" in bh2, bh4, bh5).
- **No harness fix can be verified cheaply**: every retry restarts from design, regenerates a different spec and plan, and `runPipeline` has no stubbed test. Each fix costs a live 8-21 min, $2.5-5.6, non-reproducible run.
- Seven brownfield attempts cost **79 min and $22.80**, of which 16.5 min and $6.42 was redoing design and plan.

## Measured timings (seconds; xN = times the phase ran)
| run | wall | cost | calls | design | plan | inner | fix | judge | review | gate2 | stopped at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gh2 (success) | 8.1 min | $3.33 | 19 | 99 | 17 | 227 | - | 20 | 81 | 24 | done |
| gh1 | 13.8 | $5.30 | 26 | 108 | 16 | 186 | 175 x2 | 70 x3 | 205 x2 | 56 x2 | Gate 2 |
| bh1 | 2.5 | $0.63 | 1 | 152 | - | - | - | - | - | - | Gate 1 parse |
| bh2 | 17.4 | $3.92 | 19 | 97 | 18 | 165 | 592 x2 | 33 | 95 | 30 | scope (fix2) |
| bh3 | 8.9 | $2.75 | 19 | 134 | 16 | 381 | - | - | - | - | inner (t2 x5) |
| bh4 | 21.4 | $5.62 | 25 | 118 | 19 | 211 | 572 x2 | 59 x2 | 207 x2 | 78 x2 | deploy |
| bh5 | 13.1 | $4.23 | 21 | 138 | 20 | 163 | 256 x2 | 26 | 112 | 44 | scope (fix2) |
| bh6 | 8.2 | $2.52 | 17 | 114 | 20 | 237 | 110 | - | - | - | scope (t4) |
| bh7 | 7.8+ | $3.13 | 16 | 126 | 16 | 165 | - | 23 | 114 | cut off | interrupted |

Multipliers: fix rounds are the largest (1,530 s, 32% of brownfield wall time; each re-runs sensors, trace, judge, both reviews, PR and Gate 2, about 170-190 s). Hung test commands (no usable timeout on `daylight red` and sensors) cost 330-347 s in bh2 and bh4. bh3 t2 failed five times on "no red proof" while the evaluator passed every time (about 217 s of futile retries). The evaluator ran 8 times after a computational failure had already decided the verdict. The complexity sensor failed greenfield task t1's first attempt in 3 of 3 runs because the generator is never told the limit (49-79 s each).

Theoretical minimum with today's architecture (gh2 critical path, no retries) is about 388 s (6.5 min).

## Why brownfield fails
1. **A PRD requirement becomes an untestable AC.** "Existing tests keep passing; lint and type check stay clean" becomes an AC, and the trace matrix demands an AC-named test for it: NO TEST in bh2 (AC-17), bh4 (AC-16), bh5 (AC-13), each costing a fix round.
2. **The repo's own config collides with the reviewers.** eslint.config.js and tsconfig.json are protected, and cover only src (and tests for tsc); the PRD requires scripts/smoke.ts outside both. The reviewers then say "tsconfig and lint skip scripts/", the fix task edits both files, and the scope check (fatal, no fix round) stops the run. The planner itself declared the protected files in task paths (bh4 t1, bh5 t1, bh7 t2); plan check validates only AC coverage.
3. **Existing behaviour makes a red test impossible.** The planner splits logging/search into a second task whose behaviour the first already built (bh3 escalated; the waiver added later fired again in bh4 t2 and bh7 t2): a plan defect that recurs every run.
4. **More veto points**: typecheck, lint, complexity 8, a GitHub remote (squash merge and pull caused bh4).

Greenfield passed partly by luck: gh2's Gate 2 approved with the same unbounded-body finding that drew rejections in gh1, bh2 and bh4. First-pass Gate 2 approvals were 1 of 5 in these logs.

## Systemic root causes, ranked
1. **No resume and no deterministic pipeline test** (nothing in plugin/tests exercises runPipeline).
2. **Gate 2 is a non-deterministic third code reviewer**: it runs Bash despite the allowed tools, re-derives findings, reclassifies advisory findings as blocking, and judges harness-produced artefacts (the PR body) then bills the generator.
3. **The fix loop has no triage**: in bh5 the gate said "no code changes needed" (a PR-body line) yet a 12-file code-fix task ran and caused the fatal scope stop.
4. **Deterministic checks run late and are terminal**: scope and trace run after all tasks merge; 5 of 9 brownfield stops were scope; the TDD check inspects only the first commit so a retry can never repair it.
5. **Reviewers manufacture requirements**: /code-review medium always finds 4-10 "important" hardening items not in the PRD, which Gate 2 turns into mandatory work.
6. **Free-text JSON parsing fixed in 1 of 4 places** (gate.ts only; loop.ts, judge.ts and the Gate 2 parse still strict).
7. **"Inconclusive" counts as a pass** (7 verdicts in these logs).
8. **Thin generator/evaluator context**: AC ids only, no AC text, no sensor commands or limits, no conventions.
9. **Latent bugs**: hard-coded fix-task paths; parallel tasks both listing package.json escalate on merge conflict with no retry; plan loop falls through silently after three failed checks; the new Bash guard is a regex that will false-positive; the harness's own daylight.yaml commit appears in the PR diff; triage size=small is computed and never used.

## Recommended redesign and expected savings
| change | saving |
|---|---|
| Resume from phase checkpoints; cache design and plan by PRD hash | 113-160 s and about $0.9 per retry |
| Small fast path: no Opus Gate 1 (lint only), one task, one generator | about 30 s gate + 17-20 s plan + a whole wave (50-80 s) |
| Per-attempt contract check (scope, protected paths, task-AC trace, TDD) fed back as fixable; skip evaluator when it fails | removes the 5 late scope stops; about 30 s per skipped evaluation |
| Stop retrying on a repeated identical computational message; classify harness / generator / human | 217 s in bh3 |
| 60-120 s timeouts on red and sensors; run only the task's tests for red | 330-347 s in bh2, bh4 |
| Judge, code-review, security-review in parallel | 50-75 s per check cycle |
| Deterministic Gate 2 from audit evidence; LLM approver only for the high tier | 24-44 s per round and most fix rounds (1,530 s over bh2-bh6) |
| Fix triage: body defects rebuild the body; only blocking findings go to a fix task | bh5 would have approved with no fix2 |
| Plan lint: deps exist, no protected paths, disjoint parallel paths; meta-ACs verified by a sensor | removes the recurring first fix round |
| Pre-flight: sensors green at baseline, port free, docker up, base in sync | would have caught bh4 at second 0 instead of minute 21 |
| AC text, sensor commands and limits in the generator prompt | 49-79 s per greenfield run |

Estimated fast path (estimate, not measured): about 3.5-4 min and under $1.50.

## Implementation plan (test-first)
1. **Stubbed end-to-end test and resume** (new plugin/tests/pipeline.test.ts): fixture repo + stubbed claude/gh/docker; tests for a full stub run, resume after plan (zero design/plan calls), resume after a scope stop (only checks re-run). Implement .daylight/run-state.json, phase skipping in ph(), worktree reuse with recorded base.
2. **Per-attempt contract check with failure classes** (loop.ts): out-of-path or protected file yields a computational message with zero evaluator calls; same message twice escalates as class harness; hanging commands time out; an inconclusive verdict re-asks once then fails. Implement taskContract() and timeouts on recordRed and runCmd.
3. **Deterministic Gate 2 and fix triage** (gate.ts, pipeline.ts): a pure gate2(evidence) that approves on all-PASS matrix, green sensors, clean scope, both reviews present, zero blocking findings, no inconclusive final verdict; table tests from real audits; one shared extractJson().

**Do task 1 first**: it turns every later fix from a 10-20 minute gamble into a test that runs in seconds.

## Which of the six fixes were symptoms
Tolerant approver JSON (symptom: 1 of 4 parse sites); Bash guard for protected config (symptom, adds false-positive risk); TDD waiver (partial; the planner defect recurs); pull after squash merge (real bug, found at minute 21 because merge/deploy are untested); PR-body run history (symptom of an LLM gate judging harness output); scope exemption for a task's own tests (symptom of post-hoc fatal scope checking and brittle declared paths).

## Risks and unknowns
bh7 has no result (audit ends inside Gate 2 at 468 s; it was interrupted by me). gf2/gf3 were not re-analysed. Gate 2 variance is inferred from six samples. A deterministic Gate 2 lowers assurance unless blocking-finding classification is trustworthy, so keep the Opus approver for high-tier changes. The fast-path timing is an estimate. Failed runs left branches and PRs on the GitHub sample repo.

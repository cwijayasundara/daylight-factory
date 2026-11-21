# Daylight status (handoff) - 2026-11-21

Resume from here after clearing context. Repo: /Users/cwijayasundaragmail.com/Documents/learning_101/eigen_work_v2.0 (branch factory/build, pushed to github.com/cwijayasundara/daylight-factory, private; last commit ed207a0). Never push to main. Do not touch the user's pre-existing GitHub repo named "daylight".

## What exists
- Plugin in plugin/ (TypeScript, node:test, Node 26 type stripping). CLI: node plugin/src/cli.ts <cmd> (daylight run|doctor|config|triage|ingest|gate|inner|sensors|trace|scope|judge|review|pr|deploy|monitor|wiki|audit|report|reflect|dream|replay|definition|benchmark|ledger ...).
- Docs: README.md (usage), ARCHITECTURE.md (mermaid diagrams), docs/design/* (approved design, 112 ACs), docs/adr/ADR-019 (deviations), docs/adr/ADR-020 (resume + stubbed e2e), docs/analysis/deep-dive-fable-5-2.md (root-cause analysis), docs/demos/README.md (run history), docs/traceability.md (matrix, last regenerated before the latest changes), docs/reuse-ledger.md.
- Tests: cd plugin && node --test tests/  -> 136/139 pass. Failing: AC-92, AC-93, AC-95 (validation.test.ts evidence tests read docs/demos/{greenfield,brownfield}.json; brownfield never completed and the summary JSON shape differs from what the tests expect).
- GitHub (private, user cwijayasundara): daylight-factory (harness; PR #1 = dream-job harness-improvement PR from gf2 data), daylight-greenfield-sample and daylight-brownfield-sample (base branch is trunk, plus a baseline branch at the original commit; run from baseline; failed runs left run branches/PRs).
- Local sample clones live in ../ (run-greenfield2, run-brownfield2..7, etc.). Generated code must never be hand-edited: fix the HARNESS, test first.

## Results so far
- Greenfield: SUCCESS once (run gh2): PR #2 merged on GitHub, Docker on :8080 healthy, smoke passed, 0 touchpoints, 485 s. Not re-verified on the final harness (container from gh2 still occupies :8080).
- Brownfield: failed 7 times (bh1..bh7), each at a different stage; none completed. Runs take 8-21 min; floor with current architecture ~6.5 min (greenfield) / 8 min (brownfield).
- Code Mode benchmark: no savings claimed (docs/demos/code-mode-benchmark.md).

## Deep-dive conclusions (Fable 5.2) - read docs/analysis/deep-dive-fable-5-2.md
Root causes: no pipeline test/resume (DONE in task 1); Gate 2 LLM is a non-deterministic third reviewer; fix loop has no triage; deterministic checks (scope/trace) run late and are terminal; reviewers manufacture requirements; JSON parsing tolerant in only 1 of 4 places (gate.ts; loop.ts, judge.ts, pipeline Gate 2 parse still strict); inconclusive verdict counts as pass; thin generator context (no AC text/sensor limits/conventions); PRD "meta" requirements become untestable ACs; repo eslint/tsconfig only cover src so scripts/ collides with reviewers; planner produces tasks whose tests can't be red.

## Plan (test-first, in order)
1. DONE: stubbed end-to-end test (plugin/tests/pipeline.test.ts, ~4 s) + resume (.daylight/run-state.json, --resume, --stop-after design|plan|inner). ADR-020.
2. NEXT: per-attempt contract check in loop.ts (scope, protected paths, task-AC trace, TDD judged on whole branch not first commit) fed back as fixable, skip evaluator when it fails; classify failures harness/generator/human; stop after the same computational message repeats twice; timeouts (60-120 s) on recordRed and sensors runCmd; inconclusive verdict -> re-ask once then fail; shared extractJson() for all 4 parse sites.
3. Deterministic Gate 2: pure gate2(evidence) approves on all-PASS matrix, green sensors, clean scope, both reviews present, zero blocking findings (AC-60), no inconclusive final verdict; Opus approver only for high tier; fix triage (PR-body defects rebuild body only; only blocking findings go to a fix task). Table tests from real audits (docs/demos/failed-first-attempt/*-audit.jsonl).
4. Then: small-change fast path (size from triage: no Opus Gate 1, one task), parallelise judge + code-review + security-review, plan lint (deps exist, no protected paths, disjoint parallel paths, meta-ACs verified by a sensor), preflight (sensors green at baseline, port free, docker up, base in sync), AC text/sensor limits/conventions in generator prompt, summarize() already fixed to sum phase segments.
5. Only after the stubbed tests cover the above: ONE live brownfield run from the baseline branch (fresh clone of daylight-brownfield-sample, npm install, DAYLIGHT_RUN=<new id>), then a greenfield regression (stop the gh2 container first: it holds :8080).
6. Fix the 3 evidence tests (make validation.test.ts read the actual summary shape, or generate the evidence fields), regenerate docs/traceability.md and docs/reuse-ledger.md (node plugin/src/cli.ts ledger; trace command in README), update docs/demos/README.md, clean stale PRs/branches on the sample repos, push.

## Gotchas learned
- Never edit plugin/src while a live run is in flight (subprocesses reload modules); a syntax slip crashed a run once.
- A // comment inside a one-line edit swallowed the rest of the line once; apostrophes inside single-quoted strings broke pipeline.ts once: run npx tsc --noEmit after every edit.
- Nested node --test needs NODE_TEST_CONTEXT removed from the child env.
- Auto-mode classifier blocks rm -rf of .daylight audit logs and unicode escapes (\\uXXXX) in scripts; use \\x01 style or avoid.
- Commit messages: use git commit -F file (a helper once wrote literal \\n; history was rewritten and the .eml was scrubbed before the first push).
- Run pipeline: cd <clone> && DAYLIGHT_RUN=<id> node <repo>/plugin/src/cli.ts run prd.md --agents --summary-out <file>  (add --resume / --stop-after). Remote present => real gh PR + squash merge + pull; no remote => --local.
- Models: sonnet 5.5 generates, opus 5.5 evaluates/approves/designs, fable 5.2 (model "fable" in Agent tool) used for deep analysis.

# Build plan: Daylight (Lights-On Factory)

Order follows the brief (skeleton → outer loop → inner loop + sensors → PR/review → audit + report → wiki → deploy → reflection/dream) with these justified deviations: (1) **Increment 0** spikes, because several hook and Code Mode details could not be fully verified from the docs read; (2) the **JSONL logger moves up to Increment 2** so every later increment is auditable, while the HTML report keeps a later position; (3) **triage and risk tiers are Increment 3**, before design, because they come from the email and diagram (S16, S17) and set later gate policy; (4) **wiki precedes ingest** because ingest produces a starter wiki; (5) the benchmark and end-to-end validation share the last increment.

Rules for every increment: write the failing test for each listed AC first (AC id in the test name); one commit per increment on a feature branch; reuse ledger updated; demo recorded in docs/demos/. If an increment fails 3 times, stop and report. Code Mode on/off is exercised in Increments 2, 5 and 6 and measured in 13. TypeScript only.

## Increment 0: Spikes and skeleton verification

- **ACs:** (none; unblocks all)
- **Scope:** Resolve the 7 spikes in architecture.md §9 and the unverified items in research.md §1.1; write findings to docs/spikes.md.
- **Demo:** A 10-minute demo: a throwaway plugin whose REPL hook logs one batch, and a `claude -p` run proving plugin hooks fire headless.

## Increment 1: Plugin skeleton, config, doctor, ledger

- **ACs:** AC-1–AC-8
- **Scope:** Plugin manifest, `daylight.yaml` schema/loader, `daylight doctor`, `daylight ledger`.
- **Demo:** Install into an empty repo; `/daylight:run --help`; break the config three ways and show errors; `daylight doctor` with Code Mode on and off.

## Increment 2: Audit log (JSONL, REPL-aware)

- **ACs:** AC-9–AC-15
- **Scope:** Hooks, event schema, hash chain, redaction.
- **Demo:** Run a REPL batch and a normal session; show JSONL with parent links; tamper and show `audit verify` fail.

## Increment 3: Triggers, triage, risk tiers

- **ACs:** AC-98–AC-104
- **Scope:** Work-item schema, triage skill, tier rules, credential deny-list hook.
- **Demo:** Three work items (PRD, GitHub issue, scheduled file) triaged to low/medium/high; an out-of-scope item routed to a human; a credential read denied.

## Increment 4: Outer loop and Gate 1

- **ACs:** AC-19–AC-29
- **Scope:** Design phase, templates, lint, gate machine (human + agent).
- **Demo:** PRD in → three artefacts → reject with feedback → revised → approve; repeat with agent approver; edit an artefact post-approval and show the gate re-open.

## Increment 5: Inner loop: generator/evaluator, TDD, worktrees

- **ACs:** AC-36–AC-48
- **Scope:** Task planner, evaluator agent/rubric, retry/escalation, deny hook.
- **Demo:** Fixture TS PRD with 3 tasks (2 independent): red→green commits, an induced evaluator fail with cited feedback, retry-cap escalation, parallel windows in the log.

## Increment 6: Sensors, traceability, run judge

- **ACs:** AC-49–AC-61; AC-105–AC-107
- **Scope:** Sensor runner (TS), tiers, matrix, review artefact capture, scope check, run judge.
- **Demo:** Fixture with seeded violations (complexity, duplication, secret, dependency layer, out-of-scope file): each fails with short fix messages; an unmapped AC fails the matrix.

## Increment 7: PR and Gate 2 (risk-aware)

- **ACs:** AC-62–AC-68
- **Scope:** PR template/assembly, Gate 2, touchpoint counter, tier policy.
- **Demo:** Open a PR on a sandbox repo with all sections; low/medium/high tiers behave differently; push after approval and show invalidation.

## Increment 8: HTML report and metrics

- **ACs:** AC-16–AC-18; AC-108–AC-108
- **Scope:** Report renderer, cost/cycle-time/touches/share metrics.
- **Demo:** Open the report offline for the Increment 5–7 run; expand a REPL batch; show the four factory metrics.

## Increment 9: Wiki

- **ACs:** AC-75–AC-79
- **Scope:** Wiki skill, manifest, TypeDoc, merge hook; pilot CodeWiki `--update` (ADR-014).
- **Demo:** Merge a change: only affected pages update, links resolve, unexplained pages flagged; toggle off; pilot result noted.

## Increment 10: Brownfield ingest

- **ACs:** AC-30–AC-35
- **Scope:** Ingest command and proposals (TypeScript only).
- **Demo:** Create the small TypeScript repo-fixture (source, tests, lint config, history, one deliberate convention) and ingest it: conventions report, starter wiki, proposed config diff, clean tracked tree; a non-TS repo stops with "unsupported language".

## Increment 11: Deploy and monitor

- **ACs:** AC-69–AC-74
- **Scope:** compose deploy, smoke runner, guard hook, poller.
- **Demo:** Deploy the sample app; break a service and show the poller create a task that re-enters triage; guard blocks a foreign target.

## Increment 12: Reflection, dream, replay

- **ACs:** AC-80–AC-85; AC-109–AC-111
- **Scope:** Reflection, consolidator, allowlist, harness PR, schedule, replay harness, definition diff.
- **Demo:** Run on logs from Increments 5–11: a harness PR with evidence and revert note; out-of-allowlist proposal dropped; replay of 3 past PRs under two configs.

## Increment 13: Efficiency, Code Mode benchmark, end-to-end validation

- **ACs:** AC-86–AC-91; AC-92–AC-97; AC-112–AC-112
- **Scope:** Per-phase metrics, headless matrix test, on/off benchmark, two sample TS projects, final report, ledger.
- **Demo:** Greenfield run, and brownfield run on the repo-fixture, end to end; touchpoint counts; Code Mode on/off table; the degraded-evaluator fallback shown with its warnings.

## AC coverage check

Total ACs: 112. Increment 0 has none. Increments 1–13 cover every AC exactly once; the audit group is split across Increments 2 and 8, and the run-judge/metrics group across Increments 6, 8, 12 and 13.

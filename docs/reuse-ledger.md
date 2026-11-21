| Custom file | Lines | Reuses |
|---|---|---|
| src/audit.ts | 37 | Claude Code hook payloads (PreToolUse/PostToolUse/SubagentStart/Stop). Glue only: map payload -> event. |
| src/benchmark.ts | 29 | claude -p --output-format json usage and the session transcript (Code Mode runs are interactive-only, so its arm is read from a transcript). |
| src/cli.ts | 201 | node argv parsing only; dispatches to config/doctor/ledger modules. |
| src/config.ts | 44 | ajv (JSON Schema validation), yaml (parser). Only glue: defaults merge + error formatting. |
| src/context.ts | 15 | spec.md AC format. Glue: the facts a generator needs on attempt 1 (AC text, sensor limits, repo conventions), so it stops guessing and failing sensors it never saw. |
| src/contract.ts | 16 | globRe from tiers.ts. Glue: pure per-attempt contract checks so loop.ts can fail cheaply before paying for an evaluator. |
| src/definition.ts | 11 | git diff / git show; yaml parser. The Daylight definition is code (ADR-017). |
| src/deploy.ts | 43 | docker compose (deploy), the project's own smoke command, S4's PreToolUse-hook deploy-guard pattern. Glue: gate check, health wait, regression-to-task. |
| src/design.ts | 49 | Superpowers brainstorming + mattpocock to-spec produce the artefacts; this file only lints them (AC-19..23) and stamps revisions. |
| src/doctor.ts | 16 | Claude Code's own settings mechanism (we only detect and instruct; the plugin never sets the variable). |
| src/dream.ts | 51 | claude -p (Opus, headless), pstack /reflect idea, /schedule or cron for timing, gh for the harness PR, git worktrees. |
| src/gate.ts | 77 | claude -p (agent approver) with a rubric skill; brainstorming's reject loop. Glue: state machine, hashes, escalation. |
| src/gate2.ts | 25 | parseFindings/classify from review.ts (AC-60 blocking rule). Glue: Gate 2 as a pure function of evidence, so approval is deterministic and testable. |
| src/guard.ts | 78 | Claude Code PreToolUse hook protocol (exit 2 = deny). Deny patterns come from daylight.yaml (base branch) defaults. |
| src/hook.ts | 6 | Claude Code hooks protocol (JSON on stdin). Never blocks: audit failures must not stop the session. |
| src/ingest.ts | 68 | the repo's own config files as evidence (package.json, tsconfig, ESLint config), README conventions; wiki.ts for the starter wiki. |
| src/judge.ts | 37 | Superpowers SDD spec-compliance review idea; claude -p with the judge agent. Scope check is computational (ADR-013). |
| src/ledger.ts | 32 | node:fs only. Enforces AC-8 (reuse headers + custom-line budget) and AC-6 (no Code Mode variable set by the plugin). |
| src/lib/events.ts | 52 | node:crypto (sha256 hash chain), JSONL files; secret patterns follow gitleaks-style prefixes. |
| src/lib/json.ts | 21 | JSON.parse. Glue: one tolerant parser for all model replies. |
| src/loop.ts | 112 | claude -p subagents (--agent daylight:generator|evaluator), git worktrees, Superpowers SDD loop shape. Glue: retry cap, fresh context, escalation, parallel scheduling. |
| src/metrics.ts | 15 | the audit log only. Human touchpoints (AC-68) and run metrics inputs. |
| src/notice.ts | 6 | Claude Code UserPromptSubmit hook (stdout is shown to the model/user). Prints the degraded-evaluator warning (AC-112). |
| src/pipeline.ts | 200 | every Daylight module (this is only the sequencing, G16), claude -p for authoring/approvals, git, docker via deploy.ts. |
| src/plan.ts | 14 | Superpowers writing-plans produces the tasks; this only checks AC coverage (AC-36). |
| src/planlint.ts | 25 | globRe (tiers.ts), acIds spec format (plan.ts). Glue: deterministic plan checks run before any task starts. |
| src/pr.ts | 71 | gh (PR create/merge), /code-review + /security-review artefacts, the audit log. Glue: required-section assembly and the head-SHA merge check. |
| src/preflight.ts | 27 | git, docker, runFast sensors. Glue: cheap checks before any model is paid for, so a broken environment fails in seconds, not minutes into a run. |
| src/reflect.ts | 21 | the audit log only; pstack /reflect and /correct provide the human-facing flow, this is the machine-readable lesson file the dream job reads. |
| src/replay.ts | 22 | daylight's own inner-loop and sensors commands (run as child processes), claude -p cost JSON. Glue: side-by-side cost vs quality table. |
| src/report.ts | 52 | the audit JSONL only; plain HTML/CSS, no framework, no network (AC-16). Metrics follow the S16/S17 factory metrics. |
| src/review.ts | 25 | /code-review and /security-review (run headless via claude -p) and the artefacts they print. Glue: capture + blocking rule (AC-60). |
| src/sensors.ts | 105 | the project's own test/tsc/eslint commands (run as configured), npm advisory data shape, gitleaks-style patterns (events.ts). |
| src/state.ts | 7 | ADR-010 (state lives in files, not the session). Plain JSON; no library. |
| src/tdd.ts | 33 | git history + the test runner's exit code. Enforces AC-38 (tests first, AC-tagged) and AC-39 (recorded red). |
| src/tiers.ts | 29 | daylight.yaml (tiers.rules) + shipped defaults. Glue: glob->regex and first-match-wins classification. |
| src/trace.ts | 17 | the test runner's TAP output (node --test --test-reporter=tap). Glue: AC id -> test-name mapping. |
| src/triage.ts | 18 | tiers.ts + audit events. The model-based triage skill refines size/spec-needed; this is the deterministic, headless-safe core. |
| src/verdict.ts | 12 | Superpowers SDD review loop shape. Glue: ADR-002 contract (uncited fail = inconclusive). |
| src/wiki.ts | 64 | git (HEAD sha), the design artefacts (intent/spec/ADRs) for the why-trail, claude -p for optional summaries (Sonnet, low effort). |
| src/workitem.ts | 23 | gh CLI for issues (DAYLIGHT_GH overrides the binary for tests). Glue: normalise to one work-item shape. |
| src/worktree.ts | 18 | git worktree. Daylight creates worktrees itself and never combines with claude --worktree (spike 6). |
| **Total** | 1824 | |


# Architecture: Daylight (Lights-On Factory)

Plugin name `daylight` (commands `/daylight:<step>`), config `daylight.yaml`, runtime state `.daylight/` in the target repo. Sources S1–S15 are listed in research.md `1.

## 1. Overview

The harness is a thin orchestration layer. All heavy lifting is done by existing capabilities: Superpowers (brainstorming, writing-plans, subagent-driven-development, TDD, worktrees, finishing-a-development-branch), mattpocock/skills (grill-with-docs, to-spec, tdd, pr, domain-modeling), pstack (poteto-mode configured by /setup-pstack, /reflect, /correct), ub-mode principles with the crapper/dryer/mutator gates, /code-review, /security-review and the security-guidance plugin. Custom code (G1–G17 in research.md) is glue: config, state, hooks, sensor runner, gate machine, evaluator contract, audit log, report, deploy, wiki, dream.

## 2. Component diagram

```text
                      ┌───────────────────────── daylight.yaml ─────────────────────────┐
                      │ gates · models · effort · retries · thresholds · deploy · wiki │
                      └───────────────┬────────────────────────────────────────────────┘
                                      │ read (base branch only)
 Triggers: PRD · GitHub issue · schedule · alert
            │
PRD ──► /daylight:run (G16 orchestrator + .daylight/state.json)
            │
            ├─P0 Triage (G18): size · risk tier · spec-needed ──► out-of-scope → human
            │
            ├─P1 Ingest (brownfield only)  ──► conventions.md, starter wiki, proposed sensor config   [/init, grill-with-docs, improve-codebase-architecture]
            │
            ├─P2 Design ─ Superpowers brainstorming + mattpocock grill-with-docs/to-spec
            │       ► intent.md  spec.md  architecture.md
            │
            ├─G1 Gate machine (G4) ◄── human | approver-agent + rubric skill ──┐ reject-with-feedback loops to P2
            │
            ├─P3 Plan ─ Superpowers writing-plans ► tasks ↔ AC ids, dependency edges
            │
            ├─P4 Inner loop (per task, parallel when independent, in worktree)
            │      Generator (Sonnet 5.5) ── tests first (red) ► impl (green) ► refactor
            │            ▲  fresh minimal context + cited feedback            │
            │            └──── fail ──── Evaluator (Opus 5.5, G5) ◄── sensors ┘
            │                                  retry cap N ► escalate to human
            │
            ├─P5 Sensors (G7)  + scope-drift check (G19)  fast: tests/types/lint/complexity/secrets   slow: mutation/full suite (background)
            │                  traceability matrix (G6)
            ├─P6 Run judge (Opus) ► Review ─ /code-review, /security-review, security-guidance hooks
            │
            ├─P7 PR (G11) ─► G2 Gate machine ◄── agent first; human by risk tier / config
            │
            ├─P8 Deploy (G12) docker compose ► smoke tests          ┐
            ├─P9 Monitor (G13) health poller ─► new task ───────────┴─► back to P3/P4
            ├─P10 Wiki (G14) incremental on merge
            └─P11 Reflect ► P12 Dream (G15) ► PR to the harness repo (gate; never applied silently)

 Cross-cutting: Hooks (G2) ──► .daylight/audit/<run>.jsonl (append-only, hash-chained) ──► report.html (G3)
                Hooks: PreToolUse deny-list (rubric/config/spec edits, credential paths, deploy guard) · PostToolUse/REPL logger · SubagentStop · Stop
```

## 3. Roles, models and effort

Models are defaults in `daylight.yaml`; all use model ids from the session environment. Effort ladder follows pstack's (low < medium < high < xhigh; nothing above xhigh) (S14). Rationale: Sonnet for volume; Opus only where judgment decides a gate or a retry; effort rises only on retry or risk.

| Role | Model | Effort | Why / source |
|------|-------|--------|--------------|
| Orchestrator (main session, /daylight:run) | session model; Sonnet 5.5 recommended | medium | Mostly routing and file I/O; judgment is delegated |
| Ingest scanner | Sonnet 5.5 | medium | Read-heavy, structured output |
| Design author (intent/spec/architecture) | Opus 5.5 | high | Hard decisions, written once; errors are the costliest (S3: judgment moves upstream) |
| Gate 1 approver agent | Opus 5.5 | high | Rubric-bound gate decision |
| Triage | Sonnet 5.5 | medium | Classification with file evidence; escalates to human when unsure |
| Run judge (whole run vs spec, scope) | Opus 5.5 | medium (high on retry ≥ 2) | S16: judge grades each whole run; veto needs citations (ADR-002) |
| Planner (writing-plans) | Sonnet 5.5 | medium | Decomposition with exact files is mechanical once design is approved |
| **Generator** | **Sonnet 5.5** | low (small task) / medium (default) / high (risky or retry ≥ 2) | Brief requirement R4 |
| **Evaluator** | **Opus 5.5** | medium (rubric-bound, default) / high (retry ≥ 2 or security-sensitive) | Brief requirement R4; cited evidence required (S6) |
| Traceability auditor | Opus 5.5 | medium | Only judges whether tests assert the AC; matrix itself is computed |
| /code-review, /security-review | per command defaults; level medium (high for Gate 2 diffs flagged risky) | — | Reuse as is |
| Gate 2 approver agent | Opus 5.5 | high | Final gate before merge |
| Wiki writer | Sonnet 5.5 | low | Summaries from code and links |
| Reflection | Sonnet 5.5 | medium | Log mining |
| Dream consolidator | Opus 5.5 | high | Proposes changes to the harness itself |
| Real-model test runs (CI of the harness) | Haiku 5.5 | low | Cheap validation |
| Sensors, report, audit, deploy, matrix | none | — | Deterministic scripts |

poteto-mode (S14) is used for the generator's playbook-level guidance by **configuring** its model roles (setup-pstack) to Sonnet/high-or-medium rather than copying it; the exact config file location is a spike (`9).

## 4. Phase table: Code Mode capable vs headless

Rule: **every phase must work headless** (no Code Mode, `claude -p` compatible) because Code Mode is interactive-terminal only (S10). "Code Mode capable" means the phase has an interactive path that benefits from batching, in addition to its headless path. Marked per brief requirement.

| Phase | Mode | Code Mode use | Headless path |
|-------|------|---------------|---------------|
| P0 Doctor / setup | headless | none (detects Code Mode) | scripts |
| P0 Triggers + triage | **headless** (scheduled triggers); Code Mode capable when interactive | batch issue and repo reads | `claude -p`, `/schedule` routine, or GitHub Actions |
| P1 Ingest | **Code Mode capable** | batch multi-file reads and scans | `claude -p` with the same skill |
| P2 Design | **Code Mode capable** (interactive authoring with human) | batch reads of PRD, wiki, conventions | `claude -p` when approver = agent |
| G1 / G2 gates | **Code Mode capable** when human-interactive; **headless** when agent approver | none required | agent approver via `claude -p` |
| P3 Plan | Code Mode capable | batch reads | headless |
| P4 Inner loop (generator/evaluator) | **Code Mode capable** | batch test + sensor runs, multi-file reads/edits | `claude -p` subagents |
| P5 Sensors | **headless** (plain scripts; also CI) | optional batching by caller | scripts, GitHub Actions |
| P6a Run judge | headless | none | `claude -p` |
| P6 Review (/code-review, /security-review) | **headless** | none | CI / `claude -p` |
| P7 PR assembly | headless | none | script + gh |
| P8 Deploy + smoke | headless | none | script |
| P9 Monitor | headless (scheduled) | none | /schedule or cron |
| P10 Wiki | headless (runs on merge) | none | `claude -p` |
| P11 Reflect | headless | none | `claude -p` |
| P12 Dream | headless (scheduled) | none | /schedule routine |
| Audit logger | headless (hooks run in every mode; REPL matcher only fires in Code Mode) | n/a | hooks |

Plugin mechanics confirmed from docs (S18): hooks are registered in `hooks/hooks.json` and reference scripts via `${CLAUDE_PLUGIN_ROOT}`; they also fire under `claude -p` unless `--bare` is used, so headless phases must not use `--bare`. Only PreToolUse-class hooks can block (PostToolUse cannot), so every deny rule is PreToolUse. Agent files in `agents/` pin `model`, `effort`, `maxTurns` and `tools`; plugin agents ignore `hooks` and `permissionMode` frontmatter, so permissions come from the session or `claude -p --permission-mode`.

Consequences of Code Mode's documented limits (S10): (a) waited code stops at 10 min, so slow sensors run as background tasks or separate steps; (b) the sandbox does not cover the JavaScript or its file/web/MCP calls, so deploy guard and deny rules are PreToolUse hooks and permission rules, never sandbox-dependent; (c) sessions started in Code Mode can be resumed only with it on, so run state lives in `.daylight/state.json` not in the session.

## 5. Gates

State machine per gate: `pending → approved | rejected(feedback) | edited`, recorded with source (`human`|`agent`), rubric scores, artefact hashes (Gate 1) or PR head SHA (Gate 2). Approval is invalidated by a change to the hashed subject. Escalation (retry cap exceeded, repeated rejection) always routes to a human. `gates.*.human_required` forces a human even when an agent approved first (S6: agent approval never counts as a person's).

## 6. Audit data flow

Hooks append events to `.daylight/audit/<run>.jsonl`: `{id, parent_id, ts, run, phase, actor, model, kind, tool, summary, tokens, sensor, verdict, gate, sha_prev}`. REPL events carry the code and `toolsUsed`; inner calls link via `parent_id`. Hash chain gives tamper evidence. The report script reads only this file and the artefact directory. Token counts come from subagent/session usage data; where a surface does not expose them the event records `tokens: null` and the report says so (spike `9).

## 7. Sensors

Tiering follows "keep quality left" (S1): **fast** after each task (tests, type check, lint with complexity/length limits, secret scan, dependency-layer rules); **slow** at integration/background (mutation testing, full suite, duplication, dependency freshness). Thresholds from `daylight.yaml` (default CRAP < 10, duplication similarity ≥ 0.8 from ub-mode S15; coverage default 80% line). Output is rewritten into short, fix-oriented messages (S2). Sensor pass/fail is computed by exit status, never by a model.

## 8. Architecture decision records

### ADR-001 Compose existing plugins; no fork of poteto-mode
- **Status** proposed. **Context** pstack defaults to Opus xhigh and is slow, but exposes per-role model/budget configuration (S14). **Decision** configure it; write only glue. **Consequences** Upstream updates arrive for free; we depend on its config path (spike) and on `disable-model-invocation`, so we invoke it explicitly. **Alternative rejected** fork and trim: duplicates maintenance.

### ADR-002 Evaluator verdicts must cite evidence; computational sensors decide
- **Context** S6 requires verified findings; S1 distinguishes sensors. **Decision** Opus evaluator returns JSON with citations; uncited fail = inconclusive. Required computational sensors can veto a pass but an inferential pass never overrides a computational fail. **Consequence** fewer false blocks, slightly more advisory noise.

### ADR-003 Every phase works headless; Code Mode is an optimisation
- **Context** Code Mode is experimental, interactive-only (S10). **Decision** all phase logic lives in skills, scripts and hooks that run under `claude -p`; Code Mode only changes how the interactive session batches. **Consequence** unattended phases are reliable; savings must be measured (AC-87).

### ADR-004 Audit via hooks, REPL-aware, hash-chained JSONL
- **Context** Code Mode batches tool calls inside REPL code (S10). **Decision** PreToolUse/PostToolUse on `REPL` plus per-tool hooks, linked by parent id. **Consequence** no gaps; some duplicate suppression logic; hook payload shapes verified in spike.

### ADR-005 Gate and sensor configuration read from the base branch
- **Context** S5, S8: checks must be out of reach of the change they judge. **Decision** thresholds, rubrics and deny-lists load from the base/default branch (or plugin install), and a PreToolUse hook blocks generator edits to them. **Consequence** legitimate threshold changes go through the dream/harness PR path.

### ADR-006 Gate defaults: Gate 1 human, Gate 2 agent-then-human; both configurable
- **Context** Brief allows either; S4 says a human always makes the design call; S6 says agent approval is not a human's. **Decision** defaults are conservative (2 touchpoints); a documented profile with two agent approvers gives 0 touchpoints; risk tier can force a human at Gate 2 (ADR-012). Status: accepted (operator decision). 

### ADR-007 Docker compose deploy only in v1; deploy guard as a hook
- **Context** Brief scope; S4 uses a PreToolUse exit-2 hook to block unauthorised deploys. **Decision** reuse that pattern for a local/test target only.

### ADR-008 Local /code-review and /security-review, not managed Code Review, as PR evidence
- **Status** accepted: the operator is on a personal Pro plan. **Context** Managed Code Review needs Team/Enterprise and never approves or blocks (S8). **Decision** run local commands and store outputs; optional managed review is additive. **Consequence** works on any plan; no continuous PR re-review service.

### ADR-009 Language scope for sensor adapters: TypeScript only in v1
- **Status** accepted (operator decision). **Context** Sensors are language-specific (S2 used TS). **Decision** one TypeScript adapter; ingest of a non-TypeScript repo reports "unsupported language" and stops. **Consequence** smaller G7; other languages are a later increment.

### ADR-010 Persist run state in files, not the session
- **Context** Code Mode sessions can't move surfaces and resume only with Code Mode on (S10); /goal state resets on resume (S11). **Decision** `.daylight/state.json` plus audit log are the source of truth. **Consequence** any phase can resume headlessly.

### ADR-011 /goal is a completion aid for unattended phases, not a gate
- **Context** /goal's evaluator calls no tools and sees only the transcript (S11). **Decision** use it only with conditions backed by shown script output (e.g. "`daylight sensors` exit 0 shown"); the authoritative check stays in scripts.

### ADR-012 Triggers, triage and risk-tiered review
- **Context** S16/S17: work arrives from many sources, triage precedes spec, and review is routed by risk so people own security, data and payments; S6: a classifier sets the tier from the change, not the author. **Decision** a work-item schema; Sonnet triage; tiers as path/keyword rules in `daylight.yaml`, with shipped defaults that mark authentication, authorization, secrets, data-store/migration, payment/billing, CI workflow and deploy paths as high (operator rules extend or override); the tier overrides the agent's own classification and sets the Gate 2 policy. **Consequence** extra phase P0 and config; low-risk chores can run with 0 touchpoints.

### ADR-013 Whole-run judge with a computational scope check
- **Context** S16: a judge grading the whole run vetoes about a quarter of sessions in one team's anecdote, mostly for wandering outside the prompt. **Decision** scope adherence is computed from the diff against each task's declared paths (no model); the Opus run judge grades the rest and its veto needs a citation (ADR-002). Veto and recovery rates are metrics. **Consequence** one extra Opus call per run.

### ADR-014 Wiki: replicate a minimal skill, pilot CodeWiki first
- **Context** Survey S19: hosted tools expose code to a third party; self-hosted tools are heavy; none link modules to ADRs/specs. **Decision** a small skill with a manifest (page → sources → hashes → SHA), regeneration of stale pages only, TypeDoc for exported-symbol facts, `intent:` front matter for the why-trail; pilot FSoft-AI4Code/CodeWiki `--update` in Increment 9 and adopt it as the engine if its output is good. **Consequence** MIT attribution if code or design is copied (ADR-015).

### ADR-015 Reuse by install; replicate with MIT attribution where install is impractical
- **Status** accepted (operator decision). **Decision** prefer installing Superpowers, mattpocock/skills, pstack and other plugins as dependencies; where a piece must be adapted (ub-mode's single SKILL.md, a rubric, a wiki design), copy it into `vendor/` with its licence and an attribution header and list it in the reuse ledger. The licences of the four named sources are MIT per the READMEs read.

### ADR-016 Personal Pro plan: Opus only at judgments; loud, bounded fallback to Sonnet when Opus is unavailable
- **Status** accepted (operator decision). **Context** Subagent requests share the plan's usage limits and Pro-specific Opus quotas are undocumented on the pages read (S18); the docs say switching model family works around a hit Opus limit. **Decision** Opus is used only for design, gates, evaluator and run judge. If it is unavailable, the evaluator falls back to `models.evaluator_fallback` (default Sonnet 5.5); the fallback is never silent: a `degraded_evaluator` event, a `degraded` tag on each verdict, a PR-body and report warning, and a prompt-time notice. A degraded verdict cannot satisfy a high-tier gate or be the only approval. Usage is reported per phase so the operator can tune effort. **Consequence** runs keep moving on quota exhaustion at the cost of weaker grading, which is made visible; `/schedule` routines (100 scheduled runs/hour cap) suit the dream job.

### ADR-018 Brownfield validation uses a purpose-built fixture repo
- **Status** accepted (operator decision). **Context** The brief's example repo is not to be referenced or used. **Decision** create a small TypeScript repo-fixture (existing source, tests, lint config, history, one deliberate convention) in the validation increment; ingest and the brownfield demo run on it. **Consequence** reproducible, no coupling to a third-party repo; the fixture is itself a test asset.

### ADR-017 The Daylight definition is code, versioned in the target repo
- **Context** S16/S17: the factory definition (skills, rules, automations config) governs every stage and can be diffed and rolled back; plugins cannot ship settings (S18). **Decision** `daylight.yaml`, rubrics and deny-lists are repo files read from the base branch (ADR-005); `daylight definition diff` shows changes; observer/dream PRs change them.

## 9. Spikes (resolve before dependent increments; see build-plan Increment 0)

1. Do plugin-shipped hooks fire with matcher `REPL` under Code Mode? (Docs confirm plugin hooks fire under `claude -p` without `--bare`; REPL matching from a plugin is unconfirmed.)
2. How to detect Code Mode on at runtime (hook env vs observed REPL events)?
3. Where does /setup-pstack write under Claude Code (README vs SKILL.md disagree)?
4. Which field names carry usage in the transcript JSONL named by `transcript_path`, and does OTel work on Pro?
5. `/code-review` runs in `-p` (docs); `/security-review` is not documented on any page read: confirm it works in `-p` and what it outputs.
6. `claude --worktree` behaviour combined with Superpowers using-git-worktrees (avoid double creation).
7. Plugin command namespace and how plugin hooks receive plugin root path.

## 10. Reuse ledger (planned)

| Custom piece | Reuses |
|--------------|--------|
| config loader (G1) | plugin format, JSON schema |
| audit hooks, report (G2,G3) | Claude Code hooks; payload from S10 |
| gate machine (G4) | brainstorming reject loop, subagents |
| evaluator contract (G5) | SDD review loop, requesting-code-review |
| traceability (G6) | test runner outputs |
| sensor runner (G7) | tsc, ESLint, Semgrep, dependency-cruiser, Stryker, GitLeaks, ub-mode thresholds |
| triage, run judge, scope check (G18, G19) | mattpocock triage, SDD spec-compliance review, verifier subagent |
| metrics, replay (G20) | `claude -p` JSON cost, OTel |
| ingest (G8) | /init, grill-with-docs, improve-codebase-architecture |
| PR assembly (G11) | gh, mattpocock pr |
| deploy/monitor (G12,G13) | docker compose, S4 hook pattern |
| wiki (G14) | TypeDoc, CodeWiki design (MIT), domain-modeling/ADR output |
| dream (G15) | pstack /reflect, /correct, /schedule |
| orchestrator (G16) | Superpowers workflow |

# Research: mapping the Daylight (Lights-On Factory) brief to existing capabilities

Status: research phase, **revision 2**, 2026-11-20. This is a fresh attempt; no earlier Daylight/factory design is assumed. Product name: **Daylight** (the brief calls it "Lights-On Factory"); plugin `daylight`, config `daylight.yaml`. Decisions from the operator review are folded in: TypeScript only, personal Pro plan, Docker available, reuse-or-replicate with MIT attribution. No plugin code exists.

## 1. Sources read

| # | URL | Fetched | Used for |
|---|-----|---------|----------|
| S1 | https://martinfowler.com/articles/harness-engineering.html | full | guides vs sensors, computational vs inferential, "keep quality left", harnessability |
| S2 | https://martinfowler.com/articles/sensors-for-coding-agents.html | ~80% verbatim; appendix (sidecar) from a summary | concrete sensor inventory (type check, ESLint limits, Semgrep, dependency-cruiser, Stryker, GitLeaks), LLM-friendly messages, sensor conflicts |
| S3 | https://addyosmani.com/blog/software-factories/ | full | loop/harness/factory, lit vs dark, comprehension debt, back pressure, directed graph of states |
| S4 | https://claude.com/resources/articles/the-ai-native-sdlc-playbook | Plan/Design/Build verbatim; Test/Deploy/Maintain from a summary | intent.md→spec.md→plan.md chain, hooks as deterministic layer, verifier subagent, worktrees, REVIEW.md, deploy-block hook, bands.yaml monitoring |
| S5 | https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/ | full | E2E/property/differential tests, verify skill, 3-round cap then human, checks not editable by the change, commit stamping |
| S6 | https://claude.dev/blog/solving-code-review-at-anthropic/ | full | find/verify/rank, risk tiers, "agent approval never counts as a person's", convergence cap, incident→eval |
| S7 | https://code.claude.com/docs/en/overview | full | skills, hooks, subagents, headless `` -p, GitHub Actions, scheduling |
| S8 | https://code.claude.com/docs/en/code-review | full | managed Code Review: Team/Enterprise only, never approves/blocks, REVIEW.md from base branch |
| S9 | https://code.claude.com/docs/en/security-guidance | full | security-guidance plugin (hook-based), 3 layers, env switches |
| S10 | https://code.claude.com/docs/en/code-mode | full | REPL tool, hook payloads, limits, sandbox caveat |
| S11 | https://code.claude.com/docs/en/goal | full | /goal evaluator semantics, -p support |
| S12 | https://github.com/obra/superpowers | README only (skill files not read) | skill catalogue and workflow |
| S13 | https://github.com/mattpocock/skills | README only | skill catalogue |
| S14 | https://github.com/cursor/plugins/tree/main/pstack (+ setup-pstack and poteto-mode SKILL.md) | README + 2 SKILL.md; 24 principle skills, playbooks and agents/ not read | poteto-mode, roles, models, setup-pstack |

| S16 | docs/The Modern Software Developer_ What is a Software Factory_.eml (Stanford course email, M. Gutman / themodernsoftware.dev) | full | production line + one quality bar + learning loop; AI judge grades each whole run vs spec; metrics; replay; factory defined as versioned code; risk tiers |
| S17 | ./unnamed.jpg (diagram that came with S16; at repo root, not under docs/) | viewed | Triggers → orchestrator loop (Triage, Spec, Implement, Review, Verify) with human checks (approve spec, risk-tiered review, product check), isolated sandbox with no prod credentials, verification (AI judges/scorers, tests/CI, computer-use checks), Ship (PR, merge, deploy), Monitor feeding triage, factory definition (skills, rules/AGENTS.md, automations config) governing every stage, telemetry (cost per PR, cycle time, human touches per PR) with observer agents that PR the factory |
| S18 | Claude Code docs: /hooks, /plugins, /plugins-reference, /sub-agents, /headless, /cli-reference, /code-review-local, /common-workflows, /costs, /github-actions, /monitoring-usage, /routines (https://code.claude.com/docs/en/<name>) | partial: hooks first ~40k of 295k chars verbatim and sub-agents first ~40k of 117k verbatim, the rest summarised; monitoring-usage and routines partial; worktrees page, hooks-guide, settings-reference and /security-review not found | plugin layout, hook events/payloads, subagent frontmatter, `claude -p` flags and output, `/code-review` options, plan constraints |
| S19 | Wiki-generator survey (DeepWiki, deepwiki-open, OpenDeepWiki, Google Code Wiki, FSoft-AI4Code/CodeWiki, natsu1211/deepwiki-skill, mraza007/codewiki, Repomix, TypeDoc) | repo landing pages only; nothing cloned or run; last-commit dates not seen | §3.7 wiki recommendation || S15 | https://github.com/unclebob/ub-mode (+ SKILL.md) | full | quality gates: CRAP, duplication, mutation |

### 1.1 Caveats on the evidence

- S4 and S2: the portions marked "summary" were model-extracted, not verbatim. Claims taken from them (S4 Test/Deploy/Maintain; S2 sidecar) are marked **(summary)** below and should be re-verified before an ADR depends on them. S16 gives anecdotes ("one large team's judge vetoes about a quarter of agent sessions") without published data; they are used as design motivation, not as targets.
- Claude Code docs pages beyond the brief's list were read in revision 2 (S18), but only partially: hook stdin fields and exit codes, and the SubagentStart/Stop payload, come from a summary of a 295k-character page. `/security-review` is not documented on any page read. Anything an AC depends on is re-checked in Increment 0.
- S12/S13/S14: skill internals were read only where stated. Capabilities are taken from README descriptions.
- Wiki generators were surveyed in revision 2 (S19). Docker deploy plugins were not searched; Docker glue is small and built in.

## 2. Key findings that shape the design

1. **pstack's model defaults are configurable by a rules file, so the "tuned variant" is configuration, not a fork.** /setup-pstack writes per-role model and reasoning budget lines (default Opus 5.5 xhigh; budgets small/medium/large) and "never goes above xhigh" (S14). Where poteto-mode is used, we configure it instead of copying it. Caveat: the README and SKILL.md disagree on the output path (`/.claude/rules/pstack-models.md vs ~/.cursor/rules/pstack-models.mdc), so verify in Increment 0. poteto-mode has disable-model-invocation: true, so the harness must invoke it explicitly, not rely on auto-trigger.
2. **ub-mode does not enforce SOLID or Clean Code by name** (S15). It enforces TDD, CRAP < 10, duplication similarity ≥ 0.8 and mutation survivors through external tools (crapper, dryer, mutator). SOLID/SRP therefore must be encoded in our own guide text plus computational proxies (complexity, function length, dependency-cruiser layering per S2).
3. **Claude Code's managed Code Review is not usable as the PR gate for everyone**: Team/Enterprise only, runs on Anthropic infrastructure, read-only, and "never approves or blocks" (S8). The portable path is local /code-review plus /security-review plus the security-guidance plugin (S9) run by the harness.
4. **/goal's evaluator reads only the conversation and calls no tools** (S11). It can enforce "sensors exit 0" only if the output is shown in the transcript. It is a completion check, not a sensor.
5. **Code Mode is interactive-terminal only**: not -p, not the Agent SDK, not Desktop or cloud (S10). Hooks matching REPL receive tool_input.code and tool_response with code, result, stdout, stderr, toolsUsed. Each inner tool call also still fires its own PreToolUse hook under its normal name (S10), so audit must de-duplicate REPL envelopes against inner calls.
6. **Anthropic's own practice already answers several gate questions**: agent approval never counts as a human approval; checks must be out of reach of the change they judge; review config is read from the base branch (S6, S5, S8). We adopt these as design rules.

7. **Plugin mechanics, now confirmed from docs (S18):** a plugin needs only `name` in `.claude-plugin/plugin.json`; hooks live in `hooks/hooks.json` with a top-level `hooks` wrapper and use `${CLAUDE_PLUGIN_ROOT}`; `CLAUDE.md` at plugin root is **not** loaded (use a skill); a plugin cannot ship settings, only prompted `userConfig`. So `daylight.yaml` lives in the target repo, which also matches S16's "define the factory as a versioned file you can diff, review and roll back". Subagent files accept `model`, `effort` (low/medium/high/xhigh/max), `maxTurns`, `tools`, `isolation: worktree`, so generator/evaluator pinning is configuration. Plugin subagents ignore `hooks`, `mcpServers` and `permissionMode`.
8. **Hooks:** they fire under `claude -p` unless `--bare` is used. Only PreToolUse-class events can block (exit 2 or `permissionDecision: deny`); **PostToolUse cannot block**, so deny rules are PreToolUse. SubagentStart/Stop exist but the documented payload has no usage field; token data comes from `transcript_path` JSONL (field names unverified), `claude -p --output-format json` (`total_cost_usd`, per-model breakdown), or OpenTelemetry (`claude_code.token.usage`, `claude_code.api_request`; names from a summary).
9. **Personal Pro plan:** managed Code Review is unavailable (S8); `/code-review` local works in `-p` and with `--fix`/`--comment` (S18); routines/`/schedule` are available on Pro (100 scheduled runs per hour per account) and GitHub Actions can use `claude setup-token` OAuth (S18). Pro Opus/Sonnet quotas are not documented on the pages read, and the docs say a hit Opus limit can be worked around by switching model family, which would silently weaken the evaluator; the design instead falls back to Sonnet **loudly** (degraded flag, warnings, no sole approval) per the operator's decision (ADR-016).
10. **The email and diagram (S16, S17) add four ideas the brief lacks:** (a) *triggers and triage* in front of the loop (issue, schedule, alert); (b) a *whole-run AI judge* that grades build/pass, spec match and scope, because the commonest agent failure is "wandering outside the prompt"; (c) *risk-tiered human review*; (d) *factory metrics* (cost per PR, cycle time, human touches per PR, share of merged PRs through the factory) and *replay of past PRs* to compare model/config choices. All four are adopted (R21–R24).

## 3. Requirement → existing capability map

Legend: **R** = reuse as is; **C** = configure; **P** = thin plumbing needed (itemised in `4).

### 3.1 Constraints

| Req | Brief requirement | Existing capability | Source | Disposition |
|-----|-------------------|---------------------|--------|-------------|
| R1 | Reuse, don't reinvent; justify custom code | Plugin composition. Every component below maps to an existing skill/feature. | S7, S12–S15 | Design rule; a reuse ledger is a deliverable (AC) |
| R2 | Local plugin: `.claude-plugin/plugin.json`, skills, agents, hooks, commands | Claude Code plugin format; security-guidance is a worked example of a hooks-only plugin; Superpowers and mattpocock ship .claude-plugin/ | S9, S12, S13 | R (format) + P (our content) |
| R3 | Greenfield and brownfield; brownfield first ingests code (wiki + conventions scan) | /init (CLAUDE.md generation), mattpocock grill-with-docs (domain model, GLOSSARY.md, ADRs), improve-codebase-architecture (codebase scan), pstack /how and /recall for explaining code; wiki itself: see R16 | S4, S13, S14 | C + P (ingest orchestration, conventions scan → sensor config) |
| R4 | Generator (Sonnet 5.5) / evaluator (Opus 5.5) per task, rubric, pass/fail + feedback, retry cap N, escalate | Superpowers subagent-driven-development: fresh subagent per task with two-stage review (spec compliance, then quality) and requesting-code-review; subagent files take a model setting; S5 verifier subagent; S5 "after three rounds stops and brings in a human"; S6 convergence cap | S12, S4, S5, S6 | R (loop shape) + C (model pinning) + P (rubric schema, retry cap, escalation, verdict JSON) |
| R5 | Token/latency efficiency: Sonnet gen, Opus only evaluate/hard decisions, per-task effort, parallel subagents, minimal context, measure per phase | pstack model/budget config (S14); Superpowers dispatching-parallel-agents and SDD (fresh minimal context per task) (S12); poteto-mode passes file pointers not inlined context (S14); /goal reports token spend (S11); claude -p can emit JSON/stream-json (S11) | S11, S12, S14 | C + P (per-phase token/time aggregation, task-size → effort policy) |

### 3.2 Code Mode

| Req | Brief requirement | Existing capability | Source | Disposition |
|-----|-------------------|---------------------|--------|-------------|
| R6a | Design interactive phases to batch tool calls | Code Mode itself; our skills simply instruct "batch sensor runs and multi-file reads in one REPL call" | S10 | R (feature) + C (skill wording) |
| R6b | Mark each phase Code Mode capable vs headless | n/a — design artefact. Constraint is from S10: Code Mode not in -p/SDK/Desktop/cloud | S10 | Design (architecture.md `5) |
| R6c | Plugin must not set the env var; document; detect at runtime | Project settings ignore the variable; user-level settings env block or shell export (S10). Detection method: see Gap G9 | S10 | P (detector + docs) |
| R6d | Audit REPL calls via Pre/PostToolUse matching REPL | Hook payload documented: tool_input.code, tool_response.{code,result,stdout,stderr,toolsUsed,error} (S10). Hooks are the documented deterministic layer (S4, S7) | S10 | R (hook mechanism) + P (logger) |
| R6e | 10-minute wait limit; long suites as background/separate steps | Background code runs up to 2 h in auto/bypass modes (S10); /tasks to stop; S2 notes mutation testing is resource-heavy and run on slower cadence | S10, S2 | C + P (sensor tiers: fast inline, slow background/CI) |
| R6f | Sandbox does not cover Code Mode JS | Documented (S10); deny/ask rules and PreToolUse hooks still apply to each inner call under its normal tool name | S10 | R + design rule: safety = hooks/permissions + container, never sandbox alone |
| R6g | Measure tokens/time Code Mode on vs off | None | — | P (benchmark harness; see G10) |

### 3.3 SDLC

| Req | Brief requirement | Existing capability | Source | Disposition |
|-----|-------------------|---------------------|--------|-------------|
| R7 | Outer loop: PRD(+NFRs) → intent.md, spec.md, architecture.md (ADRs, NFR mapping) | Superpowers brainstorming (design doc before building) and writing-plans; mattpocock grill-with-docs (alignment + ADRs + GLOSSARY.md) and to-spec; the AI-native playbook defines exactly the intent.md → spec.md → plan.md chain and says each stage commits an artifact the next reads | S4, S12, S13 | R + P (templates with testable-AC format, NFR→mechanism table, PRD ingestion command) |
| R8 | Gate 1: human or approver agent with rubric skill; approve/edit/reject-with-feedback loops back | Playbook: a human always makes the design call (S4) — so agent approver is a configured policy choice, not an Anthropic default. Reject-loop: brainstorming iteration (S12). Human prompt UI: Claude Code interactive prompts. Agent approver: a subagent + skill | S4, S6, S12 | P (gate state machine, rubric skill, config switch). Policy default: see ADR-006 |
| R9 | spec ACs → failing tests first; strict TDD red→green→refactor; SOLID/SRP as guides in skills + CLAUDE.md | Superpowers test-driven-development (RED-GREEN-REFACTOR; deletes code written before tests); mattpocock tdd; pstack /tdd; ub-mode TDD section; S5 "failing test first, hook blocks test-file edits during the fix" **(summary)**; S1 guides = AGENTS.md/Skills | S1, S4, S12–S15 | R/C + P (AC-ID → test naming convention; SOLID guide text — see finding 2) |
| R10 | Computational sensors via hooks and CI: tests, coverage, mutation, types, lint, complexity/duplication, dependency and secret scans | S2 inventory: tsc, ESLint (max-args, file/function length, complexity), Semgrep, dependency-cruiser, Stryker incremental, GitLeaks pre-commit; ub-mode: CRAP < 10 (crapper), duplication ≥ 0.8 (dryer), mutator; S1 "keep quality left": fast controls pre-commit, costly post-integration; S5: Stop hook runs tests; S9 per-edit pattern checks; CI: GitHub Actions (S7) | S1, S2, S5, S9, S15 | C (tools) + P (sensor runner reading daylight.yaml thresholds, LLM-friendly output, language adapters) |
| R11a | Inferential: /code-review | Local /code-review (any plan; works on current diff or PR target; effort level argument; --fix, --comment) — from this session's skill list; S8 comparison table lists it as the local option | S8 | R |
| R11b | Inferential: /security-review | /security-review (current branch changes) and security-guidance plugin hooks | S9 | R |
| R11c | Evaluator check: every AC maps to a passing test (traceability matrix) | None. S5's "feature map as grading rubric" and S4's verifier subagent are the nearest patterns; S6's "findings need file+line evidence" informs the rubric | S4, S5, S6 | P (matrix generator is computational; the evaluator only audits test quality) |
| R12 | Worktree + feature branch; PR with matrix, sensor results, verdicts | claude --worktree (S4); Superpowers using-git-worktrees, finishing-a-development-branch; mattpocock pr (PR body shape); pstack opening-a-PR playbook; gh | S4, S12–S14 | R + P (PR body template that embeds matrix/sensors/verdicts) |
| R13 | Gate 2: human or agent per config; agent first, human optional | S6: tiered approval; "agent's approval never counts as a person's"; findings block merge; S8: managed review never approves | S6, S8 | P (same gate machinery as Gate 1). Policy default: ADR-006 |
| R14 | Deploy to docker compose/test env; smoke tests | S4: PreToolUse hook (exit 2) to block unauthorised production deploys; E2E-driving "verify skill" pattern (S5); pstack /create-verification-skill creates app-specific verifiers (S14, README only) | S4, S5, S14 | P (compose deploy + smoke runner glue; deploy guard hook) |
| R15 | Monitoring hooks feed failures back as new tasks | S4 Maintain **(summary)**: headless run on monitoring trigger, deterministic script with threshold bands in bands.yaml, findings written back as intent.md; /schedule routines and /loop for recurring runs (S7) | S4, S7 | R (pattern) + P (compose health poller → task file) |

### 3.4 Lights-on, self-improvement, config

| Req | Brief requirement | Existing capability | Source | Disposition |
|-----|-------------------|---------------------|--------|-------------|
| R16 | Code wiki, incremental on merge: overview, module pages, "why" trail to intent/spec/ADRs | mattpocock grill-with-docs/domain-modeling produce GLOSSARY.md + ADRs; improve-codebase-architecture outputs an HTML report; pstack /how, /why; S3 comprehension debt motivates it. No listed reference generates a wiki. | S3, S13, S14 | P (wiki generator skill + merge hook; per-module "why" links) |
| R17a | Append-only JSONL event log of every agent action, model, tokens, sensor result, verdict, gate decision | Hooks (PreToolUse, PostToolUse, SessionStart, Stop and others) are the documented capture mechanism (S7, S9, S10); transcripts exist but are not append-only/auditable artefacts | S7, S9, S10 | P (logger hook + schema) |
| R17b | Single self-contained HTML report per run | None in refs; improve-codebase-architecture shows HTML output is acceptable practice | S13 | P (renderer) |
| R18a | Reflection: mine audit log for failures, retries, findings, human corrections | pstack /reflect, /correct and principle encode-lessons-in-structure; mattpocock retro; S6 incident→eval pipeline and "patterns in ≥2 PRs, three agents try to disprove, human approves" | S6, S13, S14 | R (method) + P (log miner feeding them) |
| R18b | Periodic dream job proposes updates to skills/rubrics/CLAUDE.md/thresholds, via PR to the harness | /schedule routines or /loop; claude -p (S7); S6 approach to turning misses into rules; Superpowers writing-skills (skill authoring/testing) | S6, S7, S12 | R + P (consolidator, harness-PR opener, scope allowlist) |
| R19 | Single config file | Plugins cannot ship settings; only prompted `userConfig` (S18). S16/S17: "factory definition (code)" as a versioned file in the repo | S16, S17, S18 | P (`daylight.yaml` schema + loader, versioned in the target repo) |

### 3.5 Process and done-when

| Req | Existing capability | Disposition |
|-----|---------------------|-------------|
| R20a One command PRD → PR → Docker, ≤ 2 touchpoints | Skills/commands chaining; Superpowers workflow order (S12); /goal for unattended completion conditions (S11) | P (the /daylight:run orchestrator command, touchpoint counter) |
| R20b Every PR carries /code-review + /security-review results | R11a/b + R12 | P (PR template + gate check) |
| R20c Custom-code ledger with reuse source | — | P (reuse-ledger.md generated and checked in CI) |
| R20d Two validation projects: greenfield, and a brownfield repo | **Operator decision:** `always_on_agents_v1.0` is not referenced or used; brownfield validation uses a small TypeScript repo-fixture created for the purpose (ADR-018) | Increments 10 and 13 |

### 3.6 Additions from the email and diagram (S16, S17)

| Req | Requirement (new) | Existing capability | Source | Disposition |
|-----|-------------------|---------------------|--------|-------------|
| R21 | Triggers and triage: work enters from a PRD, a GitHub issue, a schedule or an alert; triage classifies size, risk tier and whether a spec is needed | `gh` for issues; `/schedule` routines (Pro-available) and `/loop`; GitHub Actions (`claude-code-action` with `prompt`, `on: schedule`); mattpocock `triage` (issue state machine) | S7, S13, S17, S18 | R (sources) + P (work-item schema, triage skill, risk classifier) |
| R22 | Risk-tiered review: low = automated checks only, medium = one person, high = person required even if an agent approved; classifier decides from the change, not the author | Anthropic's tiers and rules ("agent approval never counts as a person's") | S6, S16 | P (tier config + Gate 2 policy) |
| R23 | Whole-run AI judge: grades build/pass, spec match, custom checks, and scope adherence; veto and recovery rate tracked | Superpowers SDD spec-compliance review; verifier subagent (S4); mattpocock `code-review` (Standards and Spec axes) | S4, S12, S13, S16 | R (method) + P (run-judge contract, scope-drift computation, veto metrics) |
| R24 | Metrics and replay: cost per PR, cycle time, human touches per PR, share of merged PRs through Daylight; replay past PRs to compare model/config on cost vs quality | `claude -p` JSON cost; OTel metrics; `/usage`; none for replay | S16, S18 | P (metrics script, replay harness) |
| R25 | Isolated execution with no production credentials | Git worktrees; `isolation: worktree`; deny rules and PreToolUse hooks (the sandbox does not cover Code Mode JS); Docker | S10, S17, S18 | C + P (credential deny-list hook; container guidance) |
| R26 | Observer agents PR the factory when an agent goes off the rails | Same path as the dream job | S6, S16, S17 | Covered by G15 |

### 3.7 Wiki recommendation (G14), from the survey in S19

Verdict: **replicate a minimal skill, pilot FSoft-AI4Code/CodeWiki first, and adopt TypeDoc for the API-facts layer.**

| Candidate | Local? | Incremental? | License | Verdict |
|-----------|--------|--------------|---------|---------|
| DeepWiki / Google Code Wiki | hosted | n/a / Google-only | proprietary | reject: third-party code exposure, public-repo limits |
| deepwiki-open, OpenDeepWiki | self-hosted servers | not shown | MIT | reject: heavy web apps, no CI step |
| FSoft-AI4Code/CodeWiki | local CLI | **yes** (`--update`, `--compare-to <commit>`) | MIT | pilot; best engine, but no ADR/spec links |
| natsu1211/deepwiki-skill | Claude skill | yes (`--update`, documented `claude -p` CI) | MIT | design reference; immature (47 stars) |
| mraza007/codewiki | Rust CLI + agent | yes (stale-page marking) | MIT | design reference; young |
| TypeDoc (+markdown plugin) | local, zero tokens | cheap regeneration | MIT/Apache | adopt for exported-symbol facts |
| Repomix | local | no | MIT | optional input packer |

None of the surveyed tools links modules to intent, spec or ADRs, which is the requirement that matters here, so some custom glue is needed whichever engine is used. Plan: keep a manifest of page → source paths → content hashes → last SHA; on merge, regenerate only stale pages; the model writes prose, TypeDoc supplies symbols; each page carries an `intent:` front-matter list that resolves to spec ACs and ADRs, and pages with no link are flagged "unexplained". Caveat: tool maturity and the claimed $0.34-vs-$21 update cost for CodeWiki were not verified (no repo was cloned or run).

## 4. Gaps

Only what needs custom plumbing. "Why nothing existing covers it" is specific to the sources read.

| ID | Gap (custom plumbing) | Why nothing existing covers it | Size/form | Reuses |
|----|-----------------------|--------------------------------|-----------|--------|
| G1 | **Plugin skeleton, `daylight.yaml` schema + loader + validator** | Plugins cannot ship settings, only prompted `userConfig` (S18); no listed plugin offers a typed, repo-versioned config for gates, models, effort, retries, thresholds, risk tiers, deploy, wiki, dream | JSON schema + small loader script | plugin format (S18) |
| G2 | **Audit logger**: hooks that append JSONL for Pre/PostToolUse (incl. REPL envelope + toolsUsed), SubagentStop, Stop, plus event writers for sensors/verdicts/gates | Hooks give raw events; nothing in the listed references records an append-only, schema'd, per-run log. Code Mode makes a REPL-aware logger necessary (S10) | hooks.json + 1 script + schema | Claude Code hooks |
| G3 | **HTML report renderer** (self-contained, from JSONL) | No listed source renders an audit report | 1 script, template | — |
| G4 | **Gate machinery**: gate state file, approve/edit/reject-with-feedback transitions, human vs agent approver switch, rubric-skill loader, touchpoint counter, rule that an agent approval is recorded as agent not human | S4/S6 describe the policy (human decides design; agent approval is not a human's) but no existing skill implements a configurable gate | 1 command + 1 skill + small script | Superpowers brainstorming (reject loop), subagents |
| G5 | **Evaluator contract**: rubric schema, Opus 5.5 evaluator agent, verdict JSON (pass/fail + cited feedback), retry counter, human escalation, evidence-citation rule | SDD review is prose and has no retry cap or escalation setting; S5/S6 describe 3-round caps but as team practice | 1 agent file, 1 skill, 1 script | SDD loop, requesting-code-review |
| G6 | **AC traceability**: AC-ID tag convention in tests; script that builds AC → test → status matrix from spec.md + test results; fails on unmapped AC | No listed tool maps spec acceptance criteria to tests | 1 script | test runners' JSON/JUnit output |
| G7 | **Sensor runner**: thresholds from `daylight.yaml`, fast and slow tiers, LLM-friendly output, **TypeScript adapter only** (tsc, ESLint, test runner, dependency-cruiser, Stryker, GitLeaks, Semgrep); unsupported language → stop | Fowler's sidecar CLI is the author's own tool and no installable equivalent was among the references; ub-mode's crapper/dryer/mutator are separate repos whose language support was not checked | 1 script + TS adapter config | tsc, ESLint, Semgrep, dependency-cruiser, Stryker, GitLeaks, ub-mode thresholds |
| G8 | **Brownfield ingest orchestration**: command that chains /init, domain-model scan, conventions scan → proposed sensor config, writes ingest report | Pieces exist (S13, S14, /init) but no sequence that ends in harness config | 1 command + 1 skill | /init, grill-with-docs, improve-codebase-architecture |
| G9 | **Code Mode detection** | Docs say the variable is user-level only; no documented query API. Detection by observing REPL tool presence in hook payloads/transcript, or reading the env var in a SessionStart hook, must be proven by spike | 1 hook function | hook payloads (S10) |
| G10 | **Per-phase token/time measurement + Code Mode on/off benchmark** | /goal shows tokens for a goal; claude -p reports usage; neither aggregates per harness phase | 1 script + benchmark protocol | claude -p JSON output |
| G11 | **PR assembly**: template embedding matrix, sensor table, /code-review and /security-review outputs, evaluator verdicts, touchpoints | pr skill (S13) defines PR body shape but not these sections | 1 template + 1 script | gh, mattpocock pr |
| G12 | **Deploy + smoke glue**: docker compose up, health wait, smoke-suite runner, deploy-guard PreToolUse hook | Pattern in S4/S5; no docker plugin among references | 1 script + 1 hook | docker compose, S4 hook pattern |
| G13 | **Monitor → task feedback**: compose health/regression poller that writes a new task (intent-style) into the queue | S4 Maintain pattern only | 1 script | S4 bands.yaml pattern **(summary)**, /schedule |
| G14 | **Wiki skill (minimal)**: manifest + stale-page regeneration on merge + TypeDoc facts + `intent:` why-links + "unexplained" report; pilot CodeWiki `--update` before building more | Surveyed tools (S19) are hosted, heavyweight, or lack ADR/spec links; CodeWiki has incremental updates but no why-trail | 1 skill + merge hook + small manifest script | TypeDoc; CodeWiki or natsu1211/mraza007 designs (MIT, attribute if copied) |
| G15 | **Dream pipeline**: log miner, consolidator proposing edits, scope allowlist, opens PR to the harness repo, never applies directly | /reflect, retro and S6 give the method; nothing mines our audit schema or opens a harness PR | 1 skill + 1 script | pstack /reflect, /correct; /schedule |
| G16 | **Orchestrator command** /daylight:run and the phase state file (resume, touchpoint count) | Superpowers/pstack chain skills by convention, but none persists phase state for a PRD→deploy run with headless fallback | 1 command + state script | Superpowers workflow order |
| G17 | **Reuse ledger + custom-code budget check** | Brief requirement, no existing tool | 1 script | — |
| G18 | **Triggers and triage**: work-item schema; sources (PRD file, `gh` issue, scheduled/alert task file); triage skill that classifies size, risk tier and spec-needed | mattpocock `triage` is an issue state machine tied to a tracker; nothing produces Daylight's work item or risk tier | 1 skill + schema + small script | `gh`, `/schedule`, mattpocock `triage` |
| G19 | **Risk tiers + run judge + scope check**: tier policy in config, whole-run judge contract, computational scope-drift check (changed files vs declared paths), veto/recovery metrics | S6/S16 describe tiers and judges as practice; SDD review has no scope computation or tiering | 1 agent + 1 skill + 1 script | SDD spec-compliance review, verifier subagent |
| G20 | **Metrics and replay**: cost per PR, cycle time, human touches per PR, share via Daylight; replay of past PRs under two configs | `claude -p` gives cost per call and OTel gives usage, but nothing aggregates per PR or replays PRs | 1 script + replay harness | `claude -p` JSON, OTel |

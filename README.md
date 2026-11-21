# Daylight: a lights-on software factory for Claude Code

Daylight is a Claude Code **plugin** that takes a PRD (or a GitHub issue, or a scheduled task) and delivers reviewed, tested, deployed code, with **at most two human decisions** (design approval and PR approval) and **zero** when you hand both gates to agent approvers. Every decision, prompt summary, model, token count, sensor result, verdict and gate decision is written to an append-only, hash-chained log and rendered as a single HTML report. Nothing happens in the dark.

It is deliberately thin. Existing capabilities do the heavy lifting (Claude Code subagents, hooks, skills, worktrees, `/code-review`, `/security-review`, headless `claude -p`, git, gh, docker compose, Superpowers guides). Daylight adds only plumbing: configuration, gates, a generator/evaluator loop, sensors, an audit log, a report, a wiki, deploy and a self-improvement loop. See [ARCHITECTURE.md](ARCHITECTURE.md) for how it is built and [docs/reuse-ledger.md](docs/reuse-ledger.md) for what each custom file reuses.

> **Status (honest):** the harness is built and unit-tested (see [Testing](#testing)). End-to-end demo runs on the two sample repos are documented in [docs/demos/README.md](docs/demos/README.md), including the failed attempts and why they failed. Read that file before relying on any claim here about end-to-end results.

## Contents
1. [How it works in one picture](#how-it-works-in-one-picture)
2. [Requirements](#requirements)
3. [Install](#install)
4. [Code Mode setup (optional)](#code-mode-setup-optional)
5. [Quick start: greenfield](#quick-start-greenfield)
6. [Quick start: brownfield](#quick-start-brownfield)
7. [Writing a PRD](#writing-a-prd)
8. [Configuration (`daylight.yaml`)](#configuration-daylightyaml)
9. [The gates and risk tiers](#the-gates-and-risk-tiers)
10. [CLI reference](#cli-reference)
11. [What gets written where](#what-gets-written-where)
12. [Reading the audit log and report](#reading-the-audit-log-and-report)
13. [Deploy and monitor](#deploy-and-monitor)
14. [Wiki](#wiki)
15. [Self-improvement (reflect and dream)](#self-improvement-reflect-and-dream)
16. [Safety model](#safety-model)
17. [Testing](#testing)
18. [Repository layout](#repository-layout)
19. [Limitations](#limitations)

## How it works in one picture

```mermaid
flowchart LR
  W[Work item: PRD, issue, task file] --> T[Triage: size, risk tier]
  T --> I{Existing code?}
  I -- yes --> ING[Ingest: conventions, starter wiki, proposed sensor config]
  I -- no --> D
  ING --> D[Design: intent, spec, architecture]
  D --> G1{{Gate 1: design approval}}
  G1 -- reject with feedback --> D
  G1 -- approve --> P[Plan: tasks linked to ACs]
  P --> L[Inner loop: generator Sonnet, evaluator Opus, in worktrees, TDD]
  L --> S[Sensors, traceability matrix, scope check, run judge]
  S --> R[/code-review and /security-review]
  R --> PR[Pull request with evidence]
  PR --> G2{{Gate 2: PR approval}}
  G2 -- reject --> FIX[Fix task with cited findings] --> S
  G2 -- approve --> M[Merge, wiki update]
  M --> DEP[Docker compose deploy and smoke tests]
  DEP --> MON[Monitor: regression becomes a new work item]
  MON -.-> T
  DEP --> RF[Reflect] --> DR[Dream: harness improvement PR]
```

Models: **Sonnet 5.5 generates, Opus 5.5 evaluates** (and authors the design and approves gates). Opus is used only where judgment decides a gate or a retry.

## Requirements
- **Node.js 24 or newer** (the plugin runs TypeScript directly with Node's type stripping; tested on 26).
- **Claude Code** with the `claude` CLI on your PATH and a logged-in account that can use `claude-sonnet-5-5` and `claude-opus-5-5`.
- **git**. For real PRs: the **GitHub CLI** (`gh`) logged in. For deploy: **Docker** with compose.
- Target repos should be **TypeScript** (v1 supports TypeScript only; other languages stop at ingest with "unsupported language").

## Install
```bash
git clone https://github.com/cwijayasundara/daylight-factory.git
cd daylight-factory/plugin && npm ci          # ajv, yaml, typescript (types only)
cd ..

# register the local marketplace and install the plugin (user or project scope)
claude plugin marketplace add "$(pwd)"
claude plugin install daylight@daylight-local --scope project

# put the CLI on your PATH (optional) and check your setup
export PATH="$(pwd)/plugin/bin:$PATH"
daylight doctor
```
Inside Claude Code you can then run `/daylight:run --help`. Without installing, run the CLI directly: `node plugin/src/cli.ts <command>` (same thing as `daylight <command>`).

The plugin registers hooks (audit logging on every tool call including `REPL` batches, a guard that denies credential reads, pushes to the default branch, foreign deploys and generator edits to rubrics/spec/config, and a degraded-evaluator notice) and agents (`generator`, `evaluator`, `judge`) pinned to their models.

## Code Mode setup (optional)
Code Mode lets Claude batch many tool calls into one JavaScript step in interactive sessions. It is a **user-level** setting (project settings ignore it) and is **not available** in `claude -p`, the Agent SDK, desktop or cloud sessions. Daylight never sets it. `daylight doctor` detects whether it is on and prints the exact line to add to `~/.claude/settings.json` if it is off. Every phase also works headless (see the phase table in ARCHITECTURE.md); Code Mode is only an optimisation for interactive phases. Whether it saves tokens or time is **not assumed**: see `docs/demos/code-mode-benchmark.md`.

## Quick start: greenfield
1. Create an empty repo (or use [daylight-greenfield-sample](https://github.com/cwijayasundara/daylight-greenfield-sample)) with a `prd.md` ([format](#writing-a-prd)) and a `daylight.yaml`:
```yaml
gates:
  design: { approver: agent }          # or human
  pr:     { approver: agent, human_after_agent: false }
deploy:
  target: local
  health_command: "curl -fsS http://localhost:8080/health"
  smoke_command: "npm run smoke"
sensors:
  required: [tests, secrets]
  commands: { tests: "npm test" }
```
2. Commit both on your base branch (config is always read from the **base branch**, never from the feature branch).
3. Run the whole factory with one command (headless, agent approvers):
```bash
DAYLIGHT_RUN=my-first-run daylight run prd.md --agents --summary-out summary.json
```
   or interactively inside Claude Code: `/daylight:run prd.md` and decide the gates yourself.
4. Open the evidence: `daylight report my-first-run` writes `.daylight/report-my-first-run.html`.

What the command does, in order: triage, ingest (skipped when the repo is empty), design (Opus writes intent/spec/architecture, lint must pass), Gate 1, plan (Sonnet), inner loop (tasks in parallel worktrees, each: failing tests first, implement, sensors, Opus evaluator, retries, escalation), integration into a run branch, sensors, traceability matrix, scope check, run judge, `/code-review` and `/security-review`, PR (GitHub when the repo has a remote, otherwise a local PR artefact), Gate 2 (with a reject-then-fix loop), merge, wiki update, deploy and smoke, reflect.

## Quick start: brownfield
Same command; the difference is the first phase. If the repo already has source, **ingest** runs before any design work:
```bash
cd my-existing-ts-repo
daylight ingest                 # conventions report, starter wiki, proposed daylight.yaml diff (nothing tracked is changed)
cat .daylight/ingest/conventions.md
cat .daylight/ingest/daylight.yaml.diff
daylight ingest --accept        # apply the proposed sensor config (or edit it first)
DAYLIGHT_RUN=feat1 daylight run prd.md --agents
```
Ingest detects language, test runner, linter, type checker, package manager, dependency layers and the conventions your README declares, each with file evidence, and proposes sensor commands and thresholds derived from your tooling (for example an ESLint `complexity` limit becomes `sensors.complexity_max`). The design author is told to read the conventions and wiki first. Try it on [daylight-brownfield-sample](https://github.com/cwijayasundara/daylight-brownfield-sample), a small TypeScript library whose deliberate convention is "functions never throw, they return `Result<T>`".

## Writing a PRD
A PRD is a markdown file. It **must** contain a `## Non-functional requirements` section with at least one bullet, otherwise the run is refused. Number the NFRs in order (NFR-1, NFR-2, ...); the architecture must map each to a mechanism. State behaviour, interfaces, deployment expectations (Dockerfile, compose file, smoke script) and anything sensitive (auth, payments, migrations raise the risk tier). See `prd.md` in either sample repo.

## Configuration (`daylight.yaml`)
Validated against `plugin/config/daylight.schema.json`; unknown keys, missing required keys and out-of-range values exit non-zero with the key path. Only `gates` and `deploy.target` are required; everything else has a default (`daylight config --resolved` prints the merged result).

| Key | Default | Meaning |
|---|---|---|
| `design_dir` | docs/design | where intent.md, spec.md, architecture.md live |
| `gates.design.approver` | human | `human` or `agent`; `rubric`, `human_required` |
| `gates.pr.approver` | agent | plus `human_after_agent` (default true), `human_required` |
| `models.*` | generator sonnet-5-5; evaluator, judge, design, dream, approver opus-5-5; evaluator_fallback sonnet-5-5 | model per role |
| `effort.*` | design high; generator small low, default medium, risky high; evaluator medium | effort per role/task size |
| `retries.task` / `retries.design` | 3 / 3 | caps; after the cap the item escalates to a human |
| `sensors.required` | [secrets] | tests, typecheck, lint, coverage, secrets, complexity, duplication, layers, advisories, or your own names |
| `sensors.commands` | {} | shell command per sensor name (exit status decides) |
| `sensors.coverage_min`, `complexity_max`, `duplication_max`, `output_line_cap`, `slow_timeout_s` (max 540) | 80, 10, 0.8, 20, 540 | thresholds |
| `sensors.layers`, `sensors.advisories` | [] | dependency-layer rules; offline vulnerable-version list |
| `deploy.target` | required (`local` or `test`) | the only deploy target the guard allows |
| `deploy.compose_file`, `health_command`, `health_timeout_s`, `smoke_command` | docker-compose.yml, none, 120, npm run smoke | |
| `wiki.enabled`, `wiki.dir` | true, docs/wiki | wiki on/off (off writes nothing and makes no model calls) |
| `dream.schedule`, `dream.allowlist` | 0 3 * * 0, skills/**, rubrics/**, CLAUDE.md, daylight.yaml | when dream runs; which files it may propose edits to |
| `tiers.use_defaults`, `tiers.rules` | true, [] | risk tier rules (path and keyword); operator rules override defaults |
| `credentials.deny_patterns`, `guard.protected_paths` | .env, .aws/, .ssh/, ...; daylight.yaml, rubrics, spec.md, sensors | deny lists |
| `context.budget_tokens` | 12000 | per-subagent passed-context budget (logged, flagged when exceeded) |
| `ledger.max_custom_lines` | 4000 | budget for custom plugin code |

## The gates and risk tiers
- **Gate 1 (design)** stops the run until a decision is recorded. `human` presents the three artefacts and records approve, edit or reject-with-feedback. `agent` runs the Opus approver with the `design-rubric` skill and records per-criterion scores. A reject loops back to design with the feedback and a revision counter. After `retries.design` rejections the gate escalates to a human regardless of the approver setting. Approval stores content hashes; editing an artefact afterwards **re-opens** the gate.
- **Gate 2 (PR)** is keyed to the PR **head SHA**; a new commit invalidates the approval. Merge and deploy refuse without an approval for the exact head. The agent reviews first; `human_after_agent` and `human_required` add a human decision. An agent approval never counts as a human decision when `human_required: true`.
- **Risk tiers** are computed from the real diff (path and keyword rules in `daylight.yaml` on the base branch, plus shipped defaults that mark authentication, authorization, secrets, migrations, payments, CI workflows and deploy files high). **low**: an agent-only gate is allowed. **medium**: follows your config. **high**: a human decision is required even if an agent approved first. A **degraded** verdict (see below) can never satisfy a high-tier gate or be the only approval.
- **Human touchpoints** = human gate decisions + escalations, computed from the log (`daylight touchpoints`).

## CLI reference
Run `daylight <command>` from the target repo. Common ones:

| Command | What it does |
|---|---|
| `run <work-item> [--agents] [--base b] [--summary-out f]` | the whole factory, headless |
| `doctor [--json]` | Code Mode on/off/unknown, setup instructions; logs an event |
| `config [--resolved] [--file f]` | validate / print merged config |
| `workitem <prd|issue-url|task>`, `triage <item> [--paths a,b] [--base ref]` | normalise and classify |
| `ingest [--auto|--accept]` | brownfield ingest |
| `prd check <prd>`, `design lint [--prd f]`, `design stamp` | design artefact checks |
| `gate request|present|decide|agent|verify|satisfied|context <design|pr> ...`, `inner-start` | gate machine |
| `plan check --spec s --plan p`, `inner run --plan p`, `worktree add <id>` | planning and the generator/evaluator loop |
| `tdd check`, `red --task t --cmd c` | TDD enforcement and red proof |
| `sensors run [--slow --name n]`, `sensors wait` | fast and background sensors |
| `trace --spec s` | AC to test to result matrix |
| `scope check`, `judge --spec s`, `verdict normalize` | scope drift, run judge, verdict contract |
| `review capture --kind code-review|security-review`, `review classify f` | review artefacts; blocking vs advisory |
| `pr create|update|merge|body` | PR assembly and merge (`--local` when there is no remote) |
| `deploy --head sha`, `monitor`, `trigger run` | deploy, regression poller, scheduled intake |
| `wiki build|update|links|current` | code wiki |
| `audit verify|validate|emit|reconstruct`, `report <run>`, `touchpoints` | audit log and report |
| `reflect --run r`, `dream run|schedule install`, `replay`, `definition diff a b` | self-improvement |
| `benchmark compare`, `ledger [--check]` | Code Mode benchmark; reuse ledger |

Set `DAYLIGHT_RUN=<id>` to name a run (it names the audit file). `DAYLIGHT_CLAUDE` and `DAYLIGHT_GH` override the binaries (used by tests).

## What gets written where
```text
docs/design/{intent,spec,architecture}.md   the design (committed on the run branch)
docs/wiki/                                   overview + one page per module (+ .manifest.json)
daylight.yaml                                the factory definition (read from the base branch)
.daylight/                                   runtime state (git-ignored)
  audit/<run>.jsonl                          append-only, hash-chained event log (+ .head anchor)
  state.json                                 gates, revisions, approvals (file state, not session state)
  plan.json  trace.json  pr-body.md          plan, traceability matrix, PR body
  reviews/{code-review,security-review}.txt  raw review outputs
  worktrees/<task>/                          one git worktree per task, branch daylight/<task>
  escalations/<task>.md                      human-readable escalation records
  ingest/  lessons/  inbox/  work/  sensors/ ingest report, reflection lessons, task inbox, work items, background sensor status
  report-<run>.html                          the audit report
```

## Reading the audit log and report
Every event has `id, parent_id, ts, run, phase, actor, model, kind, sha_prev`. REPL batches are recorded with their full code, stdout, stderr and result, and any inner calls link back via `parent_id`. `daylight audit verify <file>` exits non-zero if any earlier line was edited or lines were removed. Secrets matching the scan patterns are redacted before write. `daylight report <run>` produces one self-contained HTML file (no network references) with factory metrics (cost per PR, cycle time, human touches, Daylight-trailer share, veto and recovery rates), a per-phase table (wall-clock, tokens per model, retries, sensors, verdicts, gates, touchpoints) and a timeline where each REPL batch expands to its code and inner calls.

## Deploy and monitor
`daylight deploy --head <sha>` refuses unless Gate 2 approved that exact commit, runs `docker compose up -d --build`, waits for `health_command` (on timeout it fails and collects logs to `.daylight/deploy-logs.txt`), then runs the smoke command; a smoke failure fails the phase. A PreToolUse guard blocks any other deploy target (kubectl, terraform apply, remote docker hosts, other compose files, image pushes). `daylight monitor` (run it on a schedule) turns a failing health or smoke check into a task file in `.daylight/inbox/` that re-enters triage and the same generator/evaluator, sensor and gate rules.

## Wiki
`daylight wiki update` regenerates only the pages whose inputs changed (manifest of page, sources, hashes, commit). Each module page has Files, Exports and a **Why** section linking the spec ACs and ADRs it implements (from `// intent: AC-3, ADR-002` comments and test names); modules with no why-trail are listed as unexplained in the overview. `wiki links` fails on any broken link; `wiki update --summarize` adds Sonnet summaries. A merge updates the wiki automatically.

## Self-improvement (reflect and dream)
After a run, `daylight reflect --run <id>` writes lessons grouped as failure, retry, reviewer finding, human correction and improvement signal, each citing event ids. `daylight dream run --repo <harness repo> --base <branch>` (headless, Opus) consolidates lessons into proposed edits **only to allow-listed files**, drops incomplete or out-of-allowlist proposals (logged), and delivers the rest as a **branch plus PR to the harness repo**, each proposal with evidence, expected effect and a revert note. Nothing is applied silently and the installed plugin is never modified. `daylight dream schedule install` writes the cron line (pass `--crontab` to install it into your crontab). See PR #1 in this repo for a real one generated from run data.

## Safety model
- Gates, thresholds, rubrics and deny-lists are read from the **base branch**; the generator cannot edit rubrics, `daylight.yaml`, `spec.md` or sensor config (hook denial, logged).
- A failing computational sensor can never be overridden by a model pass. An uncited evaluator fail is "inconclusive" and cannot block.
- Credential paths (`.env*`, `~/.aws`, `~/.ssh` ...) are denied to agents; production credential env vars are scrubbed from task environments.
- Pushes to `main`/`master` are blocked; deploys to anything but the configured local/test target are blocked.
- The sandbox does not cover Code Mode JavaScript, so every guard is a PreToolUse hook or a permission rule, never sandbox-dependent.
- If Opus is unavailable the evaluator falls back to `models.evaluator_fallback` **loudly**: a `degraded_evaluator` event, `degraded` verdicts, a PR-body and report warning, and a notice on your next prompt; a human decision is then required.

## Testing
```bash
cd plugin && node --test tests/                 # unit and fixture tests (stubs for claude/gh/docker)
node src/cli.ts trace --spec ../docs/design/spec.md --cmd "node --test --test-reporter=tap tests/"   # AC -> test -> result matrix
node src/cli.ts ledger --check                  # reuse headers + custom-line budget
claude plugin validate plugin                   # manifest check
```
Every acceptance criterion in [docs/design/spec.md](docs/design/spec.md) has a test whose name carries its id (AC-1 ... AC-112); the matrix is in [docs/traceability.md](docs/traceability.md). One test (AC-87) runs each headless phase through the real `claude -p` with Code Mode removed and needs a logged-in Claude Code. The end-to-end evidence tests (AC-92, 93, 95) read `docs/demos/*.json` and are green only when the demos completed.

## Repository layout
```text
plugin/                  the Claude Code plugin (manifest, hooks, agents, skills, commands, src, tests)
  .claude-plugin/plugin.json   hooks/hooks.json   agents/   skills/   commands/run.md
  src/                   TypeScript plumbing, one concern per file (see ARCHITECTURE.md)
  config/                JSON schema, defaults, phase table (headless vs Code Mode capable)
  tests/                 node:test suites, AC id in every test name
.claude-plugin/marketplace.json   local marketplace entry
docs/design/             intent.md, spec.md, architecture.md, build-plan.md (the approved design)
docs/adr/ADR-019-*.md    deviations made during the build
docs/demos/              demo evidence, audit logs, reports, benchmark, dream PR body
docs/spikes.md           Increment 0 findings
```

## Limitations
- TypeScript targets only; Docker compose deploy only.
- The sample demos used agent approvers on private sample repos; the pipeline's review-fix loop is new and its results are in docs/demos/README.md.
- Reviewer output is free text, so blocking findings (those with file, line and a reproducing command) are classified by `review classify` from JSON; the pipeline currently hands the whole review text to the Gate 2 agent.
- Code Mode savings are unproven; the benchmark refuses to claim any without data.
- The wiki generator is deterministic plus optional summaries; a CodeWiki pilot (ADR-014) was not run.

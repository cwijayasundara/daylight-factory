# Spec: Daylight (Lights-On Factory harness)

Behaviour of the harness itself. Each acceptance criterion is observable and testable by a script, a fixture project, or an inspection of the audit log. Terms: *run* = one PRD → deployment execution; *task* = unit of inner-loop work; *gate* = approval point (Gate 1 design, Gate 2 PR); *touchpoint* = a human decision recorded at a gate or escalation.

Test levels: **unit** (script/schema, no model), **fixture** (small fixture repo, stub or Haiku 5.5 model), **e2e** (real models, two sample projects). Increment-level mapping is in build-plan.md; each AC gets a test file and name when its increment starts (AC id in the test name).

Out of scope: building the sample apps' features beyond what the PRDs require; managed Claude Code Review (Team/Enterprise only, not available on the personal Pro plan); non-Docker deploy targets; non-TypeScript sensors.

## Foundation: plugin, config, setup

- **AC-1** The repo contains `.claude-plugin/plugin.json` that passes `claude plugin validate` (or the schema check from the Increment-0 spike) and declares only skills, agents, hooks and commands that exist on disk.
- **AC-2** Installing the plugin into an empty git repo with `/plugin install` from a local path succeeds and `/daylight:run --help` is listed.
- **AC-3** `daylight.yaml` is validated against a JSON schema; an unknown key, a missing required key or an out-of-range value (e.g. retry cap < 1) exits non-zero with the key path in the message.
- **AC-4** A `daylight.yaml` with only gates and deploy target set loads with documented defaults for every other key, and `daylight config --resolved` prints the merged result.
- **AC-5** Config covers every item in the brief: gate approvers (human/agent + rubric), models per role, effort per phase, retry caps, sensor thresholds, deploy target, wiki on/off, dream schedule. A test asserts each key exists in the schema.
- **AC-6** No file in the plugin sets `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE` (a grep test over the plugin tree and any settings it ships returns zero matches).
- **AC-7** `daylight doctor` reports Code Mode as on, off or unknown, and prints the user-level setup instruction when off. The result is written as an event.
- **AC-8** Every custom script has a header naming what it reuses; `daylight ledger --check` fails if a script lacks one or if custom lines exceed the budget set in `daylight.yaml`.

## Audit trail

- **AC-9** Every tool call by the main session emits a PreToolUse and a PostToolUse JSONL event containing run id, timestamp, tool name, model, and a size-capped input/output summary.
- **AC-10** Every `REPL` call emits events containing the full JavaScript (`tool_input.code`) and the `stdout`, `stderr`, `result` and `toolsUsed` fields from `tool_response`; none are dropped when the code errors or is stopped.
- **AC-11** Calls made inside a REPL batch that also fire their own hooks are linked to the parent REPL event (`parent_id`), so no call is logged twice as top-level.
- **AC-12** Subagent start/stop events record agent role, model, effort, and token counts.
- **AC-13** The log is append-only: a test that truncates or edits an earlier line is detected by a hash-chain check (`daylight audit verify` exits non-zero).
- **AC-14** Every sensor result, evaluator verdict and gate decision is written as an event with its own schema, and schema validation of the whole log passes for a full run.
- **AC-15** Secrets matching the secret-scan patterns are redacted from event payloads before write.
- **AC-16** `daylight report <run>` produces one HTML file with no external network references (a test greps for http(s):// resource loads) that opens offline.
- **AC-17** The report shows, per phase: wall-clock time, input/output tokens per model, retries, sensor outcomes, verdicts, gate decisions, human touchpoint count.
- **AC-18** The report renders a timeline in which a REPL batch expands to its code and inner tool calls.

## Outer loop and Gate 1

- **AC-19** `/daylight:run <prd>` accepts a PRD file containing a non-functional requirements section and refuses with a clear message if the NFR section is missing.
- **AC-20** The outer loop writes `intent.md`, `spec.md` and `architecture.md` under the configured design directory.
- **AC-21** `intent.md` contains why and measurable success criteria; a lint check fails if either section is empty.
- **AC-22** Every acceptance criterion in the produced `spec.md` has a unique AC-n id and an observable pass condition; the lint check rejects an AC without a verifiable verb/condition pattern or with a duplicate id.
- **AC-23** The produced `architecture.md` contains at least one ADR with status, context, decision, consequences, and a table mapping each PRD NFR to the mechanism that meets it; lint fails if any NFR is unmapped.
- **AC-24** Gate 1 stops the run until a decision is recorded; no inner-loop phase starts while Gate 1 is pending (verified by attempting to start the inner loop).
- **AC-25** With `gates.design.approver: human` the harness presents the three artefacts and records approve, edit or reject-with-feedback with decision source = human.
- **AC-26** With `gates.design.approver: agent` the approver runs on the configured model with the configured rubric skill and records decision source = agent plus the rubric score per criterion.
- **AC-27** Reject-with-feedback re-enters the outer loop with the feedback text in context and increments a revision counter; the revised artefacts carry the revision number.
- **AC-28** After the design retry cap, Gate 1 escalates to a human regardless of approver setting.
- **AC-29** An approved gate stores content hashes of the three artefacts; changing an artefact afterwards invalidates the approval and re-opens the gate.

## Brownfield ingest

- **AC-30** On a repo with existing source files and no prior harness state, `/daylight:run` runs ingest before planning; on an empty repo it skips ingest and says so.
- **AC-31** Ingest produces a conventions report listing the detected language, test runner, linter, type checker, package manager and dependency layers, with file evidence for each.
- **AC-32** Ingest produces a starter wiki (overview and one page per top-level module) before any design work begins.
- **AC-33** Ingest proposes sensor commands and thresholds derived from detected tooling and writes them as a diff to `daylight.yaml`, not applied until accepted.
- **AC-34** Ingest makes no changes to tracked source files (verified by a clean `git status` on tracked files).
- **AC-35** If the repo's primary language is not TypeScript, ingest reports "unsupported language" and stops without proposing sensor config.

## Inner loop: tasks, TDD, generator/evaluator

- **AC-36** The approved design is decomposed into tasks, each linked to one or more AC ids; an AC with no task fails the plan check.
- **AC-37** Each task executes in a git worktree on a feature branch; the main working tree is untouched.
- **AC-38** For each task, failing tests tagged with their AC ids are committed before implementation; the evaluator rejects a task whose first commit contains implementation but no failing test.
- **AC-39** The red step is proven: the run records a failing test result for each new test before the green step.
- **AC-40** The generator runs as `claude-sonnet-5-5` and the evaluator as `claude-opus-5-5`, as shown in the audit log (model field), unless overridden in `daylight.yaml`.
- **AC-41** The evaluator returns JSON with `verdict: pass|fail`, per-rubric-criterion result, and for every fail a cited file:line or test name; a fail without a citation is treated as inconclusive and cannot block.
- **AC-42** On fail, feedback goes to a fresh generator context containing only the task, the diff, and the cited feedback (token count of passed context is logged).
- **AC-43** Retries are capped at `retries.task`; the next attempt after the cap does not run, and the task is escalated.
- **AC-44** Escalation writes a human-readable escalation record, pauses only that task, and lets independent tasks continue.
- **AC-45** Tasks with no dependency edge between them run as parallel subagents; the audit log shows overlapping time windows.
- **AC-46** Effort per task follows the configured policy (small → low/medium, large or risky → high); the chosen effort is logged.
- **AC-47** The generator cannot modify the rubric, sensor config or `spec.md` during a task: a PreToolUse hook denies such edits and logs the denial.
- **AC-48** Guide rules for TDD, SOLID and SRP are present as skill text and CLAUDE.md rules in the plugin; a test asserts the rules file names each principle.

## Sensors and traceability

- **AC-49** Fast computational sensors (tests, type check, lint, complexity limits, secret scan) run after a task completes without the model invoking them; results are logged.
- **AC-50** Sensor thresholds come only from `daylight.yaml`; changing a threshold there changes pass/fail for a fixture project.
- **AC-51** A failing sensor returns a message with file, rule and a suggested correction, capped in length (verified against a fixture with 200 violations: output ≤ configured line cap).
- **AC-52** Coverage below threshold fails the sensor; at or above passes.
- **AC-53** Complexity and duplication limits (CRAP/cyclomatic and similarity) fail a fixture function over the threshold.
- **AC-54** Dependency-layer violations (per configured dependency-cruiser rules) and known-vulnerable dependencies fail the sensor.
- **AC-55** Slow sensors (mutation testing, full suite) run as background or separate steps and never as a single wait over 9 minutes; a fixture suite taking longer is not killed by the 10-minute Code Mode limit.
- **AC-56** A computational sensor failure cannot be overridden by an inferential pass: the task verdict is fail if any required computational sensor fails.
- **AC-57** The traceability script outputs a matrix AC → test names → last result; an AC with no test or a failing test makes the check fail.
- **AC-58** The evaluator is given the matrix and judges only whether each mapped test actually asserts the AC; it cannot mark an unmapped AC as covered.
- **AC-59** `/code-review` and `/security-review` run on the branch diff before Gate 2 and their raw outputs are stored as artefacts.
- **AC-60** A reviewer finding blocks only if it carries a reproducible citation (file, line, and a failing command or test); other findings are reported as advisory.
- **AC-61** Sensor and gate configuration is read from the base branch, not the feature branch (a feature-branch edit to thresholds does not take effect).

## PR and Gate 2

- **AC-62** The harness opens a PR from the worktree branch whose body contains the traceability matrix, sensor table, evaluator verdicts, and /code-review and /security-review results.
- **AC-63** PR creation fails with a clear message if any section is missing.
- **AC-64** Gate 2 with `approver: agent` reviews first and records an agent decision; with `human_after_agent: true` a human decision is additionally required before merge.
- **AC-65** An agent approval is never counted as a human touchpoint satisfaction when `human_required: true`.
- **AC-66** The harness never pushes to the default branch or merges without a recorded Gate 2 approval whose commit SHA equals the PR head.
- **AC-67** A new commit after Gate 2 approval invalidates the approval.
- **AC-68** Human touchpoint count for a run is computed from gate events and equals 0 when both gates use agents and no escalation occurred, and ≤ 2 otherwise unless escalation events add more (each counted).

## Deploy and monitor

- **AC-69** `daylight deploy` runs `docker compose up` for the configured target and waits for health up to a configured timeout; on timeout it fails and collects logs.
- **AC-70** After deploy, the smoke suite runs against the running services and the result is logged; a smoke failure fails the deploy phase.
- **AC-71** A PreToolUse deploy guard blocks deploys to any target other than the configured local/test target and logs the block.
- **AC-72** Deploy refuses to run unless Gate 2 approval exists for the head commit.
- **AC-73** A health/regression poller turns a threshold breach or smoke failure into a new task file referencing the originating run and failing evidence.
- **AC-74** The new task re-enters the inner loop and is subject to the same generator/evaluator, sensor and gate rules.

## Wiki

- **AC-75** With `wiki.enabled: true` a merge triggers an incremental wiki update touching only pages of changed modules plus the overview if architecture changed.
- **AC-76** The wiki has an architecture overview, one page per module, and each module page has a "Why" section linking to the intent criteria, spec ACs and ADRs it implements.
- **AC-77** Every wiki link to a repo file or design artefact resolves (link-check passes).
- **AC-78** With `wiki.enabled: false` no wiki files are written and no wiki model calls appear in the log.
- **AC-79** The wiki is current: after a merge fixture, the wiki commit SHA recorded equals the merge SHA.

## Reflection and dream

- **AC-80** After each run, reflection reads the audit log and writes lessons grouped by failure, retry, reviewer finding and human correction, each citing event ids.
- **AC-81** The dream job consolidates lessons across runs and proposes edits only to files on a configured allowlist (skills, rubrics, CLAUDE.md rules, thresholds in `daylight.yaml`).
- **AC-82** Proposals are delivered as a PR to the harness repo, never written to the plugin on disk; a test confirms the working tree of the installed plugin is unchanged after a dream run.
- **AC-83** Every proposal states the evidence (event ids), the expected effect, and how to revert.
- **AC-84** A proposal touching a path outside the allowlist is dropped and logged.
- **AC-85** The dream schedule from `daylight.yaml` is installed as a scheduled job and the job runs without Code Mode (headless).

## Efficiency and Code Mode

- **AC-86** The report states tokens and wall-clock per phase and per model for every run.
- **AC-87** Every phase in the architecture is tagged "Code Mode capable" or "headless" in a machine-readable table, and a test runs each headless phase through `claude -p` with Code Mode disabled and gets a pass.
- **AC-88** The benchmark script runs the same fixture task with Code Mode on and off and writes a comparison of tokens, tool round trips and wall-clock time; no claim of savings is made unless the data show it.
- **AC-89** Passed-context size per subagent is logged and a fixture task stays under the configured context budget.
- **AC-90** A REPL-heavy fixture (multi-file read plus sensor run in one batch) is fully reconstructable from the audit log.
- **AC-91** Safety of sensors and gates does not depend on the sandbox: the gate and deploy-guard tests pass with sandboxing disabled.

## End-to-end validation

- **AC-92** Greenfield: one command takes a small PRD to design artefacts, a reviewed PR, a docker deployment, and passing smoke tests.
- **AC-93** Brownfield: the same flow on the repo-fixture (a small TypeScript repo created for this purpose in the validation increment, with existing source, tests, lint config, commit history and one deliberate convention), beginning with ingest, with no repo-specific code in the plugin (a grep test finds no repository names in plugin sources).
- **AC-94** Every AC in this spec has a traceability row with a passing test, and the matrix is attached to the final report.
- **AC-95** Both demos report human touchpoints, tokens and time per phase; a run with both gates as agent approvers reports 0 touchpoints.
- **AC-96** At least one harness-improvement PR is opened by the dream job from real run data.
- **AC-97** The reuse ledger lists every custom script with what it reuses and the total custom line count.

## Triggers, triage and risk tiers

- **AC-98** `/daylight:run` accepts a work item from a PRD file, a GitHub issue (via `gh`) or a scheduled/alert task file, and normalises it into a work item with id, source, and linked evidence.
- **AC-99** Triage classifies each work item by size, risk tier (low, medium, high) and spec-needed (yes/no), and records the rationale as an event.
- **AC-100** Risk tiers are defined in `daylight.yaml` as path and keyword rules, and the plugin ships default rules that classify authentication, authorization, secrets, data-store/migration, payment/billing, CI workflow and deploy paths as high; with no tier config a fixture change to each such path is high, and operator rules extend or override the defaults only through `daylight.yaml` on the base branch.
- **AC-101** The tier sets the Gate 2 policy: low allows an agent-only gate, medium follows the configured policy, high requires a human decision even if an agent approved first (fixture test per tier).
- **AC-102** A scheduled trigger creates work items with no human present and the triage step runs headless.
- **AC-103** A work item triage marks out of scope for Daylight is routed to a human and logged, and is not attempted.
- **AC-104** A PreToolUse deny rule blocks agents from reading credential paths and env files matching configured patterns (e.g. `.env`, cloud credential directories) and logs each denial; no production credentials are present in the worktree environment.

## Run judge, scope and metrics

- **AC-105** After the inner loop and before the PR, a whole-run judge (Opus 5.5) grades build and test status, spec match, scope adherence and custom checks, and returns verdict JSON with citations.
- **AC-106** A computational scope check lists files changed outside each task's declared paths; any such file fails the check without a model call.
- **AC-107** The audit log records each judge veto and whether the task later passed (recovery), and the report shows veto rate and recovery rate.
- **AC-108** The report shows cost per PR (USD), cycle time (trigger to merge), human touches per PR, and the share of merged PRs that carried a Daylight trailer in the reporting window.
- **AC-109** `daylight replay` re-runs the specs of N past merged PRs under two configurations (model/effort) on fixtures and reports cost vs quality (sensor pass, judge verdict) side by side.
- **AC-110** The Daylight definition (`daylight.yaml`, rubrics, deny-lists, skills) is versioned in a repo, and `daylight definition diff <ref> <ref>` lists changes between two refs.
- **AC-111** A retry-cap escalation or judge veto is recorded as an improvement signal that the reflection step reads.
- **AC-112** If the evaluator model is unavailable (e.g. a usage limit), the run falls back to the configured fallback model (default Sonnet 5.5), records a `degraded_evaluator` event, marks every affected verdict `degraded` in the log, PR body and report, and shows a warning at the next prompt; a degraded verdict can never satisfy a high-tier gate or be the only approval, so a human decision is required in that case.

## Non-functional criteria summary

Efficiency and Code Mode, auditability, safety (generator cannot edit its own judges, gates read from the base branch, deploy guard, credential deny-list) and reuse (ledger AC) are covered by their groups above.

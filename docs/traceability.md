| AC | Tests | Result |
|---|---|---|
| AC-1 | AC-1 plugin.json passes claude plugin validate and declared parts exist | PASS |
| AC-2 | AC-2 local install into an empty git repo lists /daylight:run | PASS |
| AC-3 | AC-3 unknown key exits non-zero and names the key path; AC-3 missing required key exits non-zero and names the key; AC-3 out-of-range value (retries.task < 1) names /retries/task | PASS |
| AC-4 | AC-4 minimal config loads and --resolved prints merged defaults | PASS |
| AC-5 | AC-5 schema covers every brief item | PASS |
| AC-6 | AC-6 no plugin file mentions the Code Mode variable literally | PASS |
| AC-7 | AC-7 doctor reports on when Code Mode var is 1; AC-7 doctor reports off and prints the user-level setup instruction; AC-7 doctor reports unknown for an unrecognised value; AC-7 doctor writes the result as an audit event | PASS |
| AC-8 | AC-8 ledger --check fails when a script lacks a Reuses header; AC-8 ledger --check fails when custom lines exceed the budget; AC-8 ledger --check passes with headers and budget; prints a table; AC-8 the real plugin passes its own ledger check | PASS |
| AC-9 | AC-9 Pre and Post events carry run, ts, tool, model and capped summary | PASS |
| AC-10 | AC-10 REPL events hold the full code and stdout, stderr, result, toolsUsed; AC-10 a failed or stopped REPL is still recorded | PASS |
| AC-11 | AC-11 inner calls during an open REPL batch link to the parent event | PASS |
| AC-12 | AC-12 subagent events record role, model, effort and token counts | PASS |
| AC-13 | AC-13 audit verify detects edits and removal of earlier lines | PASS |
| AC-14 | AC-14 sensor, verdict and gate events validate; malformed ones fail | PASS |
| AC-15 | AC-15 secrets are redacted before write | PASS |
| AC-16 | AC-16 one self-contained HTML file with no external network references | PASS |
| AC-17 | AC-17 / AC-86 per phase: wall-clock, tokens per model, retries, sensors, verdicts, gates, touchpoints | PASS |
| AC-18 | AC-18 a REPL batch expands to its code and inner tool calls (escaped) | PASS |
| AC-19 | AC-19 a PRD without a Non-functional requirements section is refused | PASS |
| AC-20 | AC-20 lint requires intent.md, spec.md and architecture.md in the design dir | PASS |
| AC-21 | AC-21 intent lint fails on empty why or success criteria | PASS |
| AC-22 | AC-22 spec lint rejects duplicate AC ids and ACs with no verifiable condition | PASS |
| AC-23 | AC-23 architecture lint needs an ADR with four parts and every NFR mapped | PASS |
| AC-24 | AC-24 the inner loop cannot start while Gate 1 is pending | PASS |
| AC-25 | AC-25 human gate presents the artefacts and records source=human | PASS |
| AC-26 | AC-26 agent gate runs on the configured model with the rubric and records per-criterion scores; AC-26 an approver reply with prose around the JSON is still parsed | PASS |
| AC-27 | AC-27 reject-with-feedback loops back: revision increments and feedback is in context | PASS |
| AC-28 | AC-28 after the design retry cap the gate escalates to a human regardless of approver | PASS |
| AC-29 | AC-29 editing an artefact after approval invalidates it and re-opens the gate | PASS |
| AC-30 | AC-30 ingest runs before planning on an existing repo and is skipped on an empty one | PASS |
| AC-31 | AC-31 conventions report lists language, runner, linter, type checker, package manager, layers with evidence | PASS |
| AC-32 | AC-32 ingest produces a starter wiki (overview + a page per module) | PASS |
| AC-33 | AC-33 ingest proposes sensor config as a diff and does not apply it until accepted | PASS |
| AC-34 | AC-34 ingest changes no tracked source files | PASS |
| AC-35 | AC-35 a non-TypeScript repo stops with unsupported language and proposes nothing | PASS |
| AC-36 | AC-36 an AC with no task fails the plan check | PASS |
| AC-37 | AC-37 each task runs in its own worktree branch; the main tree is untouched | PASS |
| AC-38 | AC-38 evaluator rejects a first commit with implementation but no failing test; AC tags required | PASS |
| AC-39 | AC-39 the red step is proven by a recorded failing test run before green; AC-39 a generator whose tests already pass can declare a logged TDD waiver; a failing run cannot be waived | PASS |
| AC-40 | AC-40 generator is Sonnet 5.5 and evaluator Opus 5.5 by default, overridable in daylight.yaml | PASS |
| AC-41 | AC-41 verdict JSON: a fail needs a citation, otherwise it is inconclusive and cannot block | PASS |
| AC-42 | AC-42 a fix task carries review findings into the generator first prompt; AC-42 / AC-43 retry gets a fresh minimal context with cited feedback; cap stops the next attempt | PASS |
| AC-43 | AC-42 / AC-43 retry gets a fresh minimal context with cited feedback; cap stops the next attempt | PASS |
| AC-44 | AC-44 escalation writes a record, pauses only that task, independent tasks continue | PASS |
| AC-45 | AC-45 independent tasks run in parallel (overlapping windows in the log) | PASS |
| AC-46 | AC-46 effort follows the policy and is logged | PASS |
| AC-47 | AC-47 the generator cannot edit rubric, sensor config or spec; denial is logged; AC-47 shell writes to protected files are denied for the generator (python, sed, redirects), reads are allowed | PASS |
| AC-48 | AC-48 TDD, SOLID and SRP guides exist as rules and as skill text | PASS |
| AC-49 | AC-49 fast sensors run by script without the model and results are logged | PASS |
| AC-50 | AC-50 thresholds come from daylight.yaml and change pass/fail | PASS |
| AC-51 | AC-51 a failing sensor prints file, rule and a suggestion, capped at the line cap | PASS |
| AC-52 | AC-52 coverage below threshold fails, at or above passes | PASS |
| AC-53 | AC-53 complexity and duplication limits fail a fixture function | PASS |
| AC-54 | AC-54 dependency-layer violations and known-vulnerable dependencies fail | PASS |
| AC-55 | AC-55 slow sensors run in the background and are never one long wait | PASS |
| AC-56 | AC-56 a computational failure is final: the evaluator is skipped and cannot override it | PASS |
| AC-57 | AC-57 traceability matrix: AC -> tests -> result; unmapped or failing ACs fail the check; AC-57 the matrix also reads spec-style runner output (npm test default reporter) | PASS |
| AC-58 | AC-58 the evaluator cannot mark an unmapped AC as covered | PASS |
| AC-59 | AC-59 /code-review and /security-review raw outputs are stored as artefacts | PASS |
| AC-60 | gate2: advisory findings (no file+line+repro) never block (AC-60); AC-60 the PR body classifies review findings: blocking only with file, line and a reproducing command; AC-60 only reproducibly-cited findings block; others are advisory | PASS |
| AC-61 | AC-61 sensor config is read from the base branch, not the feature branch | PASS |
| AC-62 | AC-62 the PR body carries matrix, sensor table, verdicts and both review outputs; AC-62 the PR body carries run history: failed checks and fix rounds are disclosed automatically | PASS |
| AC-63 | AC-63 PR creation fails clearly when a section is missing | PASS |
| AC-64 | AC-64 agent reviews first; human_after_agent additionally requires a human decision | PASS |
| AC-65 | AC-65 an agent approval never satisfies human_required | PASS |
| AC-66 | AC-66 no push to the default branch and no merge without an approval for the PR head; AC-66 a merge whose local base cannot fast-forward fails loudly instead of leaving a stale tree | PASS |
| AC-67 | AC-67 a new commit after Gate 2 approval invalidates the approval | PASS |
| AC-68 | AC-68 touchpoints are computed from gate events (0 with agent gates, escalations each counted) | PASS |
| AC-69 | AC-69 deploy runs docker compose up and waits for health; on timeout it fails and collects logs | PASS |
| AC-70 | AC-70 smoke suite runs after deploy and a smoke failure fails the deploy phase | PASS |
| AC-71 | AC-71 the deploy guard blocks foreign targets and logs the block | PASS |
| AC-72 | AC-72 deploy refuses without a Gate 2 approval for the head commit | PASS |
| AC-73 | AC-73 / AC-74 a failing health check becomes a new task that re-enters triage | PASS |
| AC-74 | AC-73 / AC-74 a failing health check becomes a new task that re-enters triage | PASS |
| AC-75 | AC-75 / AC-79 a merge updates only affected pages, and the recorded SHA equals the merge SHA | PASS |
| AC-76 | AC-76 wiki has an overview and one page per module, each with a Why section linking AC/ADR | PASS |
| AC-77 | AC-77 every wiki link to a repo file or design artefact resolves | PASS |
| AC-78 | AC-78 with wiki.enabled false no wiki files are written and no wiki model calls are logged | PASS |
| AC-79 | AC-75 / AC-79 a merge updates only affected pages, and the recorded SHA equals the merge SHA | PASS |
| AC-80 | AC-80 / AC-111 reflection groups lessons by category citing event ids and reads improvement signals | PASS |
| AC-81 | AC-81 / AC-84 proposals touch only allowlisted paths; others are dropped and logged | PASS |
| AC-82 | AC-82 proposals arrive as a PR; the installed plugin and the main working tree are unchanged | PASS |
| AC-83 | AC-83 every proposal states evidence, expected effect and how to revert; incomplete ones are dropped | PASS |
| AC-84 | AC-81 / AC-84 proposals touch only allowlisted paths; others are dropped and logged | PASS |
| AC-85 | AC-85 the dream schedule is installable and the job runs headless without Code Mode | PASS |
| AC-86 | AC-86 the report states tokens and wall-clock per phase and per model; AC-17 / AC-86 per phase: wall-clock, tokens per model, retries, sensors, verdicts, gates, touchpoints; AC-86 phase wall-clock sums the segments of a phase that ran in several rounds, not first-start to last-end | PASS |
| AC-87 | AC-87 phases are tagged and every headless phase passes through claude -p without Code Mode | PASS |
| AC-88 | AC-88 benchmark compares Code Mode on/off and claims savings only when the data show it; AC-88 the extractor anchors on the last start marker so earlier mentions do not widen the window; AC-88 an arm with no data yields no comparison and no savings claim | PASS |
| AC-89 | AC-89 passed-context size is logged per subagent and stays under the configured budget | PASS |
| AC-90 | AC-90 a REPL-heavy batch is fully reconstructable from the audit log | PASS |
| AC-91 | AC-91 gate and deploy-guard decisions do not depend on the sandbox | PASS |
| AC-92 | AC-92 stubbed pipeline: PRD to design, plan, parallel tasks, PR, Gate 2, merge, deploy and smoke with 0 human touchpoints; AC-92 greenfield: one command took a PRD to design artefacts, a reviewed PR, a deployment and passing smoke tests | PASS |
| AC-93 | AC-93 brownfield: the same flow on the repo-fixture starts with ingest; no repository names in plugin sources | PASS |
| AC-94 | AC-94 every AC in spec.md has a test whose name carries its id (the matrix is run and attached by daylight trace) | PASS |
| AC-95 | AC-95 both demos report touchpoints, tokens and time per phase; both-agent-gates run reports 0 | PASS |
| AC-96 | AC-96 the dream job opened a harness-improvement PR from real run data | PASS |
| AC-97 | AC-97 the reuse ledger lists every custom script with what it reuses and the total custom line count | PASS |
| AC-98 | AC-98 a PRD file normalises into a work item with id, source, evidence; AC-98 a GitHub issue URL is read via gh and normalised; AC-98 a scheduled/alert task file is normalised as source task | PASS |
| AC-99 | AC-99 triage returns size, tier, spec_needed and records the rationale as an event | PASS |
| AC-100 | AC-100 default rules classify each sensitive path as high with no tier config; AC-100 operator rules in daylight.yaml extend and override the defaults; AC-100 tier rules come from the base branch, not the feature branch | PASS |
| AC-101 | AC-101 tier sets the Gate 2 policy | PASS |
| AC-102 | AC-102 a scheduled trigger creates work items and triages them headless | PASS |
| AC-103 | AC-103 an out-of-scope item is routed to a human, logged, and not attempted | PASS |
| AC-104 | AC-104 the guard denies credential paths, logs each denial, and scrubs prod env | PASS |
| AC-105 | AC-105 the run judge (Opus) vetoes only with a citation | PASS |
| AC-106 | AC-106 scope check lists files changed outside declared task paths with no model call; AC-106 scope is measured from where the task branched, not from main (design commits on the run branch are not drift); AC-106 a TDD task may always add its own tests; a tdd:false task may not; source outside paths is still flagged | PASS |
| AC-107 | AC-107 vetoes and later recovery are recorded as events | PASS |
| AC-108 | AC-108 report shows cost per PR, cycle time, touches, trailer share, veto and recovery rate | PASS |
| AC-109 | AC-109 replay re-runs fixture specs under two configs and reports cost vs quality side by side | PASS |
| AC-110 | AC-110 definition diff lists changes to the Daylight definition between two refs | PASS |
| AC-111 | AC-80 / AC-111 reflection groups lessons by category citing event ids and reads improvement signals | PASS |
| AC-112 | AC-112 an unavailable evaluator falls back loudly: degraded event, degraded verdicts, PR warning, prompt notice, no sole approval | PASS |


# Goal: Build "Lights-On Factory", a behavioral harness plugin for Claude Code

## Problem
Today I micromanage a single coding agent. I want a harness that takes a PRD and
delivers reviewed, tested, deployed code. Humans should step in at **no more than 2
review gates** (design approval and PR approval), and each gate can be handed to an
agent approver. It must be a **lights-on factory**: every decision, artifact and
review is visible and auditable by humans. It must not be a dark factory.

## Non-negotiable constraints
1. **Reuse, don't reinvent.** Compose existing Claude Code features: subagents, skills,
   hooks, plugins, worktrees, `/code-review`, `/security-review`, headless mode. Also
   compose existing plugins: Superpowers, pstack/poteto-mode, mattpocock/skills,
   ub-mode. Write only the minimum plumbing (glue, config, hooks, scripts). Before
   building any component, check whether something existing already does it, and
   justify every line of custom code.
2. **Ship as a local Claude Code plugin** (`.claude-plugin/plugin.json`, skills,
   agents, hooks, commands) that installs into any repo.
3. **Works for greenfield and brownfield.** For brownfield, the first step is to
   ingest the existing codebase (wiki plus a conventions scan) before planning.
4. **Generator/evaluator (GAN-style) on every task.** A generator agent
   (`claude-sonnet-5-5`) produces the work. A stronger evaluator agent
   (`claude-opus-5-5`) grades it against an explicit rubric and returns
   pass/fail with feedback. Cap retries at N (configurable) and escalate to a
   human on repeated failure.
5. **Token and latency efficiency is a first-class requirement.** pstack/poteto-mode
   gives reliable results but defaults to Opus at max effort and is slow. Build a
   tuned variant: Sonnet for generation, Opus only for evaluation and hard
   decisions, effort levels chosen per task, parallel subagents for independent
   tasks, and minimal context passed to each agent. Measure and report tokens and
   wall-clock time per phase.

## Code Mode
I run Claude Code with Code Mode on: `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1`
(ref: https://code.claude.com/docs/en/code-mode). Claude writes JavaScript that
batches several tool calls into one step instead of calling Bash/Read/Edit one at a time.
- Design for it: let interactive phases (outer-loop authoring, inner-loop
  implementation) batch tool calls, e.g. sensor runs and multi-file reads, to cut
  round trips.
- It is NOT available in `-p`/headless, the Agent SDK, Desktop or cloud sessions.
  Every phase that runs unattended (dream jobs, CI reviews, scheduled runs) must
  work without Code Mode. Mark each phase in the architecture as "Code Mode
  capable" or "headless".
- Project settings ignore this variable. The plugin must not try to set it.
  Document it as a user-level setup step and detect at runtime whether it is on.
- Audit trail: tool calls are batched inside REPL code, so capture them with
  PreToolUse/PostToolUse hooks matching `REPL` (record the code and its output),
  in addition to the per-tool hooks. Otherwise the lights-on log has gaps.
- Waited code stops after 10 minutes. Long sensor suites (full test runs,
  mutation testing) must run as background code or as separate steps.
- The sandbox does not cover Code Mode's JavaScript or the file, web and MCP calls
  it makes. Sensors and gates must not rely on the sandbox for safety in this mode.
- Measure token and time differences with Code Mode on and off, and report them.
  Don't assume it saves tokens.

## The SDLC it implements (per the AI-Native SDLC Playbook)

### Outer loop: Plan and Design (base: Superpowers)
- Input: a PRD including NFRs.
- Output: `intent.md` (why and success criteria), `spec.md` (behavior and
  acceptance criteria, written so they can be tested), `architecture.md`
  (components, decisions as ADRs, how each NFR is met).
- **Gate 1, design approval:** a human, or an approver agent with a rubric skill.
  Which one is set in config. The approver can edit, reject with feedback (loops
  back), or approve.

### Inner loop: Code and Test (base: customized pstack/poteto-mode)
- Turn `spec.md` acceptance criteria into failing tests first, then implement with
  strict TDD (red → green → refactor), SOLID and SRP. These are the harness's
  **guides**, encoded as skills and CLAUDE.md rules.
- **Sensors** (per Fowler) run automatically through hooks and CI. *Computational:*
  tests, coverage thresholds, mutation testing where cheap, type checks, lint,
  complexity and duplication limits, dependency and secret scans. *Inferential:*
  `/code-review`, `/security-review`, and an evaluator check that every acceptance
  criterion in `spec.md` maps to a passing test (traceability matrix).
- Work happens in a git worktree on a feature branch. The harness opens a PR whose
  description includes the traceability matrix, sensor results and evaluator
  verdicts.
- **Gate 2, PR approval:** a human or an agent, set in config. The agent reviews
  first and the human reviews only if configured.

### Deploy and Maintain
- Deploy to local Docker (docker compose) or a configured test environment, then
  run smoke tests against it.
- Monitoring hooks feed failures and regressions back into the inner loop as new
  tasks.

## Lights-on visibility
- **Code wiki** (DeepWiki-style), generated and updated incrementally on every
  merge: architecture overview, module pages, a "why" trail linking each module
  back to intent/spec/ADRs.
- **Audit trail:** an append-only event log (JSONL) of every agent action, prompt
  summary, model used, tokens, sensor result, evaluator verdict and gate decision,
  rendered as a single self-contained HTML report per run.

## Self-improvement (RSI / "dreaming")
- After each run, a reflection step mines the audit log for failures, retries,
  reviewer findings and human corrections.
- A periodic "dream" job consolidates the lessons into proposed updates to skills,
  rubrics, CLAUDE.md rules and sensor thresholds.
- **Proposals go through a gate and are never applied silently.** They appear as a
  PR to the harness itself, so improvements stay auditable and can be reverted.

## Configuration (single file, e.g. `factory.yaml`)
Gate approvers (human/agent + rubric), models per role, effort per phase, retry
caps, sensor thresholds, deploy target, wiki on/off, dream schedule.

## How to proceed
1. **Research first.** Read every reference below. Produce `docs/research.md`
   mapping each requirement to the existing capability that covers it, and listing
   the gaps that genuinely need custom plumbing.
2. **Design.** Write `intent.md`, `spec.md`, `architecture.md` for the harness
   itself. **Stop and ask me to review.** Do not build until I approve.
3. **Build incrementally:** plugin skeleton → outer loop → inner loop + sensors →
   PR/review → audit log + HTML report → wiki → deploy → reflection/dream. Each
   increment gets its own tests and a working demo.
4. **Validate end to end** on two sample projects: a greenfield one from a small
   PRD, and a brownfield one using my repo
   https://github.com/cwijayasundara/always_on_agents_v1.0. Report the number of
   human touchpoints, tokens and time per phase.

## Done when
- One command takes a PRD to a reviewed PR to a Docker deployment, with ≤2 human
  touchpoints (0 when both gates use agent approvers).
- Every acceptance criterion traces to a passing test, and every PR carries
  `/code-review` and `/security-review` results.
- The HTML audit report and code wiki exist and are current after every run.
- The dream loop has produced at least one harness-improvement PR from real run
  data.
- Custom code is limited to plumbing, with a list of what each piece is reused from.

## References
- Harness engineering: https://martinfowler.com/articles/harness-engineering.html
- Sensors: https://martinfowler.com/articles/sensors-for-coding-agents.html
- Software factories: https://addyosmani.com/blog/software-factories/
- AI-native SDLC: https://claude.com/resources/articles/the-ai-native-sdlc-playbook
- Verification: https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/
- Code review at Anthropic: https://claude.dev/blog/solving-code-review-at-anthropic/
- Claude Code docs: https://code.claude.com/docs/en/overview ·
  /code-review: https://code.claude.com/docs/en/code-review ·
  security: https://code.claude.com/docs/en/security-guidance ·
  Code Mode: https://code.claude.com/docs/en/code-mode ·
  /goal: https://code.claude.com/docs/en/goal
- Plugins: https://github.com/obra/superpowers · https://github.com/mattpocock/skills ·
  https://github.com/cursor/plugins/tree/main/pstack · https://github.com/unclebob/ub-mode

# Intent: Daylight (Lights-On Factory)

## Why

Today a human micromanages one coding agent through every step. The aim is a harness that takes a PRD (with non-functional requirements) and delivers reviewed, tested, deployed code, with humans deciding at no more than two points: design approval (Gate 1) and PR approval (Gate 2). Either gate can be delegated to an agent approver.

The harness must be a **lit** factory, not a dark one. Addy Osmani's distinction (https://addyosmani.com/blog/software-factories/): a dark factory ships code no human has read and accrues *comprehension debt*. In a lit factory every decision, artefact and review is visible, and judgment sits at the gates. The harness therefore treats visibility as a product feature (audit log, HTML report, code wiki), not a by-product.

The harness must be **cheap to build and cheap to run**: compose existing Claude Code features and plugins (Superpowers, pstack/poteto-mode, mattpocock/skills, ub-mode, /code-review, /security-review) and write only plumbing. It must also be fast and frugal: Sonnet 5.5 generates, Opus 5.5 judges.

## Success criteria

Each is measurable; the ACs in spec.md carry the detail.

1. **One command, ≤ 2 touchpoints.** `/daylight:run <prd>` goes PRD → design artefacts → reviewed PR → Docker deployment with smoke tests. Human touchpoints ≤ 2 (0 when both gates use agent approvers and nothing escalates). (AC-19–AC-29, AC-61–AC-67, AC-68–AC-73, AC-91–AC-96)
2. **Everything traces.** Every acceptance criterion maps to a passing test; every PR carries /code-review and /security-review results. (AC-48–AC-60, AC-61–AC-67)
3. **Nothing is hidden.** Every agent action, including those batched inside Code Mode REPL calls, is in an append-only log; one self-contained HTML report and a current code wiki exist after every run. (AC-9–AC-18, AC-74–AC-78)
4. **Quality by construction.** Strict TDD, computational sensors decide pass/fail, evaluator feedback must cite evidence, generator can't edit its own judges. (AC-35–AC-47, AC-48–AC-60)
5. **Efficient and measured.** Tokens and wall-clock per phase are reported; Code Mode on vs off is measured, not assumed. (AC-85–AC-90)
6. **Works on both field types.** Greenfield from a small PRD; brownfield beginning with ingest, tested on a small TypeScript repo created for the purpose (the repo-fixture), with no repo-specific code. (AC-30–AC-34, AC-91–AC-96)
7. **Self-improving, safely.** Dream job produces at least one harness-improvement PR from real run data; nothing applies silently. (AC-79–AC-84)
8. **Minimal custom code.** Every custom piece is listed with what it reuses. (AC-8)

8b. **Work enters from many places and is routed by risk.** Triggers (PRD, GitHub issue, schedule, alert) go through triage; risk tier sets how much human review a change needs; a whole-run judge checks scope and spec. (AC-98–AC-104, AC-105–AC-112)
9. **Measured as a factory.** Cost per PR, cycle time, human touches per PR and share of merged PRs through Daylight are reported, and past PRs can be replayed to compare configurations. (AC-108–AC-109)

## Users and stakeholders

- **Operator** (the repo owner): writes the PRD, sets `daylight.yaml`, approves gates when configured as human, reviews the report and wiki.
- **Agent approver**: stands in at a gate under a rubric; never counts as a human approval when policy requires one.
- **Harness maintainer**: reviews dream-job PRs.

## Non-goals

- Replacing human product judgment about *what* to build.
- A dark mode: there is no setting that disables the audit log.
- Managed Claude Code Review integration as a dependency (Team/Enterprise only, never approves or blocks: https://code.claude.com/docs/en/code-review); it may be added optionally.
- Supporting deploy targets beyond local Docker / a configured test environment in v1.
- Setting Code Mode: the plugin only detects it and documents the user-level step.

## Scope decisions (operator, revision 2)

TypeScript projects only in v1; personal Claude Pro plan (no managed Code Review); Docker available; reuse by install, replicate with MIT attribution where needed. Factory framing beyond the brief comes from the Stanford course email and diagram (S16, S17).

## Principles carried from the research

- *Verification, not generation, is the constraint* (S3). Spend the Opus budget on judging.
- *Computational sensors decide; inferential reviewers advise unless they can cite a reproducible failure* (S1, S6).
- *Keep the verification layer out of reach of the change it judges* (S5, S8): gate and sensor config are read from the base branch.
- *Agent approval is not human approval* (S6).
- *Reuse before write*; every custom line is justified in the ledger.

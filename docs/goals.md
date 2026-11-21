# /goal prompts for Lights-On Factory

Run these in an interactive terminal session (not `claude -p`), so Code Mode is
available. Turn on auto mode so the turns don't stop for permission prompts.

Set Code Mode once, at user level (project settings ignore it):

```bash
export CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1
```

## Goal 1: research and design (run first)

```text
/goal Read docs/factory-brief.md in full. It is the complete spec for "Lights-On Factory", a behavioral-harness Claude Code plugin. Do ONLY the research and design phase. Write no plugin code.

Done when all of these exist AND your final message shows evidence for each:
1. docs/research.md maps every requirement in the brief to an existing capability (Claude Code feature, Superpowers, pstack/poteto-mode, mattpocock/skills, ub-mode, /code-review, /security-review), citing the source URL. It ends with a "Gaps" table that lists only what needs custom plumbing and why nothing existing covers it.
2. docs/design/intent.md, spec.md and architecture.md exist for the harness itself. spec.md has numbered, testable acceptance criteria (AC-1, AC-2, …). architecture.md has ADRs, a component diagram, model and effort per role, and marks each phase "Code Mode capable" or "headless".
3. docs/design/build-plan.md lists ordered increments, each with its ACs and a demo.
4. Your final message contains: each file with its line count, the full Gaps table, the AC count, and open questions for me.

Constraints: read every reference URL in the brief before writing research.md. Reuse over custom code. Write only under docs/. Do not commit. Then stop for my review. If a blocker makes this unachievable, say so and why. Stop after 30 turns.
```

## Goal 2: build (run after you approve the design)

```text
/goal Implement the approved design in docs/design/ as a local Claude Code plugin under plugin/, following build-plan.md in order. Stay within docs/factory-brief.md's constraints: reuse first, plumbing only, Sonnet 5.5 generates, Opus 5.5 evaluates.

Done when your final message shows ALL of:
1. Traceability matrix: every AC in spec.md → its test file::name → PASS, followed by the pasted output of the full test command showing exit code 0.
2. Greenfield demo: one command took a sample PRD to the design artifacts, then a reviewed PR with /code-review and /security-review results, then a running Docker deployment with smoke tests passing. Paste the command and the key output.
3. Brownfield demo: the same flow on a clone of https://github.com/cwijayasundara/always_on_agents_v1.0, starting with codebase ingestion.
4. For each demo: number of human touchpoints (≤2, and 0 with agent approvers), plus tokens and wall-clock time per phase, with Code Mode on vs off where applicable.
5. Paths to the generated HTML audit report and code wiki. Proof that the REPL hooks captured Code Mode batches.
6. At least one harness-improvement PR opened by the dream loop from real run data.
7. A table of custom code vs what each piece reuses.

Constraints: strict TDD (failing test first). One commit per increment, on branch factory/build. Never push to main. PRs go only to the sample repos or branches. Any deviation from the design gets a new ADR. If an increment fails 3 times, stop and report. Stop after 80 turns.
```

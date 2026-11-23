---
name: brainstorm
description: Phase 0 interactive discovery. Brainstorm a new feature or greenfield app with the user and produce a validated, factory-ready prd.md (passing `daylight prd check`).
---
Turn a rough idea, conversation, or reference docs into a crisp, factory-ready `prd.md` that passes Daylight triage on the first try.

## Workflow
1. **Inspect existing context first** (do not ask the user what the repo already tells you):
   - If brownfield: read `daylight.yaml`, `README.md`, `docs/wiki/` (if present), and `.daylight/ingest/conventions.md` (if present).
   - If the user passed a file/folder in `docs/` (notes, PDF, sample data), read it first.
2. **Run focused interactive discovery (2–3 short rounds, max 4–5 questions per round):**
   - **Round 1 — Scope:** Problem being solved, target users, core goals, explicit non-goals (v1).
   - **Round 2 — Behaviour & Contracts:** Inputs/outputs, key business rules, edge cases, error handling, and how it is invoked (CLI, HTTP API, worker, Docker).
   - **Round 3 — Stack & NFRs:** Language/stack (TypeScript, Python 3.14, Rust), safety/security/PII constraints, reliability/idempotency, observability, and test-speed/deploy expectations.
   - Skip any round already fully answered by the user's prompt or reference docs.
3. **Draft the PRD** to `prd.md` (or the path requested by the user, e.g. `docs/prd/<slug>.md`) with these sections:
   - `# PRD: <Title>`
   - `## Overview`
   - `## Goals and non-goals`
   - `## Input / Output contracts`
   - `## Functional requirements` (numbered, concrete, testable)
   - `## Non-functional requirements` (numbered `NFR-1`, `NFR-2`, ... bullets covering reliability, safety/security, observability, maintainability, testability, deployability)
   - `## Open questions` (if any remain)
4. **Validate deterministically:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" prd check <prd-path>
   ```
   Fix any errors until it prints `ok`.
5. **Handoff:**
   - Summarize the drafted PRD and ask the user to review/approve or request edits.
   - Once approved, offer to commit the baseline (`git add -A && git commit -m "Add PRD"`) and run either `/daylight:run <prd-path>` (2 human gates) or `/daylight:goal <prd-path> --agents` (0-gate supervised run).

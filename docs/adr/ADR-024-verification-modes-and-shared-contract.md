# ADR-024: Verification modes per AC, one shared task contract, failure triage, narrow evaluator

**Status** accepted (deviates from AC-38/AC-39 wording and the original evaluator rubric; see docs/analysis/deep-dive-2-fable-5-2.md)

**Context** Five brownfield runs (bh8-bh12) had 30 failed task attempts and none failed on code quality: every one was a disagreement about the task contract. Delivery tasks (Dockerfile, compose, smoke script) were proven only after merge, while being forced through unit-TDD rules and an evaluator that cannot run anything. The contract existed in five copies that disagreed; waivers from discarded attempts were replayed to the evaluator; failures the generator could not fix were retried five times.

**Decision**
- Each spec AC carries a mode: [test] (AC-named automated test), [run] (proven by building and starting the container) or [sensor:x]. Untagged ACs are [test]. Design lint checks the tag; trace accepts delivery evidence for [run] and a green sensor for [sensor]; otherwise NO EVIDENCE (never a silent pass).
- A task has a mode: tdd (any [test] AC), run (only [run]/[sensor] ACs, at least one [run]) or none. A run task is verified by executing the delivery (verifyDelivery: compose up --build, health, smoke, always down) inside the attempt loop; no LLM evaluator and no red step. Plan lint: all [run] ACs in one task, last, with no [test] ACs mixed in.
- One contract (contract.ts): a task may edit its own paths plus those of every task in its dependency closure; test files are always allowed. Used by the scope check, the scope check at the end, the generator prompt and the evaluator prompt.
- Waivers and red proofs count only after the last reset; the evaluator sees a waiver only from the current attempt.
- Failures are classified generator | plan | harness. A citation only in files the task cannot edit, three identical consecutive citation sets, an empty attempt, a timeout or an unusable verdict stop retries at once with the class and reason in the escalation. One escalation fails the run fast.
- The evaluator prompt is built in code with the rubric inline (ac-met, no-defects, conventions), the AC text and what the harness already established; scope and TDD are not its job.
- Planner: one behaviour task (or a linear chain of at most three above about 15 [test] ACs) plus one delivery task last. The prose heuristics in plan lint (architecture-named files, AC-names-file) are deleted; cumulative ownership and AC modes replace them.

**Consequences** Delivery failures become ordinary feedback loops on a real docker error instead of an argument; plan defects stop in one attempt. Still open: commit-order TDD, the reset and the waiver flow are kept for [test] tasks (a red-at-base check should replace them), and the corpus is partial because the run clones were deleted before it could be captured.

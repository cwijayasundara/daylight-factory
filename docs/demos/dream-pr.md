# Dream: proposed harness improvements

Proposals are never applied silently; this PR is the gate. Revert with the notes below.

## CLAUDE.md

## Evaluator verdicts must cite evidence
A `fail` verdict must cite at least one `file:line` or a named failing test. A `fail` with an empty citation can't be acted on: the implementer has nothing to fix, so the retry is wasted. If the evaluator can't point to a location, it must say which acceptance criterion is unmet and which command it ran, with that command's output. The orchestrator rejects any `fail` verdict that has no citation and asks the evaluator for a new one. That re-request does not count against the task's retry cap.


Evidence: e86, e88, e269, e270
Expected effect: No more empty-citation fail verdicts (e86, e269 had none). Every retry gets an actionable target, which should cut the number of attempts per task and stop retry_cap escalations caused by vague feedback.
Revert: Delete the 'Evaluator verdicts must cite evidence' section from CLAUDE.md.

## CLAUDE.md

## Retries must address every prior citation
Before attempt N+1, the implementer lists every `file:line` and test the attempt-N verdict cited and says how each one is fixed. It then runs the cited tests locally and confirms they pass before handing back to the evaluator. If a retry gets a fail at a new location in a file that was already cited (for example `scripts/smoke.ts` cited on attempts 2 and 3), the implementer re-reads the whole file before the next attempt instead of patching single lines.


Evidence: e194, e196, e223, e225, e294, e296, e318, e320, e355, e356
Expected effect: Stops piecemeal fixes where each retry exposes a new failing line in the same file (t2 perf.test.ts lines 29-33 then 7; t4 smoke.ts lines 8/12/21/29 then 32/18). Expect fewer t2/t4-style tasks to reach retry_cap.
Revert: Delete the 'Retries must address every prior citation' section from CLAUDE.md.

## CLAUDE.md

## Perf tests and smoke scripts: known failure patterns
- Perf tests (`tests/perf/**`): don't assert on absolute wall-clock times that depend on the machine. Use generous bounds or relative comparisons, warm up before measuring, and keep setup out of the timed region. The test must be deterministic across 3 consecutive local runs before hand-off.
- Smoke scripts (`scripts/smoke.ts`): the script must exit non-zero when the service is down, when it returns a non-2xx status, or when a request times out. Wrap every request in a timeout, catch connection errors and turn them into `process.exit(1)`, and never swallow errors in a `catch` that falls through to exit 0. Cover both the service-down and service-failing paths in `tests/smoke.test.ts` before hand-off. The `package.json` script entry must call the same script file the tests exercise.


Evidence: e194, e223, e269, e270, e294, e318, e355, e356
Expected effect: Prevents the specific failures that escalated t2 (perf test flakiness/assertions) and t4 (smoke script not exiting non-zero on failure or down service, package.json wiring), so similar tasks pass within 1-2 attempts.
Revert: Delete the 'Perf tests and smoke scripts: known failure patterns' section from CLAUDE.md.

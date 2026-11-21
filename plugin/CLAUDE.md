# Daylight plugin rules
Follow `rules/guides.md` for every implementation task: TDD (red, green, refactor), SOLID, SRP. Never edit rubrics, `daylight.yaml`, `spec.md` or sensor config from a task. Prefer reusing existing plugins and tools over writing new code.

## Evaluator verdicts must cite evidence
A `fail` verdict must cite at least one `file:line` or a named failing test. A `fail` with an empty citation can't be acted on: the implementer has nothing to fix, so the retry is wasted. If the evaluator can't point to a location, it must say which acceptance criterion is unmet and which command it ran, with that command's output. The orchestrator rejects any `fail` verdict that has no citation and asks the evaluator for a new one. That re-request does not count against the task's retry cap.

## Retries must address every prior citation
Before attempt N+1, the implementer lists every `file:line` and test the attempt-N verdict cited and says how each one is fixed. It then runs the cited tests locally and confirms they pass before handing back to the evaluator. If a retry gets a fail at a new location in a file that was already cited (for example `scripts/smoke.ts` cited on attempts 2 and 3), the implementer re-reads the whole file before the next attempt instead of patching single lines.

## Perf tests and smoke scripts: known failure patterns
- Perf tests (`tests/perf/**`): don't assert on absolute wall-clock times that depend on the machine. Use generous bounds or relative comparisons, warm up before measuring, and keep setup out of the timed region. The test must be deterministic across 3 consecutive local runs before hand-off.
- Smoke scripts (`scripts/smoke.ts`): the script must exit non-zero when the service is down, when it returns a non-2xx status, or when a request times out. Wrap every request in a timeout, catch connection errors and turn them into `process.exit(1)`, and never swallow errors in a `catch` that falls through to exit 0. Cover both the service-down and service-failing paths in `tests/smoke.test.ts` before hand-off. The `package.json` script entry must call the same script file the tests exercise.

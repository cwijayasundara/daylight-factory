# ADR-023: Preflight, plan lint, generator context, concurrency and the small-change fast path

**Status** accepted

**Context** Live brownfield runs failed late and expensively: red baselines blamed on generators, occupied ports and missing Docker found at deploy, plans whose tasks collided or touched protected files, generators guessing AC text and sensor limits, serial judge and reviews, and a full Opus design gate plus planner for trivial work.

**Decision**
- `preflight` (src/preflight.ts) runs before design on a fresh run: baseline sensors green (brownfield only; a greenfield repo has nothing to measure), Docker reachable, compose host ports free, base not behind its remote, and the base does not already contain this feature (a squash-merged "Daylight: <title>" commit, the gh4 failure: generators found the behaviour already present and failed TDD).
- `lintPlan` (src/planlint.ts, `daylight plan lint`) runs inside the planner retry loop: dependencies exist and are acyclic, no protected paths, independent tasks have disjoint paths, and ACs about coverage, complexity, duplication, layering or advisories need the matching required sensor (a test cannot show them).
- `generatorContext` (src/context.ts) puts the task's AC text, sensor limits and repository conventions in the first generator prompt.
- The judge and both reviews run concurrently.
- Fast path (`fast_path`, default true): triage size small and tier low skips the Opus design approver (lint still gates) and replaces the planner with a one-task plan.

**Consequences** Failures that were environmental or plan-shaped now stop in seconds with a precise message. Tests: preflight, planlint, fastpath, pipeline. Open: preflight does not check that the container from a previous run is the one holding a port.

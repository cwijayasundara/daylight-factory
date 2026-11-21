# ADR-022: Deterministic Gate 2

**Status** accepted

**Context** Gate 2 was an Opus approver reading the PR body and diff stat. Across the brownfield runs it behaved as a non-deterministic third reviewer: it rejected on things the sensors, matrix and reviewers had already cleared, and each rejection spawned a fix task.

**Decision** `gate2(evidence)` (plugin/src/gate2.ts) is a pure function. It approves when the traceability matrix is non-empty and all PASS, sensors are green, scope is clean, the run judge verdict is pass (inconclusive or missing rejects), both reviews are present, and no finding is blocking (AC-60: file, line and repro). Only the high tier additionally consults the Opus approver. A rejection with blocking findings becomes a fix task fed only those findings; a rejection without blocking findings stops the run with the reasons, since a generator cannot fix missing evidence.

**Consequences** Low and medium tier PRs cost no approver call and cannot be rejected on taste. Table tests in tests/gate2.test.ts pin the rules. Not yet done: rebuilding only the PR body for body-only defects on the high-tier path.

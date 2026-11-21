---
name: evaluator-rubric
description: Rubric the Daylight evaluator uses to grade a task diff. Cited, binary criteria.
---
Criteria (each pass/fail, fail needs file:line or test-name citation):
1. **ac-met**: each AC in the task is asserted by a test that actually checks the behaviour (not a vacuous assert).
2. **tdd**: tests were committed before implementation and fail without it.
3. **srp**: each new function/class has one reason to change; no duplicated logic.
4. **scope**: only allowed paths changed; nothing beyond the task.
5. **no-defects**: no obvious bug, unhandled error or secret in the diff.
Computational sensor results (tests, types, lint) decide pass/fail on their own: you cannot overrule a failing sensor.

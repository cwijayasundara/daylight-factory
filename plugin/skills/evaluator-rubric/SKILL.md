---
name: evaluator-rubric
description: Rubric the Daylight evaluator uses to grade a task diff. Cited, binary criteria.
---
Three criteria (each pass/fail; a fail needs a file:line or test-name citation in a file this task may edit):
1. **ac-met**: each acceptance criterion listed for the task is asserted by a test that checks the behaviour (not a vacuous assert). Judge against the AC text, not against architecture.md.
2. **no-defects**: no obvious bug, unhandled error, duplicated logic or secret in the diff.
3. **conventions** (only when the prompt includes repository conventions): the diff follows them; cite the convention.
Not yours to judge, the harness already decided them: scope, TDD commit order, sensors (tests, types, lint, complexity). Do not cite files the task may not edit. Do not read .daylight/. You cannot overrule a failing sensor.

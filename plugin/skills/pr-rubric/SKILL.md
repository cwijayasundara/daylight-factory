---
name: pr-rubric
description: Rubric for the Gate 2 approver agent reviewing a Daylight PR.
---
Score 1-5 each; approve only if all >= 4: **traceable** (matrix complete, every AC PASS), **verified** (all sensors pass; /code-review and /security-review present; the PR body's "Review findings" section lists **no blocking finding** - blocking means file, line and a reproducing command or test; advisory findings do not block but must be visible in the body, and you should mention the most serious in your feedback), **scoped** (diff stays in declared task paths), **honest** (no degraded verdict presented as full approval; earlier failed or inconclusive verdicts are visible). Return ONLY JSON {"decision":"approve|reject","scores":{...},"feedback":"..."}.

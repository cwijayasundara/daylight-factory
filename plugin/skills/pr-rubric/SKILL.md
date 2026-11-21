---
name: pr-rubric
description: Rubric for the Gate 2 approver agent reviewing a Daylight PR.
---
Score 1-5 each; approve only if all >= 4: **traceable** (matrix complete, every AC PASS), **verified** (sensors pass, /code-review and /security-review present with no unaddressed blocking finding), **scoped** (diff stays in declared task paths), **honest** (no degraded verdict presented as full approval). Return ONLY JSON {"decision":"approve|reject","scores":{...},"feedback":"..."}.

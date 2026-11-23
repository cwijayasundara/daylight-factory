---
description: Scaffold Daylight in the current target repository (copies factory artefacts to .daylight/factory, creates daylight.yaml and starter prd.md, or runs ingest on brownfield repos).
argument-hint: "[--stack ts|python|rust] [--gates 0|2]"
---
Run the Daylight initializer in the current working directory using Bash:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" init $ARGUMENTS
```

Report what was created and print the `next` step from the JSON output.

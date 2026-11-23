---
description: Toggle daylight vibe mode — keep the factory guides, guards and sensors enforcing on every edit in this session, even outside /daylight:run.
argument-hint: "[on|off|status] [--sensors secrets,complexity,duplication]"
---
Run the mode toggle in the current working directory using Bash:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli.ts" mode ${ARGUMENTS:-status}
```

Report the resulting JSON state. When mode is `on`, remind the user that the Stop hook now runs the fast sensors on every session stop and the daylight guides are injected into every prompt.

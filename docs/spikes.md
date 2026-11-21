# Increment 0 spikes (resolved 2026-11-21)

| # | Question | Finding | Evidence |
|---|----------|---------|----------|
| 1 | Do hooks with matcher `REPL` fire under Code Mode? | **Yes**, live in an interactive Code Mode session (settings hot-reload; no restart). PreToolUse carries `tool_input.code`; PostToolUse carries `tool_response` = `{code, result, stdout, stderr}` and `duration_ms`. **No `toolsUsed` field was present** and calls made inside the batch did **not** fire their own hooks. | docs/spikes/repl-hook-payloads.json |
| 2 | Detect Code Mode on | Env var `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1` is visible to scripts run from the session; a REPL event in the audit log is the stronger observed signal. Doctor reports: `on` (env=1 or REPL events seen), `off` (env unset/0), else `unknown`. | session env |
| 3 | setup-pstack config path | Not resolved from a live run; ADR-001 keeps pstack configuration as documentation + agent-pinned models. Deviation: ADR-019. | — |
| 4 | Usage fields | `claude -p --output-format json` returns `usage`, per-model `modelUsage` (tokens, costUSD) and `total_cost_usd`. Hooks give `transcript_path`. Metrics use the -p JSON. | docs/spikes/headless-usage.json |
| 5 | /code-review, /security-review in `-p` | /code-review documented for -p; /security-review exercised in Increment 7. | Inc 7 |
| 6 | worktree double creation | Daylight creates worktrees itself with `git worktree add` and does not combine with `claude --worktree`. | ADR-019 |
| 7 | Plugin namespace and root | Commands are namespaced `<plugin>:<cmd>`; `${CLAUDE_PLUGIN_ROOT}` is set for plugin hooks under `claude -p`; plugin hooks fire headless (no `--bare`). `claude plugin validate <dir>` works and wants a README and author. | throwaway plugin |

Note: a headless run with `--permission-mode bypassPermissions` was refused by the session's safety classifier; headless runs use `--allowedTools` instead.

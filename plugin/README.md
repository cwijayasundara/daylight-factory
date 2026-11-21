# Daylight plugin

Daylight is a lights-on software factory harness for Claude Code. It composes existing plugins (Superpowers, pstack, mattpocock skills), hooks and subagents, and adds only plumbing: configuration, an append-only audit log, gates, sensors and reports.

## Setup
1. Install from a local marketplace: `claude plugin marketplace add <repo>` then `claude plugin install daylight@daylight-local`.
2. Run `npm ci` in the plugin directory, then `daylight doctor` to check your environment.
3. Create `daylight.yaml` in your repo (gates and deploy target are required; everything else has defaults).

Run `/daylight:run --help` for usage.

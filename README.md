# Daylight — Lights-On Software Factory for Claude Code

Daylight is a local Claude Code plugin that takes a PRD (or GitHub issue / scheduled task) and delivers reviewed, tested, Docker-deployed code with **0 human gates** (fully unattended) or **2 human gates** (design + PR approval). Every tool call, model, token count, sensor result, verdict, and gate decision is written to a hash-chained audit log and HTML report.

![Daylight Factory Architecture](docs/factory-architecture.svg)

## Requirements
- **Node.js 24+** (runs TypeScript directly via type stripping)
- **Claude Code** (`claude` CLI logged in with `claude-sonnet-5-5` and `claude-opus-5-5`)
- **git** and **Docker** (for local compose deploy & smoke verification)
- **Supported stacks:** TypeScript, Python 3.14 (`uv` + `pytest`), and Rust (`cargo`)

## Quick Start: Scaffold & Run

### 1. Clone and install plugin dependencies (one-time)
```bash
git clone https://github.com/cwijayasundara/daylight-factory.git
cd daylight-factory/plugin && npm ci
```

### 2. Launch Claude Code in your target folder (no marketplace needed)
```bash
cd /path/to/your-target-repo
claude --plugin-dir /path/to/daylight-factory/plugin
```

### 3. Scaffold Daylight in the target folder
Inside Claude Code, run:
```text
/daylight:init --stack python --gates 0
```
*Options:* `--stack ts|python|rust` (auto-detected on existing repos) and `--gates 0|2` (`0` = fully unattended, `2` = human approves design & PR).

This initializes git if needed, copies factory artefacts (`skills/`, `rules/`, `config/`) to `.daylight/factory/`, creates `daylight.yaml` (or runs `ingest` on brownfield repos), and writes a starter `prd.md`.

### 4. Edit `prd.md`, commit the baseline, and run the factory
```bash
git add -A && git commit -m "initial baseline"
```
Then inside Claude Code:
```text
/daylight:run prd.md --agents
```
*(Omit `--agents` for 2-human-gate mode.)*

## Headless CLI, Resume & Frozen Runs

You can also run the factory directly from your terminal (same engine as `/daylight:run`):

```bash
# 0-gate unattended run
DAYLIGHT_RUN=run1 node /path/to/daylight-factory/plugin/src/cli.ts run prd.md --agents --summary-out summary.json

# 2-human-gate run
DAYLIGHT_RUN=run1 node /path/to/daylight-factory/plugin/src/cli.ts run prd.md --summary-out summary.json

# Resume an interrupted or escalated run from its last checkpoint
DAYLIGHT_RUN=run1 node /path/to/daylight-factory/plugin/src/cli.ts run prd.md --agents --resume --summary-out summary.json

# Frozen-plan run (skip design/plan model calls; test the inner loop cheaply)
DAYLIGHT_RUN=run1 node /path/to/daylight-factory/plugin/src/cli.ts run prd.md --agents --design-from docs/design --plan-from .daylight/plan.json --stop-after inner
```

> **Tip:** Always run from a fresh throwaway branch at your baseline commit — runs squash-merge into their base branch, and preflight refuses a base that already contains the feature.

## Testing & Further Reading
- Run plugin tests: `cd plugin && npm run typecheck && npm test`
- Architecture & internals: [ARCHITECTURE.md](ARCHITECTURE.md)
- Reuse ledger: [docs/reuse-ledger.md](docs/reuse-ledger.md)
- Daylight vs Rig comparison: [docs/daylight-vs-rig-comparison.html](docs/daylight-vs-rig-comparison.html)

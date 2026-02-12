# Canvas Labs — Codebase Reference

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Install dependencies (monorepo)
bun install

# Run a specific lab
cd packages/canvas-plugin && bun run src/cli.ts lab linux-user-management

# Unit tests
bun test:plugin                              # All plugin tests
cd packages/canvas-plugin && bun test src/lab/  # Lab subsystem only
cd packages/canvas-plugin && bun test src/lab/__tests__/validation.test.ts  # Single test file

# TUI integration tests
bun test:tui

# Lab validation
cd packages/canvas-plugin && bun run src/cli.ts lab-test <lab-id>
cd packages/canvas-plugin && bun run src/cli.ts lab-validate <lab-id>

# Rebuild Docker image (required after changing lab content)
cd packages/canvas-plugin/docker/lab-environment && ./build.sh
```

## Architecture Overview

Canvas Labs is a monorepo educational platform with React/Ink terminal UIs, Docker-isolated student environments, and AI tutor integration.

### Runtime Flow

```
CLI (cli.ts)
  → spawn.ts creates tmux session with 3 panes:
      ├─ Claude Code (Tutor AI)
      ├─ VTA Canvas (React/Ink step guide)
      └─ Docker Container (student shell)
  → monitor.ts watches log files in /tmp/lab-logs-{id}/
  → Lab adapters parse events (commands, check results)
  → IPC (Unix sockets) sends taskCompleted to VTA
  → tutor-watcher.ts notifies Claude Code of state changes
```

### Key Subsystems

| Subsystem | Entry Point | Purpose |
|-----------|-------------|---------|
| **Lab System** | `src/lab/spawn.ts` | Orchestrates Docker + tmux + monitoring |
| **Canvas System** | `src/canvases/` | React/Ink terminal UIs (VTA, calendar, document) |
| **IPC** | `src/ipc/` | Unix socket protocol between canvases and controllers |
| **Adapters** | `src/lab/adapters/` | Lab-type specific event parsing (linux-cli, python, splunk) |
| **Tutor** | `src/tutor/` | Role-based prompts, profiles, progress tracking |
| **Telemetry** | `src/lab/telemetry/` | Event logging, scoring presets |

### IPC Protocol

Canvases communicate via Unix sockets (`/tmp/canvas-{id}.sock`) using NDJSON:

```typescript
// Canvas → Controller
{ type: "ready" } | { type: "selected", data } | { type: "cancelled" }

// Controller → Canvas
{ type: "update", config } | { type: "close" }

// Lab-specific
{ type: "taskCompleted", stepId, taskId, source: "command" | "check" }
```

### Lab Module Structure

```
labs/{lab-id}/
├── module.yaml      # Step definitions, validation rules
├── setup.sh         # Runs as root in container
└── checks/          # Validation scripts (exit 0 = pass)
```

Check scripts map to steps via the `validation.script` field in module.yaml.

## Adding New Labs

1. Create from template: `cd packages/canvas-plugin && bun run src/cli.ts lab-edit my-lab --new`
2. Edit `labs/.drafts/my-lab/module.yaml` (steps, hints, solutions)
3. Add check scripts in `checks/` (exit 0 = pass, stdout = message)
4. Test: `bun run src/cli.ts lab-test my-lab`
5. Publish: `mv labs/.drafts/my-lab labs/my-lab`

### Step Types

| Type | Purpose | Validation |
|------|---------|------------|
| `introduction` | Welcome/onboarding | None |
| `task` | Hands-on exercise | check-script, command-pattern, user-check, pytest |
| `question` | Knowledge check | Auto-graded |
| `summary` | Completion | None |

## Known Issues

Race condition: check results written before adapter starts watching may be missed. Checks poll every 2s, so subsequent passes are caught.

## Detailed Documentation

- **Lab development**: See `packages/canvas-plugin/CLAUDE.md` for full module.yaml schema, check script format, and Docker details
- **Architecture**: See `docs/plans/2026-01-26-canvas-labs-architecture-analysis.md`
- **Multi-lab telemetry**: See `docs/plans/2026-01-24-multi-lab-telemetry-architecture.md`

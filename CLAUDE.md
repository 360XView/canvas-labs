# Canvas Labs - Development Guide

Interactive terminal-based learning labs with automatic task detection.

## Project Structure

```
canvas-labs/
├── packages/
│   ├── canvas-plugin/     # Main Claude Code plugin (VTA, labs, skills)
│   ├── tui-testing/       # TUI testing framework
│   └── vscode-extension/  # VSCode integration
├── docs/
│   ├── designs/           # Architecture decisions
│   ├── plans/             # Implementation plans
│   └── archive/           # Historical documentation
└── scripts/               # Build and validation scripts
```

## Quick Start

```bash
# Install all dependencies
bun install

# Run a lab
cd packages/canvas-plugin
bun run src/cli.ts lab linux-user-management

# Run tests
bun test:plugin    # Unit tests (137 tests)
bun test:tui       # TUI integration tests
```

## Packages

### canvas-plugin

The main Claude Code plugin containing:
- **src/**: Source code (CLI, canvases, lab system, telemetry)
- **labs/**: Lab content (shell mastery course, linux user management)
- **skills/**: Plugin skills (vta, canvas, calendar, document, flight, lab-launcher)
- **docker/**: Lab environment container

### tui-testing

Framework for testing terminal UI applications:
- **src/**: Core framework (tmux controller, test runner, state observer)
- **adapters/**: Application-specific adapters (canvas adapter)
- **examples/**: Test examples (canvas-vta-test.ts)

### vscode-extension

VSCode integration for Canvas labs (experimental).

## Testing

### Unit Tests
```bash
cd packages/canvas-plugin
bun test src/lab/
```

### TUI Integration Tests
```bash
bun run packages/tui-testing/examples/canvas-vta-test.ts
```

## Skills

Plugin skills are in `packages/canvas-plugin/skills/`:
- `/canvas` - Main terminal TUI skill
- `/vta` - Virtual Teaching Assistant for labs
- `/calendar` - Calendar canvas demo
- `/document` - Document canvas demo
- `/flight` - Flight booking canvas demo
- `/lab-launcher` - Lab launcher interface

Developer workflow skills are in `.claude/skills/`:
- `/validate-migration` - Run validation tests
- `/clean-repo` - Remove stale files

## Key Files

| File | Purpose |
|------|---------|
| `packages/canvas-plugin/src/cli.ts` | CLI entry point |
| `packages/canvas-plugin/src/lab/spawn.ts` | Lab orchestration |
| `packages/canvas-plugin/src/canvases/vta/vta.tsx` | VTA canvas component |
| `packages/canvas-plugin/docker/lab-environment/` | Docker setup |

## Architecture

See `docs/plans/2026-01-24-multi-lab-telemetry-architecture.md` for the multi-lab architecture design.

## Adding New Labs

1. Create lab directory in `packages/canvas-plugin/labs/{lab-id}/`
2. Add `module.yaml` with step definitions
3. Add `setup.sh` for environment setup
4. Add check scripts in `checks/`
5. Test with `bun run src/cli.ts lab {lab-id}`

## Repository

- GitHub: https://github.com/360XView/canvas-labs
- Issues: https://github.com/360XView/canvas-labs/issues

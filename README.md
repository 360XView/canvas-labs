# Canvas Labs

Interactive terminal-based learning labs with automatic task detection for Claude Code.

## Overview

Canvas Labs provides a Virtual Teaching Assistant (VTA) system for hands-on technical education. Students complete tasks in a Docker container while the VTA automatically detects progress and provides guidance.

## Features

- **Interactive Labs**: Step-by-step tutorials with automatic task detection
- **Terminal TUI**: Beautiful terminal interface using Ink/React
- **Docker Integration**: Isolated lab environments
- **Multi-Lab Support**: Linux CLI, Splunk, Python labs
- **Telemetry & Scoring**: Track student progress and performance

## Quick Start

```bash
# Install dependencies
bun install

# Run a lab
cd packages/canvas-plugin
bun run src/cli.ts lab linux-user-management
```

## Packages

| Package | Description |
|---------|-------------|
| `canvas-plugin` | Main Claude Code plugin with VTA and labs |
| `tui-testing` | Framework for testing terminal UI applications |
| `vscode-extension` | VSCode integration (experimental) |

## Available Labs

### Shell Mastery Course
- `shell-navigation` - Filesystem navigation basics
- `shell-file-operations` - Reading, searching, piping files
- `shell-text-processing` - sed, awk, sort, uniq
- `shell-find-files` - find command and advanced searches
- `shell-bash-scripting` - Variables, conditionals, loops
- `shell-log-analysis` - Real-world log analysis (capstone)

### Standalone Labs
- `linux-user-management` - Create users, set permissions, manage groups

## Documentation

- [Development Guide](CLAUDE.md)
- [Multi-Lab Architecture](docs/plans/2026-01-24-multi-lab-telemetry-architecture.md)
- [Repository Consolidation](docs/plans/2026-01-26-repo-consolidation-design.md)

## License

MIT

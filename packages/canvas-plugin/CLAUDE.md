# Canvas Plugin Development

Use Bun for all development:

- `bun run src/cli.ts` - Run CLI
- `bun test` - Run tests
- `bun install` - Install dependencies

## Quick Start

```bash
# Browse and launch labs (User mode with Mentor assistant)
bun run src/cli.ts labs

# Browse labs in Developer mode (Admin assistant)
bun run src/cli.ts labs --dev

# Start a specific lab directly
bun run src/cli.ts lab linux-user-management

# Edit a lab (Developer mode)
bun run src/cli.ts lab-edit linux-user-management

# Create a new lab from template
bun run src/cli.ts lab-edit my-new-lab --new

# Test a lab
bun run src/cli.ts lab-test linux-user-management
```

## Role-Based System

Claude Code takes on different personas depending on context:

| Context | Claude Role | Purpose |
|---------|-------------|---------|
| Launcher (User mode) | **Mentor** | Advises learning path, assesses skills |
| Launcher (Dev mode) | **Admin** | Manages profiles, labs, system |
| Lab (User mode) | **Tutor** | Helps during lab, hints, encouragement |
| Lab (Dev mode) | **Developer** | Creates content, scripts, tests |

### Mode Toggle in Launcher

| Key | Action |
|-----|--------|
| `d` | Switch to Developer mode |
| `u` | Switch to User mode |

Switching modes restarts the Claude Code pane with the appropriate workspace.

## Project Structure

```
canvas/
├── src/
│   ├── cli.ts                  # CLI entry point
│   ├── canvases/
│   │   ├── vta/                # Virtual Teaching Assistant (lab mode)
│   │   ├── vta-preview/        # Read-only preview (edit mode)
│   │   └── lab-launcher/       # Lab browser with profile management
│   ├── lab/
│   │   ├── spawn.ts            # Lab environment orchestrator
│   │   ├── editor.ts           # Lab editor orchestrator
│   │   ├── monitor.ts          # Log watcher → IPC to VTA
│   │   ├── module-loader.ts    # Load modules from labs/ and labs/.drafts/
│   │   ├── validator.ts        # Module YAML validation
│   │   ├── test-runner.ts      # Docker-based test runner
│   │   └── checks/             # Check log parsing
│   ├── tutor/
│   │   ├── profile-manager.ts  # CRUD for profiles
│   │   ├── workspaces.ts       # Role-based workspace manager
│   │   ├── prompts/
│   │   │   ├── mentor-prompt.ts    # User mode launcher
│   │   │   ├── admin-prompt.ts     # Developer mode launcher
│   │   │   ├── tutor-prompt.ts     # In-lab help
│   │   │   └── developer-prompt.ts # Lab editing
│   │   └── defaults.ts         # Default paths and configs
│   └── ipc/                    # IPC server/client
├── labs/                       # Published lab modules
│   ├── linux-user-management/
│   │   ├── module.yaml         # Module definition
│   │   ├── setup.sh            # Container setup script
│   │   └── checks/             # Validation check scripts
│   ├── .drafts/                # Draft labs (same structure)
│   └── .templates/             # Lab templates
│       └── basic.yaml
├── docker/
│   └── lab-environment/
│       ├── Dockerfile
│       ├── build.sh            # Rebuild image
│       └── scripts/
│           ├── lab-orchestrator.sh
│           └── log-check-result.sh
└── docs/
    └── LAB_ENVIRONMENT.md
```

## Lab Launcher

```bash
bun run src/cli.ts labs              # User mode (Mentor)
bun run src/cli.ts labs --dev        # Developer mode (Admin)
bun run src/cli.ts labs --no-assistant  # Without Claude Code
```

### User Mode Layout

```
┌─────────────────────────────────┬──────────────────────────┐
│ LAB LAUNCHER           [d] Dev  │ Claude Code (Mentor)     │
├─────────────┬───────────────────┤                          │
│ [ LABS ]    │ [ LAB DETAILS ]   │ "Based on your progress, │
│ ● linux-usr │ Linux User Mgmt   │  I recommend..."         │
│   docker    │ Learn to create...│                          │
├─────────────┴───────────────────┤                          │
│ ↑↓ Nav | Enter Launch | d Dev   │                          │
└─────────────────────────────────┴──────────────────────────┘
```

### Developer Mode Layout

```
┌─────────────────────────────────┬──────────────────────────┐
│ LAB LAUNCHER [DEV]         [u]  │ Claude Code (Admin)      │
├─────────────┬───────────────────┤                          │
│ [ LABS ]    │ [ LAB INFO ]      │ "How can I help manage   │
│ ● linux-usr │ Status: published │  the system?"            │
│   docker    │ 5 steps, 4 tasks  │                          │
├─────────────┴───────────────────┤                          │
│ ↑↓ Nav | Enter Edit | n New | u │                          │
└─────────────────────────────────┴──────────────────────────┘
```

### Launcher Keys

| Key | User Mode | Developer Mode |
|-----|-----------|----------------|
| `↑/↓` | Navigate labs | Navigate labs |
| `Enter` | Launch lab | Edit lab |
| `n` | - | Create new lab |
| `d` | Switch to Dev mode | - |
| `u` | - | Switch to User mode |
| `p` | Profile panel | Profile panel |
| `q` | Quit | Quit |

### Profile Panel (press `p`)

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate profiles |
| `Enter` | Switch to profile |
| `v` | View detailed stats |
| `n` | Create new profile |
| `x` | Delete profile |
| `r` | Reset progress |

## Lab Development

### Creating a New Lab

1. **From launcher**: Press `n` in Developer mode, enter lab ID
2. **From CLI**: `bun run src/cli.ts lab-edit my-lab --new`

This creates a draft at `labs/.drafts/my-lab/` from the template.

### Lab Editor Layout

```
┌────────────────────────────────┬──────────────────────────────┐
│ Claude Code (Developer)        │ VTA PREVIEW                  │
│                                │ ┌──────────────────────────┐ │
│ Working on: my-lab (DRAFT)     │ │ · Introduction           │ │
│                                │ │ ▸ ○ First Task           │ │
│ File Locations:                │ │   ○ Second Task          │ │
│ - module.yaml                  │ │   · Lab Complete!        │ │
│ - checks/                      │ └──────────────────────────┘ │
│ - setup.sh                     │                              │
│                                │ ←/→ Navigate | h Hints | q   │
└────────────────────────────────┴──────────────────────────────┘
```

### Lab Module Structure

```
labs/<module-id>/           # Published labs
├── module.yaml             # Lab definition (steps, tasks, validation)
├── setup.sh                # Setup script (runs as root in container)
├── checks/                 # Check scripts for task validation
│   ├── check-task-1.sh
│   └── check-task-2.sh
└── assets/                 # Optional images, files

labs/.drafts/<module-id>/   # Draft labs (same structure)
```

### module.yaml Format

```yaml
title: Lab Title
description: What students will learn

steps:
  - id: intro
    title: Introduction
    type: introduction
    content:
      instructions: |
        Welcome to this lab!

  - id: task-1
    title: Create a User
    type: task
    content:
      instructions: |
        Create a user named **devuser**.
      tasks:
        - text: "Create the user"
    hints:
      - "Use the useradd command"
      - "Try: useradd -m devuser"
    solution:
      command: useradd -m devuser
      explanation: Creates user with home directory
    validation:
      type: check-script
      script: check-user-exists.sh

  - id: knowledge-check
    title: Permission Quiz
    type: question
    content:
      question:
        text: "What permission mode gives owner full access, group read/execute, others none?"
        type: single  # or "multiple" for multi-select
        options:
          - id: opt-777
            text: "777"
            correct: false
          - id: opt-750
            text: "750"
            correct: true
          - id: opt-700
            text: "700"
            correct: false
        explanation: |
          750 means rwxr-x--- which gives the owner (7) full access,
          the group (5) read and execute, and others (0) no access.

  - id: summary
    title: Lab Complete!
    type: summary
    content:
      instructions: |
        Congratulations! You've completed the lab.
```

### Question Steps

Questions support single-select and multi-select modes:
- User presses 1-9 to select options
- Enter to submit answer
- Rich feedback shows correct/incorrect with explanation
- Results recorded in `state.json` for progress tracking

### Check Script Format

```bash
#!/bin/bash
# Exit 0 = PASS, Exit non-zero = FAIL
# stdout captured as result message

if id "devuser" &>/dev/null; then
    echo "User devuser exists"
    exit 0
else
    echo "User devuser does not exist"
    exit 1
fi
```

### Testing Labs

```bash
# Validate module structure
bun run src/cli.ts lab-validate my-lab

# Run full test (setup + all checks in Docker)
bun run src/cli.ts lab-test my-lab

# Test specific check only
bun run src/cli.ts lab-test my-lab --check check-user-exists.sh

# Test setup script only
bun run src/cli.ts lab-test my-lab --setup-only

# Interactive test (as student)
bun run src/cli.ts lab my-lab --profile test-dev
```

### Visual Testing with Screenshots

Unit tests can miss integration issues. Use visual demos to verify the full stack:

```bash
# Fresh start (kills tmux, Docker, starts clean)
.claude/skills/demo-prototype/scripts/fresh-start.sh linux-user-management

# Run visual demo with screenshots
.claude/skills/demo-prototype/scripts/vta-lab-demo.sh demo-session 1 --visual

# Screenshots saved to /tmp/demo-captures/
# Use Read tool to view each screenshot
```

**Screenshot Review Checklist:**
- [ ] Sidebar shows correct checkmarks for completed steps
- [ ] Debug panel shows expected completion count
- [ ] Container prompt shows correct user (root/student)
- [ ] No error messages visible

See `.claude/skills/demo-prototype/SKILL.md` for full documentation.

### Known Issues

See `docs/KNOWN_ISSUES.md` for documented bugs and workarounds.

**Key issue:** Race condition where check results written before adapter starts watching may be missed. Workaround: subsequent check passes will be caught (checks poll every 2 seconds).

### Publishing a Draft

Move from drafts to published:
```bash
mv labs/.drafts/my-lab labs/my-lab
```

## Docker Environment

```bash
# Rebuild Docker image (required after changing labs)
cd docker/lab-environment && ./build.sh

# Or manually:
docker build -t canvas-lab:latest docker/lab-environment/

# Debug inside container
docker run -it --rm --entrypoint /bin/bash canvas-lab:latest

# Inside container, scripts are at:
# /opt/lab/modules/<module-id>/setup.sh
# /opt/lab/modules/<module-id>/checks/
```

## Profile Data

Profiles stored at `~/.claude/tutor/profiles/<profile-id>/`:
- `profile.json` - Metadata (name, created, last active)
- `progress.json` - Lab progress (attempts, time, hints, completion)

### CLI Profile Commands

```bash
bun run src/cli.ts profile-list
bun run src/cli.ts profile-create <id>
bun run src/cli.ts profile-use <id>
bun run src/cli.ts profile-stats
```

## Workspaces

Role-based workspaces at `~/.claude/tutor/workspaces/`:

| Role | Workspace | Generated By |
|------|-----------|--------------|
| Mentor | `workspaces/mentor/` | `mentor-prompt.ts` |
| Admin | `workspaces/admin/` | `admin-prompt.ts` |
| Tutor | `workspaces/tutor/` | `tutor-prompt.ts` |
| Developer | `workspaces/developer/` | `developer-prompt.ts` |

Each workspace has a `CLAUDE.md` with role-specific context.

## IPC Protocol

Canvases communicate via Unix domain sockets:

```typescript
// Canvas → Controller
{ type: "ready", scenario }
{ type: "selected", data }
{ type: "cancelled" }

// Controller → Canvas
{ type: "update", config }
{ type: "close" }

// Lab Monitor → VTA
{ type: "taskCompleted", stepId, taskId, source: "command" | "check" }
{ type: "labStatus", status: "running" | "stopped" }
```

## Architecture Notes

### Lab Session Flow

1. `spawn.ts` creates tmux layout (VTA + Docker + optional Claude Code)
2. Docker container starts with `lab-orchestrator.sh`
3. Orchestrator runs `setup.sh`, then starts check polling loops
4. `monitor.ts` watches log files, sends IPC to VTA on completions
5. VTA updates step indicators as tasks complete

### Check Script → Step ID Mapping

Check scripts log their filename, but VTA needs step IDs:
- Orchestrator logs: `check-user1-exists.sh`
- Monitor maps via `getCheckConfigs()`: `check-user1-exists.sh` → `create-user1`
- VTA receives step ID and updates correct step

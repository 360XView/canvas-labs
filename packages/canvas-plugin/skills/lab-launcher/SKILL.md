---
name: lab-launcher
description: |
  Lab launcher canvas for browsing and launching interactive learning labs.
  Use when users want to explore available labs or start a hands-on practice session.
---

# Lab Launcher Canvas

Browse available labs and launch them into Docker containers for hands-on practice.

## Example Prompts

Try asking Claude:

- "Show me the available labs"
- "Start a Linux learning session"
- "Browse the labs I can do"
- "Launch a hands-on lab"
- "What labs can I practice?"

## Quick Start

```bash
# Browse and launch labs interactively
bun run src/cli.ts labs

# Show the lab launcher canvas directly
bun run src/cli.ts show lab-launcher
```

## Layout

```
+-------------------------------------------------------------+
|                     LAB LAUNCHER                            |
+---------------------+---------------------------------------+
| AVAILABLE LABS      | LAB DETAILS                           |
| ------------------- | ------------------------------------- |
| > Linux User Mgmt   | Linux User Management                 |
|   Docker Basics     | ------------------------------------- |
|   Git Fundamentals  | Learn to create and manage Linux      |
|                     | users, set permissions, and manage    |
|                     | groups.                               |
|                     |                                       |
|                     | Steps: 5                              |
|                     | Tasks: 3                              |
|                     |                                       |
|                     | Prerequisites:                        |
|                     |   - Docker Desktop                    |
|                     |   - tmux                              |
+---------------------+---------------------------------------+
| ^/v Select | Enter Launch | r Refresh | q Quit              |
+-------------------------------------------------------------+
```

## Controls

| Key | Action |
|-----|--------|
| `^/v` | Navigate between labs |
| `Enter` | Launch selected lab |
| `r` | Refresh lab list |
| `q` or `Esc` | Quit |

## Configuration

```typescript
interface LabLauncherConfig {
  title?: string;        // Custom title for the canvas
  labs?: LabInfo[];      // Pre-loaded labs (optional)
}

interface LabInfo {
  id: string;            // Module ID (e.g., "linux-user-management")
  title: string;         // Display title
  description?: string;  // Lab description
  stepCount: number;     // Total steps
  taskCount: number;     // Number of task steps
}
```

## Selection Result

When a user selects a lab and presses Enter:

```typescript
interface LabLauncherResult {
  action: "launch";
  selectedLab: LabInfo;
}
```

## API Usage

```typescript
import { browseLabs, selectAndLaunchLab } from "${CLAUDE_PLUGIN_ROOT}/src/api/canvas-api";

// Browse labs and get selection
const result = await browseLabs();

if (result.success && result.data) {
  console.log(`Selected: ${result.data.selectedLab.title}`);
}

// Browse and automatically launch the selected lab
const launchResult = await selectAndLaunchLab();

if (launchResult.success && launchResult.data) {
  console.log(`Launched: ${launchResult.data.selectedLab.id}`);
}
```

## How It Works

1. The canvas loads available labs from the `labs/` directory
2. User navigates with arrow keys and selects with Enter
3. When a lab is selected:
   - Docker image is built (if needed)
   - tmux session is created
   - vTA canvas shows tasks/instructions (top pane)
   - Docker container runs lab environment (bottom pane)
   - Optional AI tutor pane provides guidance

## Prerequisites

- **Docker Desktop** - Must be running
- **tmux** - `brew install tmux`
- **Bun** - Runtime for the canvas

## Adding New Labs

Labs are defined in the `labs/` directory as `module.yaml` files.

See `/docs/LAB_ENVIRONMENT.md` for full documentation on creating new lab modules.

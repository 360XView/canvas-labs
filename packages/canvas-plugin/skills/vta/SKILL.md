---
name: vta
description: |
  Virtual Teaching Assistant canvas for guided hands-on learning.
  Use when presenting step-by-step tutorials, labs, or interactive lessons with tasks, hints, and solutions.
---

# Virtual Teaching Assistant (vTA)

Display interactive learning modules with step-by-step guidance, tasks, hints, and solutions.

## Example Prompts

Try asking Claude things like:

- "Create a tutorial for learning Git basics"
- "Guide me through setting up a Python virtual environment"
- "Teach me Linux user management step by step"
- "Create a hands-on lab for Docker containers"

## Scenarios

### `learn` (default)

Interactive learning mode with navigation between steps, collapsible hints, and reveal-able solutions.

```bash
bun run src/cli.ts spawn vta --scenario learn --config '{
  "module": {
    "id": "my-module",
    "title": "My Tutorial",
    "steps": [...]
  }
}'
```

## Configuration

```typescript
interface VTAConfig {
  module: Module;
  currentStepIndex?: number;  // Starting step (default: 0)
}

interface Module {
  id: string;
  title: string;
  description?: string;
  steps: Step[];
}

interface Step {
  id: string;
  title: string;
  type: "introduction" | "task" | "question" | "summary";
  content: StepContent;
  completed?: boolean;
}

interface StepContent {
  instructions?: string;       // Main text content
  tasks?: TaskItem[];          // Checklist of tasks
  hints?: Hint[];              // Progressive hints
  solution?: Solution;         // Reveal-able solution
  question?: Question;         // Multiple choice question
}

interface TaskItem {
  text: string;                // Task description (supports **bold**)
  details?: string[];          // Sub-items (supports `code`)
  completed?: boolean;
}

interface Hint {
  id: string;
  text: string;                // Hint content (supports code blocks)
}

interface Solution {
  description?: string;        // Explanation
  command?: string;            // Command to run
  explanation?: string;        // Additional context
}

interface Question {
  text: string;
  type: "single" | "multiple";
  options: QuestionOption[];
}

interface QuestionOption {
  id: string;
  text: string;
  correct?: boolean;           // Mark correct answer(s)
}
```

## Controls

| Key | Action |
|-----|--------|
| `←` / `p` | Previous step |
| `→` / `n` / `Enter` | Next step (marks current as completed) |
| `↑` / `↓` | Scroll content or navigate sidebar |
| `Tab` | Switch focus between sidebar and content |
| `h` | Reveal next hint |
| `s` | Toggle solution visibility |
| `d` | Toggle debug panel (lab mode only) |
| `1-9` | Select question option |
| `q` / `Esc` | Quit |

## Layout

```
╔══════════════════════════════════════════════════════════════╗
║         Virtual Teaching Assistant │ Module Title            ║
╠═══════════════════╦══════════════════════════════════════════╣
║ Module Info       ║ Step Title                               ║
║ ─────────────────║ ──────────────────────────────────────── ║
║ ● Introduction ✓ ║ Instructions text...                     ║
║ ● Current Step   ║                                          ║
║ ○ Next Step      ║ 📋 Task                                   ║
║ ○ ...            ║ • Task items with details                ║
║                  ║                                          ║
║ Progress: 20%    ║ 💡 Hints [Press H]                        ║
║ ████░░░░░░░░░░   ║                                          ║
║                  ║ ✅ Solution [Press S]                     ║
║                  ║                                          ║
║                  ║ ←/→ nav • h hint • s solution • q quit   ║
╚═══════════════════╩══════════════════════════════════════════╝
```

## Demo Mode

Run without config to see a demo Linux User Management module:

```bash
bun run src/cli.ts spawn vta
```

## API Usage

```typescript
// Spawn vTA canvas with custom module
const config: VTAConfig = {
  module: {
    id: "git-basics",
    title: "Git Basics",
    steps: [
      {
        id: "intro",
        title: "Introduction",
        type: "introduction",
        content: {
          instructions: "Welcome to Git basics! In this module..."
        }
      },
      {
        id: "init",
        title: "Initialize a Repository",
        type: "task",
        content: {
          instructions: "Let's create your first Git repository.",
          tasks: [
            { text: "Create a new directory", details: ["`mkdir my-project`"] },
            { text: "Initialize Git", details: ["`git init`"] }
          ],
          hints: [
            { id: "h1", text: "Use `mkdir` to create directories" }
          ],
          solution: {
            command: "mkdir my-project && cd my-project && git init",
            explanation: "This creates a new directory and initializes an empty Git repository."
          }
        }
      }
    ]
  }
};
```

## Features

- **Progressive Disclosure**: Hints reveal one at a time, solutions hidden by default
- **Progress Tracking**: Visual progress bar and step completion markers
- **Keyboard Navigation**: Full keyboard control for terminal efficiency
- **Question Support**: Single and multiple choice questions with selection
- **Markdown-like Formatting**: Supports **bold**, `code`, and code blocks
- **Responsive Layout**: Adapts to terminal size
- **Lab Mode**: Auto-detection of task completion via Docker container integration
- **Debug Panel**: View IPC events and completed steps in lab mode

## Lab Mode

For hands-on labs with automatic task detection, use lab mode:

```bash
# Start lab with Docker container and auto-detection
bun run src/cli.ts lab linux-user-management
```

This creates a tmux split with:
- **Top pane**: vTA showing tasks with "Lab Connected" status
- **Bottom pane**: Docker container where students execute commands

Tasks complete automatically when:
- **Command-based**: Student types a matching command (e.g., `sudo su`)
- **Result-based**: Check script detects system state (e.g., user exists)

### Debug Panel

Press `d` in lab mode to see:
- Connection status
- Completed steps with source (command/check)
- Event log with timestamps

```
🔧 Debug Panel (press d to close)

Status: ● Connected (running)

Completed Steps (4):
 become-root, create-user, set-permissions, add-to-group

Last: add-to-group [check] 14:28:51

Event Log:
14:28:51 ◆ taskCompleted: add-to-group [check]
14:26:21 ◆ taskCompleted: become-root [command]
14:23:31 → Monitor connected
```

See [docs/LAB_ENVIRONMENT.md](../../docs/LAB_ENVIRONMENT.md) for full lab documentation.

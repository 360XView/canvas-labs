# Canvas Labs - Architecture Analysis

**Date:** January 26, 2026
**Status:** Reference Documentation
**Scope:** Comprehensive architecture analysis of the Canvas Labs educational platform

---

## 1. Architecture Overview

Canvas Labs is a **monorepo-based educational platform** built on TypeScript/Bun that provides interactive, terminal-based learning labs. It combines React/Ink for terminal UIs, Docker for isolated student environments, Unix sockets for IPC, and an AI tutor system for real-time guidance. The architecture follows a **plugin pattern** where the core canvas-plugin package orchestrates lab sessions via tmux, monitors student progress through validation scripts, and renders interactive components (VTA, lab launcher, document viewer) directly in the terminal.

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLI (cli.ts)                                   │
│                     Commander.js + Bun runtime                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────────┐
        ▼                           ▼                               ▼
┌───────────────┐         ┌─────────────────┐            ┌─────────────────┐
│  Lab System   │         │  Canvas System  │            │  Tutor System   │
│  spawn.ts     │         │  React/Ink      │            │  Prompts        │
│  monitor.ts   │◄───────►│  IPC (sockets)  │◄──────────►│  Profiles       │
│  adapters/    │         │  vta.tsx        │            │  Progress       │
└───────┬───────┘         └────────┬────────┘            └────────┬────────┘
        │                          │                              │
        │         ┌────────────────┴────────────────┐             │
        │         ▼                                 ▼             │
        │  ┌─────────────┐                 ┌─────────────┐        │
        │  │ Lab Logs    │                 │ State Files │        │
        │  │ commands    │                 │ state.json  │        │
        │  │ checks      │                 │ tutor-cmds  │        │
        │  │ terminal    │                 │ progress    │        │
        │  └─────────────┘                 └─────────────┘        │
        │                                                         │
        ▼                                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           tmux Session                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │ Claude Code      │  │ VTA Canvas       │  │ Docker Container         │ │
│  │ (Tutor AI)       │  │ (Lab Guide)      │  │ (Student Environment)    │ │
│  │ CLAUDE.md loaded │  │ React/Ink        │  │ Ubuntu 22.04             │ │
│  │ TUTOR:EVENT hook │  │ Step tracking    │  │ SSH + command logging    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Bun | Latest |
| **Language** | TypeScript | 5.9.3 |
| **UI Framework** | React | 19.2.3 |
| **Terminal UI** | Ink | 6.6.0 |
| **CLI Framework** | Commander | 14.0.2 |
| **Container** | Docker | Ubuntu 22.04 |
| **IPC** | Unix Sockets | Bun native |
| **Config Format** | YAML | js-yaml 4.1.1 |
| **Testing** | Bun test | Native |
| **Package Manager** | Bun | Monorepo support |

---

## 4. Key Architectural Decisions

| Decision | Pattern | Rationale |
|----------|---------|-----------|
| **Monorepo** (Bun workspaces) | Workspace pattern | Share code between plugin, TUI testing, and VSCode extension |
| **React/Ink for TUI** | Component-based UI | Familiar React model for terminal interfaces, easy state management |
| **YAML lab definitions** | Declarative config | Non-developers can author labs without TypeScript |
| **Docker isolation** | Container pattern | Safe sandbox for students to make mistakes without host damage |
| **Unix sockets for IPC** | Message passing | Low-latency communication between canvas and tutor |
| **tmux orchestration** | Session manager | Split panes, persistent sessions, terminal multiplexing |
| **Check scripts** | Strategy pattern | Each validation is a pluggable shell script |
| **Adapter pattern** | Factory selects adapter | Support multiple lab types (Linux CLI, Python, Splunk) |

---

## 5. Deep Dive: Lab Execution Flow

### 5.1 Startup Sequence

```
CLI (lab command)
  → Ensure Docker image exists
  → Detect/create tmux session
  → spawnLabEnvironment()
      ├─ Start Docker container (detached)
      ├─ Run healthcheck (wait for orchestrator)
      ├─ Create log infrastructure (/tmp/lab-logs-<id>/)
      └─ Setup tmux panes:
           ┌────────┬──────────────────┐
           │ Tutor  │  VTA Canvas      │
           │ (30%)  ├──────────────────┤
           │        │  Docker Shell    │
           └────────┴──────────────────┘
  → Spawn 3 background processes:
      ├─ monitor.ts (event hub, IPC to VTA)
      ├─ progress-updater.ts (profile tracking)
      └─ tutor-watcher.ts (notify Claude Code)
```

### 5.2 Event Flow

```
Student types command in Docker
    ↓
Command logged to /tmp/lab-logs-{id}/commands.log
    ↓
Linux CLI Adapter watches file, parses command
    ↓
Event Hub receives event, deduplicates (1s window)
    ↓
Parallel dispatch:
    ├─ EventLogger → telemetry.jsonl
    ├─ StateWriter → state.json
    └─ IPC Client → VTA Canvas (taskCompleted message)
    ↓
VTA updates UI, marks step complete
    ↓
Tutor Watcher detects state change (debounced 3s)
    ↓
Sends TUTOR:EVENT to Claude Code pane
    ↓
Claude Code reads logs, provides guidance
```

### 5.3 Critical Timing Windows

| Operation | Timeout/Delay |
|-----------|---------------|
| Container startup | 10s healthcheck |
| Tutor initialization | 5s startup delay |
| Event debouncing | 3s after file change |
| Event cooldown | 2s minimum between events |
| IPC connection retry | 10 × 500ms = 5s total |

---

## 6. Deep Dive: Canvas/IPC System

### 6.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Canvas Process (React/Ink)                       │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   │
│  │   Calendar      │   │   Document      │   │   VTA           │   │
│  │   Widget        │   │   Editor        │   │   Lab Guide     │   │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘   │
│           │ useIPC hook         │ useIPCServer         │ dual mode │
│           └─────────────────────┼─────────────────────┘            │
│                                 │                                   │
└─────────────────────────────────┼───────────────────────────────────┘
                                  │ Unix Socket
                                  │ /tmp/canvas-{id}.sock
                                  │ NDJSON protocol
┌─────────────────────────────────┼───────────────────────────────────┐
│                     Controller (Claude Code / CLI)                   │
│  send: close, update, ping, getSelection, getContent                │
│  recv: ready, selected, cancelled, error, pong, selection, content  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Message Protocol

**Controller → Canvas:**
- `close` - Kill canvas
- `update` - Update config
- `ping` - Heartbeat
- `getSelection` - Get text selection
- `getContent` - Get full content

**Canvas → Controller:**
- `ready` - Canvas initialized
- `selected` - User selection result
- `cancelled` - User cancelled
- `error` - Error occurred
- `pong` - Heartbeat response

**Lab-Specific Messages:**
- `taskCompleted` - Task validation passed
- `labStatus` - Lab running/stopped
- `addDynamicStep` - Tutor adds bonus step
- `questionAnswered` - Quiz response

### 6.3 Canvas Types

| Canvas | Purpose | Key Features |
|--------|---------|--------------|
| **Calendar** | Week view, meeting picker | Real-time clock, navigation keys |
| **Document** | Markdown rendering | Text selection, cursor tracking |
| **Flight** | Flight + seat selection | Seatmap visualization |
| **VTA** | Lab step guide | Dynamic steps, hints, solutions |
| **Lab Launcher** | Lab discovery | Course/module browser |

---

## 7. Deep Dive: Tutor AI Integration

### 7.1 Context Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Claude Code (Tutor Pane)                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  CLAUDE.md (Generated per-session)                              │    │
│  │  - Student profile & history                                    │    │
│  │  - Module steps table with solutions                            │    │
│  │  - Log file paths for monitoring                                │    │
│  │  - Commands: TUTOR:INTRO, TUTOR:EVENT                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │ reads                                     │
└──────────────────────────────┼──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Log Directory (/tmp/lab-logs-{id}/)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │ commands.log │ │ checks.log   │ │ terminal.log │ │ state.json    │  │
│  │ (JSON lines) │ │ (JSON lines) │ │ (script out) │ │ (step states) │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └───────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Role-Based Prompts

| Role | Purpose | Context Provided |
|------|---------|------------------|
| **Tutor** | In-lab guidance | Module steps, student history, log paths |
| **Mentor** | Lab selection advice | Skills mastered, recommended labs |
| **Admin** | System administration | Profile management, validation commands |
| **Developer** | Lab content creation | YAML format, check script examples |

### 7.3 Tutor Capabilities

- Read student commands in real-time via `commands.log`
- Check validation results via `checks.log`
- See full terminal session via `terminal.log`
- Track step completion via `state.json`
- Add bonus tasks dynamically via `tutor-commands.json`
- Mark steps complete manually
- Respond to `TUTOR:EVENT` triggers (debounced)

---

## 8. Deep Dive: Testing Infrastructure

### 8.1 Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Unit Tests (bun:test)                           │
│  Fast, isolated tests of individual functions                           │
│  Location: src/**/__tests__/*.test.ts                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Integration Tests (File-based)                        │
│  Mock environments, file watchers, temp directories                     │
│  Tests: e2e-simulation.test.ts, python-adapter.test.ts                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      E2E Tests (Docker + Tmux)                          │
│  Real containers, actual lab execution, TUI automation                  │
│  Framework: packages/tui-testing/                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Key Testing Components

| Component | Purpose | Key File |
|-----------|---------|----------|
| **Test Runner** | Execute lab tests in Docker | `test-runner.ts` |
| **Validator** | Validate YAML structure | `validator.ts` |
| **TUI Test Runner** | Automate terminal UI via tmux | `tui-test-runner.ts` |
| **Adapters** | Lab-type specific event parsing | `linux-cli-adapter.ts` |
| **Helpers** | Mock IPC, write test logs | `helpers.ts` |

### 8.3 TUI Testing API

```typescript
const runner = new TUITestRunner({ adapter, verbose: true });
await runner.run(async (ctx) => {
  await ctx.assertPaneContains("Introduction");
  await ctx.sendKeys("ArrowRight");
  await ctx.waitForText("Create a File", 5000);
});
```

### 8.4 Test Commands

```bash
bun test                           # All tests
bun test:plugin                    # Plugin unit tests
bun test:tui                       # TUI integration tests
bun run src/cli.ts lab-test <id>   # Lab validation in Docker
```

---

## 9. Deep Dive: Lab Authoring System

### 9.1 Lab File Structure

```
labs/{module-id}/
├── module.yaml          # Lab definition (YAML)
├── setup.sh             # Environment initialization
└── checks/              # Validation scripts
    ├── check-*.sh       # Exit 0 = pass, 1 = fail
    └── ...
```

### 9.2 YAML Schema

```yaml
title: "Lab Title"
description: "What students learn"
labType: linux_cli | python | splunk

metadata:
  category: shell
  difficulty: 1-3
  estimatedMinutes: 30
  course: course-id
  order: 5
  prerequisites: [other-lab-id]

steps:
  - id: step-id
    title: "Step Title"
    type: introduction | task | question | summary
    content:
      instructions: "Markdown content"
      tasks:
        - text: "Task description"
      hints: ["Hint 1", "Hint 2"]
      solution:
        command: "the answer"
        explanation: "Why it works"
      question:           # For question type
        text: "Question?"
        type: single | multiple
        options: [...]
    validation:
      type: check-script | command-pattern | user-check | pytest
      script: check-name.sh
      pattern: "regex.*"
      poll_interval: 2000
```

### 9.3 Step Types

| Type | Purpose | Content Fields | Validation |
|------|---------|----------------|------------|
| **introduction** | Onboarding | `instructions` | None |
| **task** | Hands-on exercise | `instructions`, `tasks`, `hints`, `solution` | check-script, command-pattern, user-check |
| **question** | Knowledge check | `question` | Auto-graded |
| **summary** | Completion | `instructions` | None |

### 9.4 Validation Types

| Type | Mechanism | Use Case |
|------|-----------|----------|
| **check-script** | Polls bash script until exit 0 | File/user/permission checks |
| **command-pattern** | Regex match on command history | Specific command required |
| **user-check** | Verify current user identity | Must be root/student |
| **pytest** | Run Python test | Python code validation |

### 9.5 Authoring Workflow

```
Template (.templates/basic.yaml)
    ↓ createDraftFromTemplate()
Draft (.drafts/{id}/)
    ↓ edit & test
    ↓ lab-test command
Published (labs/{id}/)
```

---

## 10. Strengths

1. **Clean separation of concerns** - Lab content (YAML) is fully separate from execution code
2. **Modular canvas system** - Easy to add new canvas types
3. **Comprehensive test coverage** - 137 unit tests + TUI integration testing framework
4. **Progressive disclosure** - VTA provides hints → solutions as student struggles
5. **Real-time monitoring** - Tutor watcher polls and auto-detects task completion
6. **Profile/progress system** - Persistent learning state across sessions
7. **Well-documented labs** - Structured YAML with hints, solutions, explanations
8. **Adapter pattern** - Easy to add new lab types without architectural changes

---

## 11. Gaps & Risks

| Area | Issue | Severity |
|------|-------|----------|
| **Single point of failure** | `cli.ts` at 838 lines is doing too much | Medium |
| **Docker dependency** | No fallback if Docker unavailable | Medium |
| **Error handling** | IPC failures may leave orphan processes/containers | Medium |
| **No health dashboard** | Hard to see system state when things break | Low |
| **VSCode extension** | Marked experimental, appears incomplete | Low |
| **No CI/CD pipeline** | Manual test execution only | Low |

---

## 12. Recommendations

### High Priority
1. **Split cli.ts** into command modules (`commands/lab.ts`, `commands/canvas.ts`)
2. **Add graceful degradation** for Docker unavailability with clear error messages
3. **Document IPC protocol** - message types, socket conventions, error handling

### Medium Priority
4. **Add health/status command** to see running sessions, containers, IPC state
5. **Centralize error handling** for IPC/Docker failures with automatic cleanup
6. **Add CI/CD pipeline** for automated testing on commits

### Lower Priority
7. **Complete VSCode extension** (currently experimental)
8. **Create developer onboarding guide** for lab authors

---

## 13. Key File Paths

### Core System
| File | Purpose |
|------|---------|
| `src/cli.ts` | Main CLI dispatcher (838 lines) |
| `src/lab/spawn.ts` | Lab environment orchestration |
| `src/lab/monitor.ts` | Event hub coordinator |
| `src/lab/tutor-watcher.ts` | Claude Code notification |

### Canvas System
| File | Purpose |
|------|---------|
| `src/canvases/index.tsx` | Canvas renderer dispatcher |
| `src/canvases/vta.tsx` | Virtual Teaching Assistant |
| `src/ipc/client.ts` | IPC client (canvas side) |
| `src/ipc/server.ts` | IPC server (canvas side) |

### Tutor System
| File | Purpose |
|------|---------|
| `src/tutor/prompts/tutor-prompt.ts` | In-lab AI tutor prompt |
| `src/tutor/profile-manager.ts` | Student profile CRUD |
| `src/tutor/progress-updater.ts` | Progress tracking |

### Lab System
| File | Purpose |
|------|---------|
| `src/lab/module-loader.ts` | YAML parser & loader |
| `src/lab/validator.ts` | Structure validation |
| `src/lab/test-runner.ts` | Lab test execution |
| `src/lab/adapters/` | Lab-type specific adapters |

---

## 14. Related Documents

- [Multi-Lab Telemetry Architecture](./2026-01-24-multi-lab-telemetry-architecture.md) - Adapter pattern design
- [Repo Consolidation Design](./2026-01-26-repo-consolidation-design.md) - Monorepo structure

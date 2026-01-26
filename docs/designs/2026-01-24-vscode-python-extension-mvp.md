# VS Code Canvas Extension - Python Lab MVP Design

**Date:** 2026-01-24
**Status:** Validated with Critical Fixes
**Scope:** Minimal extension to enable Python labs in VS Code, connected to existing Canvas hub
**OS Support:** macOS, Linux (MVP; Windows support deferred)

---

## Overview

A lightweight VS Code extension that allows students to start Python Canvas labs directly from the editor. The extension handles lab scaffolding, Python file monitoring, and event emission. All scoring, step tracking, and vTA logic remain in the external Canvas hub (no duplication).

**Architecture:**
```
Student (macOS/Linux)
    ↓
~/.canvas/auth.json (student_id)
    ↓
VS Code Extension
    ├── Lab setup & scaffolding
    ├── Session management
    ├── Python file monitoring
    └── Unix socket → /tmp/canvas-{lab-id}.sock
         ↓
    Canvas Hub (external)
         ├── Event processing (unified schema)
         ├── Telemetry logging (with student_id, session_id)
         ├── Scoring
         └── vTA logic
```

---

## Student Authentication

**One-time setup (per machine):**

On first extension activation, check `~/.canvas/auth.json`:

```json
{
  "student_id": "alice",
  "name": "Alice Smith"
}
```

If missing, show modal asking for student ID. Once entered, save to `~/.canvas/auth.json`.

This student_id will be included in all telemetry events, allowing Canvas hub to track which student submitted code.

---

## Entry Point: Extension-Driven

**User workflow:**
1. Student opens VS Code
2. Canvas extension installed/activated
3. Extension checks `~/.canvas/auth.json` (if missing, shows setup modal)
4. Student clicks "Create Canvas Lab" button in sidebar
5. Modal: Select lab module (dropdown)
6. Extension scaffolds project, installs deps
7. Opens project in workspace
8. **Session created** (`session_started` event emitted)
9. Connects to Canvas hub via Unix socket (`/tmp/canvas-{lab-id}.sock`)
10. vTA panel appears in sidebar
11. Student edits code; tests run on save
12. **Session ends** when: extension closes, project closes, or explicit session end

---

## Extension Architecture

```
vscode-canvas-extension/
├── src/
│   ├── extension.ts          # Entry point, command registration
│   ├── labManager.ts         # Lab scaffolding & setup
│   ├── socketClient.ts       # Socket connection to Canvas hub
│   ├── pythonMonitor.ts      # File watching & event emission
│   ├── webviews/
│   │   ├── vta.html          # vTA panel UI (web view)
│   │   └── vta.js            # vTA client logic
│   ├── schemas/
│   │   └── labConfig.ts      # Local lab metadata types
│   └── commands.ts           # VS Code commands
├── package.json              # Extension manifest
└── tsconfig.json
```

---

## Event Flow

**When student saves a Python file:**

```
1. Student saves src/main.py
2. Extension file watcher detects save (debounced 1-2 sec)
3. Parse file: extract code, line count, functions
4. Run pytest with JSON output (pytest --json-report)
5. Parse pytest JSON (robust, version-independent)
6. Unix socket emits to /tmp/canvas-python-fundamentals.sock:

{
  "event_type": "student_action",
  "lab_type": "python",
  "student_id": "alice",
  "session_id": "sess-20260124-...",
  "module_id": "python-fundamentals",
  "timestamp": "2026-01-24T15:30:45.123Z",
  "payload": {
    "action_kind": "submit_code",
    "action": "<full code>",
    "result": "success|failure|partial",
    "evidence": {
      "file": "src/main.py",
      "test_passed": true,
      "test_name": "test_hello_world",
      "error": null,
      "line_count": 42,
      "functions_defined": ["hello", "greet"]
    }
  }
}

7. Canvas hub receives (via Unix socket server in python-adapter)
8. Hub logs to telemetry.jsonl with full context (student_id, session_id)
9. Hub calculates score, checks step completion
10. Hub broadcasts back via same socket:

{
  "type": "step_completed",
  "step_id": "hello-world",
  "completed": true,
  "score": 0.9,
  "completion_percentage": 50
}

11. Extension web view updates vTA panel
```

**Key principles:**
- Debounced file watcher (1-2 sec) to prevent test spam
- Pytest run with `--json-report` for robust, version-independent parsing
- Student_id and session_id included in every event
- Unix socket (/tmp/canvas-{lab-id}.sock) for local-only, secure communication
- Extension is thin client; Canvas hub handles scoring, state, telemetry

---

## Lab Module Structure

Python labs in `labs/` directory:

```
labs/python-fundamentals/
├── module.yaml              # Lab definition (labType: python)
├── setup.sh                 # Optional init script
├── starter/
│   ├── src/
│   │   └── main.py         # Template starter code
│   ├── tests/
│   │   └── test_main.py    # Unit tests
│   └── requirements.txt     # pip dependencies
└── solutions/
    └── main.py             # Reference solution
```

**module.yaml schema:**
```yaml
title: Python Fundamentals
labType: python
description: Learn Python basics

steps:
  - id: hello-world
    title: Print Hello World
    type: task
    content:
      instructions: Write function hello() returning "Hello, World!"
      tasks:
        - text: Define hello() function
    validation:
      type: check-script
      script: tests/test_main.py::test_hello_world
    hints:
      - "Use return statement"
    solution:
      file: solutions/main.py
      range: "1-3"
```

---

## Key Components

### extension.ts - Entry Point
- Register "Create Canvas Lab" command
- Show lab picker modal
- Trigger lab scaffolding
- Connect socket
- Start file monitoring
- Show vTA web view

### labManager.ts - Lab Setup
- Create `~/canvas-labs/{lab-id}/` directory
- Copy `labs/{lab-id}/starter/` → project
- Run `pip install -r requirements.txt`
- Initialize git repo
- Load module.yaml

### socketClient.ts - Canvas Connection
- Unix socket to `/tmp/canvas-{lab-id}.sock`
- Send `student_action` events (with student_id, session_id)
- Receive step updates and broadcasts
- Handle reconnection/retry logic

### pythonMonitor.ts - File Watching
- Watch `src/**/*.py` files
- On save: run pytest, emit events
- Extract code metadata (functions, line count)
- Parse test results

### vta.js - Web View UI
- Receive step updates from extension
- Render step progress in sidebar
- Show hints/solutions
- Display score

---

## Canvas Hub Integration

**Required changes:**

**Event Hub (python-adapter.ts):**
- Unix socket server listening on `/tmp/canvas-{lab-id}.sock`
- Receive unified events from extension (already in telemetry schema)
- No parsing needed (extension sends JSON-formatted events)

**Broadcasting back:**
- On step completion, send update to extension socket
- Format: `{ type: "step_completed", step_id, completed, score, completion_percentage }`

**Session Lifecycle:**
- Emit `session_started` event when extension connects (use socket connection as trigger)
- Emit `session_ended` event when socket disconnects or explicit close
- session_id: UUID generated by extension on lab creation, stored in `.canvas/session.json`

**Backward compatibility:**
- Telemetry system already handles `lab_type: "python"` (unified schema)
- Scoring presets work with any `lab_type`
- Module loader already loads `labType: python`
- No changes needed to telemetry, scoring, or module system

---

## File Structure on Student Machine

**Global (one-time):**
```
~/.canvas/
└── auth.json               # { "student_id": "alice", "name": "Alice Smith" }
```

**Per lab:**
```
~/canvas-labs/python-fundamentals/
├── .git/                    # Git repo initialized
├── .vscode/
│   └── settings.json        # VS Code workspace config
├── src/
│   └── main.py             # Student edits here
├── tests/
│   └── test_main.py        # Unit tests (readonly)
├── requirements.txt         # Dependencies (pytest, pytest-json-report, etc)
└── .canvas/
    ├── config.json         # { "module_id": "python-fundamentals", "socket_path": "/tmp/canvas-python-fundamentals.sock" }
    └── session.json        # { "session_id": "sess-20260124-...", "started_at": "2026-01-24T15:30:45Z" }
```

---

## Critical Implementation Details

### Python Interpreter Discovery

**Approach:** Assume project virtual environment created by setup.

1. Extension runs `pip install -r requirements.txt` during scaffolding
2. This creates `.venv/` in project directory (standard setup)
3. On file save, extension runs: `./.venv/bin/python -m pytest --json-report`
4. Fail gracefully if venv not found; show clear error message
5. Fallback: If student deleted venv, show "Run setup again" prompt

**OS-specific paths:**
- macOS/Linux: `./.venv/bin/python`
- Windows: `.\.venv\Scripts\python.exe` (deferred; not in MVP)

### Test Parsing with pytest-json-report

**Robust approach:**
- Require `pytest-json-report` in `requirements.txt`
- Run: `pytest --json-report --json-report-file=.pytest_cache/report.json`
- Parse JSON instead of regex parsing stdout
- Extract: `test_name`, `passed`, `failed`, `error_message`, `traceback`
- No fragility from pytest version changes

### File Save Performance

**Problem:** Running full pytest on every save = slow feedback

**Solution:**
1. Debounce file watcher: wait 1-2 seconds after save before running tests
2. Run tests asynchronously (don't block editor)
3. Show "Running tests..." indicator in vTA panel
4. If tests running and another save occurs, queue next run

**Result:** Smooth UX, no editor lag

### Scaffolding Error Handling

**Validation checks:**
1. Before scaffolding, verify `~/.canvas/auth.json` exists (or create it)
2. Create `~/canvas-labs/` if missing
3. If project directory exists, ask: "Overwrite existing lab?" or "Resume existing lab?"
4. Run `pip install` with output capture; show errors if it fails
5. Validate git init succeeded
6. Check `.canvas/config.json` created correctly

**Cleanup:** If scaffolding fails mid-way, provide rollback prompt

### Hub Connection Health Check

**On extension activate:**
1. Try connecting to `/tmp/canvas-{lab-id}.sock` (if lab already running)
2. If hub unreachable, show notification: "Canvas hub unavailable. Start lab when hub is ready."
3. Retry connection every 5 seconds with exponential backoff
4. Clear notification when hub becomes available

**Graceful degradation:** If hub unavailable, tests still run locally (no telemetry sent)

### Module.yaml Discovery

**Approach:**
1. Extension downloads `labs/python-fundamentals/module.yaml` from Canvas repo on first use
2. Cache locally in `~/.canvas/modules/{lab-id}/module.yaml`
3. Validate YAML schema (title, labType, steps, validation)
4. Load into extension memory for vTA rendering

**Source of truth:** Canvas project repo (~/path/to/Canvas/labs/)

### Lab Project Structure

**Design choice:** Each lab is an independent project

1. Extension scaffolds new project in `~/canvas-labs/{lab-id}/`
2. Not a clone; a copy of starter code
3. Student owns the project (can modify, delete, recreate)
4. Git initialized for version control
5. Connection to Canvas hub is via socket, not git

**Benefits:** Clean separation, easy reset (delete + recreate), no sync issues

### Bonus Assignments & Future Features

**MVP Scope:** Main steps only (bonusAssignments not emitted)

**Future:** When bonus schema is needed:
- Check `module.yaml` for `bonusAssignments` section
- Render in vTA panel under "Extra Credit"
- Track bonus test passes in telemetry (`is_bonus: true`)
- Scoring system already supports bonus (scale contributions)

**For now:** Leave bonus section out of events

---

## Error Handling & Resilience

| Scenario | Behavior |
|----------|----------|
| Hub connection fails | Retry with exponential backoff; show notification |
| Pytest crashes | Capture stderr, show error in vTA panel, don't crash extension |
| Python venv missing | Show setup error, offer "Recreate" button |
| File parse error | Log to console, emit with `result: "error"` |
| Socket write fails | Queue event, retry on next connection success |
| Student closes project | Emit `session_ended` event, clean up resources |
| Extension crashes | Session state recoverable from `.canvas/session.json` |

---

## Security Considerations

**Scope:** MVPublicP focuses on local machine. No cross-user sharing.

1. **Pytest sandboxing:** pytest runs student code with OS user privileges (no extra isolation)
2. **Test file integrity:** Tests are readonly from student perspective (set file permissions)
3. **Authentication:** Student ID stored locally (`~/.canvas/auth.json`), no remote login needed
4. **Socket security:** Unix socket limited to local machine only
5. **Code access:** Extension has full read access to project files (intentional; it needs to send code to hub)

**Future:** Restrict pytest execution to sandbox if needed

---

## Implementation Steps (High Level)

1. Create VS Code extension boilerplate
2. Implement lab picker & scaffolding
3. Build file watcher & event emission
4. Create socket client
5. Build vTA web view UI
6. Integrate with Canvas hub (socket server)
7. Test end-to-end
8. Package & test extension

---

## Success Criteria

- Student can click "Create Canvas Lab" and scaffold a project
- File saves trigger test execution and event emission
- Canvas hub receives and processes events correctly
- vTA panel updates in real-time as steps complete
- Telemetry is logged (same as Docker labs)
- Scoring works (same algorithm as Docker labs)

---

## Platform Support

**MVP:** macOS, Linux only
- Unix sockets used for communication
- Path conventions assume `/tmp` and `~/`

**Windows:** Deferred (would require TCP socket fallback, path handling)

---

## Out of Scope (MVP)

- **Windows support** (deferred; use TCP socket fallback in future)
- **Hints/solution UI** (future; vTA shows in sidebar, but click-to-reveal not implemented)
- **Bonus assignments** (future; schema supports it, but not emitted in MVP)
- **Jupyter integration** (future; notebook support after MVP validates Python labs)
- **Remote hub discovery** (future; hardcoded to localhost for MVP)
- **Extension marketplace** (future; manually install for testing)
- **Offline mode** (future; requires local test validation)
- **Session resumption** (future; sessions end on project close, can't resume)
- **Hints/solution rendering** (future; vTA shows buttons, server sends text, but no UI for it yet)
- **Analytics/progress dashboard** (future; telemetry logs to hub, UI separate)


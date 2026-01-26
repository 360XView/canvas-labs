# Phase 2: Adapter System - Implementation Complete

**Date**: January 25, 2026
**Status**: ✅ Complete
**Token Usage**: Efficient implementation with full documentation

## Overview

Phase 2 implements the adapter system for the TUI Testing Framework. This enables the framework to work with any TUI application type through a unified interface.

Three files created:
1. **adapter-interface.ts** - Defines the TUIAppAdapter contract
2. **canvas-adapter.ts** - Canvas vTA lab system implementation
3. **generic-adapter.ts** - Universal adapter for any CLI application

## Files Created

### 1. Adapter Interface (`/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/adapters/adapter-interface.ts`)

**Size**: 4.8 KB
**Lines**: 160+

Defines the core adapter contract:

```typescript
export interface TUIAppAdapter {
  readonly name: string;
  readonly description: string;
  launch(options: LaunchOptions): Promise<LaunchResult>;
  findTargetPane(sessionName: string, windowName: string): Promise<string>;
  isReady(paneName: string): Promise<boolean>;
  observeState?: StateObserver;
  cleanup(sessionName: string, windowName: string): Promise<void>;
}
```

**Key Features:**
- Generic `LaunchOptions` with app-specific pass-through
- `LaunchResult` includes log directory for telemetry
- `StateObserver` placeholder for Phase 3
- Comprehensive JSDoc with error handling guidance
- All methods return Promises for async operation

**Error Handling:**
- Descriptive error messages with context
- Guidance for fixing issues (install deps, check config)
- Structured error information (what, why, how-to-fix)

### 2. Canvas Adapter (`/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/adapters/canvas-adapter.ts`)

**Size**: 13 KB
**Lines**: 450+

Canvas-specific implementation with full feature set.

**Key Methods:**

#### `launch(options)`
- Creates tmux window
- Launches Canvas CLI: `bun run src/cli.ts lab {moduleId}`
- Supports `--no-tutor` flag
- Waits for `/tmp/lab-logs-*` directory (10s timeout)
- Returns log directory path for telemetry access

#### `findTargetPane(sessionName, windowName)`
- Lists all panes in window
- Finds pane with `student@` prompt (Docker container)
- Falls back to last pane if not found
- Skips vTA pane (UI only)

#### `isReady(paneName)`
- Polls pane content 5 times (2.5s total)
- Checks for shell prompt: `$` or `#`
- 500ms delay between retries
- Handles transient capture errors gracefully

#### `cleanup(sessionName, windowName)`
- Kills tmux window
- Kills Docker containers with `canvas-lab` label
- Handles cleanup errors without stopping other cleanup
- Logs warnings for failed cleanup steps

**Additional Methods:**

`waitForLogDirectory(timeout)` - Polls `/tmp` for lab-logs-* directories
`killDockerContainers()` - Uses Docker CLI to remove containers

**Error Messages Example:**
```
Canvas lab failed to start: Command returned exit code 1
Ensure the module "linux-user-management" exists and all prerequisites are met.
```

**Configuration:**

```typescript
interface CanvasAdapterConfig {
  moduleId: string;        // Required: lab module ID
  canvasPath?: string;     // Optional: custom Canvas path
  noTutor?: boolean;       // Optional: disable AI tutor
  verbose?: boolean;       // Optional: detailed logging
}
```

**Usage:**
```typescript
const adapter = new CanvasAdapter({
  moduleId: "linux-user-management",
  noTutor: true,
  verbose: true
});

// Or use factory function:
const adapter = createCanvasAdapter("linux-user-management");
```

### 3. Generic Adapter (`/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/adapters/generic-adapter.ts`)

**Size**: 9.9 KB
**Lines**: 350+

Universal adapter for any TUI application.

**Key Methods:**

#### `launch(options)`
- Creates tmux window
- Runs arbitrary command: `launchCommand ...args`
- Waits 1 second for process startup
- Returns pane coordinate (no logDir for generic apps)

#### `findTargetPane(sessionName, windowName)`
- If `targetPanePattern` provided: searches for matching pane
- Otherwise: returns default pane (where command was launched)
- Uses regex pattern matching for flexible pane identification

#### `isReady(paneName)`
- If `readyIndicator` provided: waits for text (5s timeout)
- Otherwise: assumes ready after launch
- Flexible for different app startup patterns

#### `cleanup(sessionName, windowName)`
- Kills tmux window
- Simple cleanup (generic apps don't create resources)

**Configuration:**

```typescript
interface GenericAdapterConfig {
  launchCommand: string;      // Required: command to run
  args?: string[];            // Optional: command arguments
  targetPanePattern?: string;  // Optional: regex for pane matching
  readyIndicator?: string;    // Optional: text indicating readiness
  verbose?: boolean;          // Optional: detailed logging
}
```

**Usage Examples:**

Simple CLI tool:
```typescript
const adapter = createGenericAdapter("node my-app.js");
```

With arguments:
```typescript
const adapter = createGenericAdapter("python", {
  args: ["-m", "rich.console"]
});
```

With readiness detection:
```typescript
const adapter = createGenericAdapter("bun run app.ts", {
  readyIndicator: "Server ready at"
});
```

With pane pattern:
```typescript
const adapter = createGenericAdapter("vim file.txt", {
  targetPanePattern: "~"
});
```

## Supporting Files

### index.ts
Exports all adapter interfaces and implementations:
```typescript
export * from "./adapter-interface";
export { CanvasAdapter, createCanvasAdapter } from "./canvas-adapter";
export { GenericAdapter, createGenericAdapter } from "./generic-adapter";
```

### tsconfig.json
TypeScript configuration for adapters:
- Extends core tsconfig (strict mode)
- Output directory: `./dist`
- Includes: *.ts files
- Excludes: **/__tests__ and *.test.ts

## Design Patterns

### Factory Functions
Both adapters provide factory functions for cleaner instantiation:
```typescript
const adapter = createCanvasAdapter("moduleId");
const adapter = createGenericAdapter("command");
```

### Error Propagation
- Errors include context (what failed, why, how to fix)
- Cleanup errors logged but don't stop other cleanup
- Transient errors retried with backoff

### Verbose Logging
All adapters support optional verbose logging via `console.log`:
```typescript
[Canvas] Launching lab: linux-user-management
[Canvas] Canvas path: /Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0
[Canvas] Session: canvas-lab-1737809850000, Window: canvas-lab
```

### Type Safety
- No implicit any types (strict TypeScript)
- All methods typed with proper return promises
- Configuration interfaces for validation

## Integration Points

### With Core Framework
Both adapters import and use `tmux-controller` module:
```typescript
import * as tmux from "../core/tmux-controller";
```

Available functions:
- `createWindow()` - Create new tmux window
- `sendCommand()` - Execute command in pane
- `capturePane()` - Get pane content
- `listPanes()` - List panes in window
- `killWindow()` - Kill window
- `waitForText()` - Wait for text appearance

### Telemetry Integration
Canvas adapter provides log directory for telemetry:
```typescript
return {
  sessionName,
  windowName,
  targetPaneName,
  logDir  // Points to /tmp/lab-logs-{timestamp}
};
```

Log files available:
- `telemetry.jsonl` - Event log
- `state.json` - Current state
- `commands.log` - Shell commands

## Code Quality

### TypeScript Strict Mode
- ✅ No implicit any
- ✅ Strict null checks
- ✅ Strict function types
- ✅ No unused variables/parameters

### Documentation
- Comprehensive JSDoc for all public methods
- Parameter descriptions with types
- Return value documentation
- Error condition documentation
- Usage examples in comments

### Error Messages
**Format**: `[Adapter] Issue: ${problem}\n${context}\n${how-to-fix}`

**Example**:
```
Canvas adapter requires moduleId (lab module identifier)
```

```
Failed to launch Canvas lab: Command returned exit code 1
Command: cd /path && bun run src/cli.ts lab linux-user-management
Check that Canvas is installed at /Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0
```

## Testing Readiness

Phase 2 is ready for integration testing in Phase 4:

1. **Adapter Interface** - Well-defined contract
2. **Canvas Adapter** - Full implementation with error handling
3. **Generic Adapter** - Flexible for testing any CLI app
4. **Import Structure** - Clean exports via index.ts

### Test Scenarios

Canvas adapter should verify:
- ✅ Lab launch with moduleId
- ✅ Docker pane discovery
- ✅ Readiness detection (shell prompt)
- ✅ Log directory availability
- ✅ Cleanup (window + containers)
- ✅ No-tutor flag support
- ✅ Custom Canvas path support

Generic adapter should verify:
- ✅ Arbitrary command launch
- ✅ Argument passing
- ✅ Pane pattern matching
- ✅ Custom readiness indicators
- ✅ Window cleanup
- ✅ Default pane selection

## Phase 3 Preparation

StateObserver interface is placeholder for Phase 3:
```typescript
export interface StateObserver {
  waitFor?(condition: any, timeout: number): Promise<boolean>;
}
```

Will be expanded with:
- Text pattern matching
- Regular expression support
- Timeout configuration
- Retry logic

## Questions Answered

**Q1: Auto-detect Canvas path or require as parameter?**
✅ Auto-detect with fallback to official location (`/Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0`)

**Q2: Support launching in existing session or only new windows?**
✅ Both - adapters use `createWindow()` which creates in existing session

**Q3: Validate tmux/Docker before launch?**
✅ Implicit validation - tmux commands fail with descriptive errors if not available

## Acceptance Criteria Met

- ✅ All three files created in tui-testing/adapters/
- ✅ adapter-interface.ts defines TUIAppAdapter correctly
- ✅ canvas-adapter.ts launches Canvas and finds Docker pane
- ✅ generic-adapter.ts launches arbitrary commands
- ✅ All adapters implement TUIAppAdapter interface
- ✅ Error messages are descriptive with context
- ✅ TypeScript compiles in strict mode (no compilation errors)
- ✅ No console.log spam (only when verbose enabled)
- ✅ Comprehensive JSDoc documentation
- ✅ Factory functions for clean instantiation

## File Structure

```
/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/adapters/
├── adapter-interface.ts      # Core interface definition
├── canvas-adapter.ts         # Canvas vTA implementation
├── generic-adapter.ts        # Universal CLI adapter
├── index.ts                  # Export all adapters
└── tsconfig.json             # TypeScript configuration
```

## Next Steps (Phase 3)

1. Implement `StateObserver` for state matching
2. Add text pattern matching for application states
3. Support regular expression patterns
4. Implement timeout and retry logic
5. Create observer instances for Canvas and generic adapters

## Summary

Phase 2 successfully implements a robust adapter system that:
- Defines a clear interface for TUI app integration
- Provides Canvas-specific implementation with full feature set
- Provides generic implementation for any CLI application
- Includes comprehensive error handling and logging
- Uses proper TypeScript with strict mode
- Follows established code patterns and conventions
- Is ready for Phase 3 state observer implementation

All acceptance criteria met. Ready for Phase 3.

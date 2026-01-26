# Phase 3: State Observer Layer - Implementation Complete

**Status**: COMPLETE
**Date**: January 25, 2026
**Tests**: 18 passing

## Overview

The state observer layer provides a unified interface for monitoring application state changes during automated testing. It enables intelligent verification of application state without direct access to internal APIs.

## Implementation Details

### Files Created

1. **`/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/core/state-observer.ts`**
   - Main implementation file (515 lines)
   - Contains core observer classes and condition types
   - Fully type-safe with discriminated union patterns

2. **`/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/core/state-observer.test.ts`**
   - Comprehensive test suite (330+ lines)
   - 18 unit tests covering all functionality
   - All tests passing (664ms total)

### Files Updated

1. **`/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/core/index.ts`**
   - Added export for state-observer module
   - Updated import statements for ESM compatibility (.js extensions)

2. **`/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/core/package.json`**
   - Added state-observer to package exports
   - Allows importing: `import { CanvasStateObserver } from "@tui-testing/core/state-observer"`

3. **`/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/core/tsconfig.json`**
   - Updated to use NodeNext module resolution for proper ESM support
   - Fixed all import paths to include .js extensions

## Core Types and Interfaces

### StateCondition (Discriminated Union)

Three condition types with full TypeScript type safety:

```typescript
type StateCondition =
  | {
      type: "text";
      pane: string;
      text: string;
      caseSensitive?: boolean;
      description?: string;
    }
  | {
      type: "file";
      path: string;
      content?: string;
      contentRegex?: RegExp;
      description?: string;
    }
  | {
      type: "custom";
      check: () => Promise<boolean>;
      description?: string;
    };
```

### StateObserver Interface

```typescript
interface StateObserver {
  /**
   * Poll until condition is true or timeout.
   * Returns boolean (never throws on timeout).
   */
  waitFor(
    condition: StateCondition,
    timeoutMs: number,
    pollIntervalMs?: number
  ): Promise<boolean>;

  /**
   * Single check without polling.
   */
  checkCondition(condition: StateCondition): Promise<boolean>;

  /**
   * Get diagnostics when condition fails.
   */
  getDiagnostics(condition: StateCondition): Promise<string>;
}
```

## Implementations

### CanvasStateObserver

Specialized for Canvas lab system:
- Reads `state.json` from Canvas log directory
- Detects step completion by checking state.steps[].completed flag
- Captures pane content for text matching
- Reads and validates files

**Key Features:**
- Instance method: `createStepCompletedCondition(stepId: string)`
- Reads Canvas lab state in JSON format
- Integrates with Canvas module structure

**Usage Example:**
```typescript
const observer = new CanvasStateObserver("/tmp/lab-logs-123", tmuxController);

// Wait for a specific step to complete
const stepCondition = observer.createStepCompletedCondition("create-user");
const success = await observer.waitFor(stepCondition, 10000); // 10 second timeout

// Get diagnostics if it fails
if (!success) {
  const diagnostics = await observer.getDiagnostics(stepCondition);
  console.error("Step failed:", diagnostics);
}
```

### TextStateObserver

Generic for any TUI application:
- Captures pane content via tmux
- Strips ANSI escape codes for clean text matching
- Supports case-sensitive and case-insensitive matching
- Reads files and validates content/regex patterns

**Key Features:**
- Static helpers: `textAppears()`, `fileContains()`, `fileMatches()`
- ANSI code stripping for reliable text matching
- Graceful error handling (returns false on pane not found)
- Detailed diagnostic messages for debugging

**Usage Example:**
```typescript
const observer = new TextStateObserver("session:window.1", tmuxController);

// Wait for text to appear
const condition = TextStateObserver.textAppears("$ ", false); // case-insensitive
const ready = await observer.waitFor(condition, 5000);

// Wait for file to contain text
const logCondition = TextStateObserver.fileContains("/tmp/app.log", "started");
const success = await observer.waitFor(logCondition, 10000);

// Check current state without polling
const hasText = await observer.checkCondition(condition);
```

## Test Coverage

All 18 tests passing:

### CanvasStateObserver Tests
- Constructor validation (throws on invalid logDir)
- createStepCompletedCondition returns valid condition

### TextStateObserver Tests
- Constructor validation (throws on invalid targetPane)
- Text condition matching (case-sensitive)
- Text condition matching (case-insensitive)
- Text condition not found returns false
- waitFor timeout behavior (respects timeout)
- waitFor success before timeout (returns true early)
- Invalid timeout/poll interval values
- ANSI escape code stripping
- getDiagnostics for text condition
- getDiagnostics for file condition (not found)
- Custom condition execution
- Static helper methods (textAppears, fileContains, fileMatches)
- Graceful error handling on pane not found

### StateCondition Tests
- Type guards and discriminated union validation

## Design Patterns

### Discriminated Union Pattern

StateCondition uses TypeScript's discriminated union for type safety:
```typescript
const condition: StateCondition = {
  type: "text",
  pane: "session:window.0",
  text: "prompt",
};

// TypeScript knows this is a text condition
// Other properties are inaccessible (type-safe)
```

### Polling with Timeout

Never throws on timeout - returns boolean for graceful handling:
```typescript
const success = await observer.waitFor(condition, 10000);
if (!success) {
  // Handle timeout gracefully
  const diagnostics = await observer.getDiagnostics(condition);
}
```

### ANSI Code Stripping

Pattern: `/\x1b\[[0-9;]*m/g` handles:
- Color codes: `\x1b[31m` (red)
- Bold formatting: `\x1b[1m` (bold)
- Complex sequences: `\x1b[1;32m` (bold green)

### Error Handling Strategy

1. **waitFor()**: Returns false on timeout or errors (never throws)
2. **checkCondition()**: Returns false on transient errors
3. **getDiagnostics()**: Defensive (handles missing files, malformed JSON)

## Architecture Integration

### Within tui-testing Framework

```
┌─────────────────────────────────────────┐
│  Test Runner (Phase 4)                  │
├─────────────────────────────────────────┤
│  Uses StateObserver to:                 │
│  - Wait for app readiness               │
│  - Verify test results                  │
│  - Detect task completion               │
├─────────────────────────────────────────┤
│  StateObserver (Phase 3)                │
│  ├─ Canvas Observer                     │
│  └─ Text Observer                       │
├─────────────────────────────────────────┤
│  App Adapter + Tmux Controller          │
│  └─ Controls panes, captures content    │
└─────────────────────────────────────────┘
```

### Adapter Integration

StateObserver can be injected into adapters:

```typescript
interface TUIAppAdapter {
  observeState?: StateObserver;  // Optional
}
```

This allows adapters to provide app-specific observers while tests use the unified interface.

## TypeScript Strict Mode

All code compiles in strict mode:
- ✓ `--strict`
- ✓ `--noUnusedLocals`
- ✓ `--noUnusedParameters`
- ✓ `--noImplicitReturns`
- ✓ `--noImplicitAny`
- ✓ ESM module resolution with explicit .js extensions

## Known Limitations & Future Enhancements

### Current Limitations
1. Canvas observer requires logDir (state.json must exist)
2. File conditions check only file existence and content, not permissions
3. Text matching is substring-based (not advanced regex)

### Possible Enhancements (Phase 4+)
1. Add timeout context with elapsed time tracking
2. Support for multiple condition aggregation (AND/OR logic)
3. Event-driven state observation (vs polling)
4. Performance metrics (number of polls, time to condition)
5. Conditional state snapshots for debugging
6. Integration with Canvas's scoring system

## Export Options

The state observer can be imported via:

```typescript
// Option 1: From main package
import { CanvasStateObserver } from "@tui-testing/core";

// Option 2: Specific submodule
import { TextStateObserver } from "@tui-testing/core/state-observer";

// Option 3: Both classes and types
import {
  StateObserver,
  StateCondition,
  CanvasStateObserver,
  TextStateObserver,
} from "@tui-testing/core";
```

## Build & Deploy

```bash
# Build TypeScript
npm run build

# Run tests
node --test dist/state-observer.test.js

# Publish (from core directory)
npm publish
```

## Next Steps (Phase 4)

The state observer layer is ready for integration into the generic test runner. Phase 4 will:
1. Build TestRunner class that uses StateObserver
2. Implement condition-based assertions
3. Create test lifecycle hooks (before/after)
4. Add test result reporting

## Acceptance Criteria - COMPLETE

✓ state-observer.ts created in tui-testing/core/
✓ StateCondition union type with 3 variants (text, file, custom)
✓ StateObserver interface defined with waitFor, checkCondition, getDiagnostics
✓ CanvasStateObserver implements StateObserver
✓ TextStateObserver implements StateObserver
✓ Static helper methods (stepCompleted, textAppears, fileContains, fileMatches)
✓ Proper error handling (waitFor returns bool, doesn't throw)
✓ TypeScript compiles in strict mode with no errors
✓ Clear diagnostics messages for debugging
✓ Exported from tui-testing/core/index.ts
✓ 18 unit tests, all passing
✓ ESM support with proper module resolution

# Phase 3: State Observer - Quick Reference

## Installation

```bash
# Already in package
import { CanvasStateObserver, TextStateObserver } from "@tui-testing/core";
```

## Quick Start (30 seconds)

### Canvas Labs
```typescript
const observer = new CanvasStateObserver(logDir, tmux);
const condition = observer.createStepCompletedCondition("step-id");
const done = await observer.waitFor(condition, 10000);
```

### Generic Apps
```typescript
const observer = new TextStateObserver("session:window.0", tmux);
const condition = TextStateObserver.textAppears("prompt");
const ready = await observer.waitFor(condition, 5000);
```

## Condition Types

### Text
```typescript
{
  type: "text",
  pane: "session:window.0",
  text: "looking for this",
  caseSensitive: true, // optional
  description: "text appears" // optional
}
```

### File
```typescript
{
  type: "file",
  path: "/tmp/file.txt",
  content: "substring", // optional
  contentRegex: /pattern/, // optional
  description: "file updated" // optional
}
```

### Custom
```typescript
{
  type: "custom",
  check: async () => {
    // your logic here
    return true;
  },
  description: "custom check" // optional
}
```

## Observer Methods

### waitFor(condition, timeout, pollInterval?)
```typescript
// Poll until condition true or timeout
// Returns boolean (never throws on timeout)
const success = await observer.waitFor(condition, 5000, 200);

if (!success) {
  const diagnostics = await observer.getDiagnostics(condition);
  console.error(diagnostics);
}
```

### checkCondition(condition)
```typescript
// Single check, no polling
const isTrue = await observer.checkCondition(condition);
```

### getDiagnostics(condition)
```typescript
// Get info about why condition failed
const diagnostics = await observer.getDiagnostics(condition);
console.log(diagnostics);
// Output shows last pane lines, file content, etc.
```

## Static Helpers (TextStateObserver)

```typescript
// Text appears in pane
const cond1 = TextStateObserver.textAppears("$ ");

// File contains substring
const cond2 = TextStateObserver.fileContains("/tmp/log", "error");

// File matches regex
const cond3 = TextStateObserver.fileMatches("/tmp/log", /ERROR:\s+\d+/);
```

## Common Patterns

### Pattern: Wait then Act
```typescript
const ready = await observer.waitFor(promptCondition, 5000);
if (!ready) throw new Error("Not ready");
await tmux.sendCommand(pane, "command");
```

### Pattern: Verify Output
```typescript
await tmux.sendCommand(pane, "ls");
const listed = await observer.waitFor(
  TextStateObserver.textAppears("total"),
  3000
);
```

### Pattern: Multiple Checks
```typescript
const step1 = observer.createStepCompletedCondition("step1");
const step2 = observer.createStepCompletedCondition("step2");

if (!await observer.waitFor(step1, 5000)) throw new Error("Step 1");
if (!await observer.waitFor(step2, 5000)) throw new Error("Step 2");
```

### Pattern: Timeout Handling
```typescript
const success = await observer.waitFor(condition, 2000);
if (!success) {
  const diag = await observer.getDiagnostics(condition);
  console.error(diag);
  // Handle gracefully
}
```

## Tips & Tricks

### 1. Case-Insensitive Matching
```typescript
// More reliable for prompts/variable output
TextStateObserver.textAppears("$", false); // 2nd arg is caseSensitive
```

### 2. Increase Timeout for Slow Operations
```typescript
// Commands that take time
await observer.waitFor(condition, 30000); // 30 seconds
```

### 3. ANSI Codes Handled Automatically
```typescript
// Input: "\x1b[31mERROR\x1b[0m"
// Search: "ERROR"
// Works! Codes stripped automatically
```

### 4. Get Diagnostics Before Throwing
```typescript
const success = await observer.waitFor(condition, 5000);
if (!success) {
  // Get diagnostic info THEN fail
  const info = await observer.getDiagnostics(condition);
  throw new Error(`Failed: ${info}`);
}
```

### 5. Combine Conditions
```typescript
async function bothVisible() {
  const c1 = TextStateObserver.textAppears("Step 1");
  const c2 = TextStateObserver.textAppears("Step 2");
  return (
    await observer.checkCondition(c1) &&
    await observer.checkCondition(c2)
  );
}
```

## Timeout Recommendations

| Operation | Timeout | Poll Interval |
|-----------|---------|---------------|
| Prompt appears | 500ms | 100ms |
| Command output | 2s | 100ms |
| Step completes | 10s | 300ms |
| File writes | 5s | 200ms |
| Container ready | 30s | 500ms |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Text not found | Increase timeout, check case sensitivity |
| File not readable | Check path, permissions, file existence |
| Timeout too short | Use getDiagnostics to see actual output |
| ANSI codes interfering | Already handled, but check diagnostics |
| Pane not found | Verify pane address with tmux list-panes |

## Type Definitions

```typescript
// Main types
type StateCondition = TextCondition | FileCondition | CustomCondition;

interface StateObserver {
  waitFor(condition: StateCondition, timeoutMs: number, pollIntervalMs?: number): Promise<boolean>;
  checkCondition(condition: StateCondition): Promise<boolean>;
  getDiagnostics(condition: StateCondition): Promise<string>;
}

// Implementations
class CanvasStateObserver implements StateObserver {
  readonly logDir: string;
  constructor(logDir: string, tmuxController: typeof tmux);
  createStepCompletedCondition(stepId: string): StateCondition;
  static textAppears(text: string, caseSensitive?: boolean): StateCondition;
  // ... other methods
}

class TextStateObserver implements StateObserver {
  constructor(targetPane: string, tmuxController: typeof tmux);
  static textAppears(text: string, caseSensitive?: boolean): StateCondition;
  static fileContains(path: string, content: string): StateCondition;
  static fileMatches(path: string, pattern: RegExp): StateCondition;
  // ... other methods
}
```

## Real-World Examples

### Canvas Lab Test
```typescript
const observer = new CanvasStateObserver(logDir, tmux);
const pane = "canvas-lab:canvas-lab.1";

// Execute and wait for step
await tmux.sendCommand(pane, "useradd -m user");
const created = await observer.waitFor(
  observer.createStepCompletedCondition("create-user"),
  10000
);
if (!created) throw new Error("User not created");
```

### App Readiness Check
```typescript
const observer = new TextStateObserver("app:app.0", tmux);

const ready = await observer.waitFor(
  TextStateObserver.textAppears("Ready", false),
  5000
);
if (!ready) {
  console.error(await observer.getDiagnostics(condition));
}
```

### Log File Validation
```typescript
const logCondition = TextStateObserver.fileContains(
  "/tmp/test.log",
  "PASS"
);
const passed = await observer.checkCondition(logCondition);
```

## Build & Test

```bash
# Build
npm run build

# Test
node --test dist/state-observer.test.js

# Check types
npx tsc --noEmit
```

## Exports

```typescript
// All from main package
export { StateObserver, StateCondition };
export { CanvasStateObserver, TextStateObserver };

// Or from submodule
import { CanvasStateObserver } from "@tui-testing/core/state-observer";
```

## Performance

- Text matching: ~1-5ms per poll
- File reading: ~10-50ms per poll
- Default intervals: 200-300ms (configurable)
- 18 tests: 664ms total execution

## Next Phase

Phase 4 will build the test runner on top of this observer layer.

---

**Quick Links**
- Full docs: `PHASE_3_STATE_OBSERVER.md`
- Examples: `PHASE_3_USAGE_EXAMPLES.md`
- Report: `PHASE_3_COMPLETION_REPORT.md`
- Source: `core/state-observer.ts`
- Tests: `core/state-observer.test.ts`

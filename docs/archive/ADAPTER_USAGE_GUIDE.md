# TUI Testing Framework - Adapter Usage Guide

Quick reference for using the adapter system implemented in Phase 2.

## Quick Start

### Import Adapters

```typescript
import {
  TUIAppAdapter,
  LaunchOptions,
  LaunchResult,
  CanvasAdapter,
  createCanvasAdapter,
  GenericAdapter,
  createGenericAdapter,
} from "./adapters";
```

## Canvas Adapter

For testing Canvas labs.

### Basic Usage

```typescript
import { createCanvasAdapter } from "./adapters";

// Create adapter
const adapter = createCanvasAdapter("linux-user-management");

// Launch lab
const result = await adapter.launch({
  sessionName: "my-test-session",
  windowName: "test-lab",
  verbose: true,
});

// Find target pane (Docker container)
const targetPane = await adapter.findTargetPane(
  result.sessionName,
  result.windowName
);

// Check readiness
const ready = await adapter.isReady(targetPane);

// Send command
if (ready) {
  await tmux.sendCommand(targetPane, "sudo su");
}

// Clean up
await adapter.cleanup(result.sessionName, result.windowName);
```

### Options

```typescript
// Disable AI tutor pane
const adapter = createCanvasAdapter("linux-user-management", {
  noTutor: true,
});

// Custom Canvas installation path
const adapter = createCanvasAdapter("linux-user-management", {
  canvasPath: "/custom/path/to/canvas",
});

// Enable verbose logging
const adapter = createCanvasAdapter("linux-user-management", {
  verbose: true,
});
```

### Accessing Lab Logs

```typescript
const result = await adapter.launch({});

// result.logDir contains path to /tmp/lab-logs-{timestamp}
// Available files:
//   - telemetry.jsonl: Event log
//   - state.json: Current state
//   - commands.log: Shell commands

const logDir = result.logDir; // e.g., "/tmp/lab-logs-1737809850000"
```

### Supported Lab Modules

Canvas labs available:
- `linux-user-management` - User and permission management
- `shell-navigation` - Filesystem navigation
- `shell-file-operations` - File reading and searching
- `shell-text-processing` - sed, awk, sort, uniq
- `shell-find-files` - find command usage
- `shell-bash-scripting` - Variables, conditionals, loops
- `shell-log-analysis` - Real-world log analysis

## Generic Adapter

For testing any TUI application.

### Basic Usage

```typescript
import { createGenericAdapter } from "./adapters";

// Create adapter
const adapter = createGenericAdapter("node my-app.js");

// Launch app
const result = await adapter.launch({
  sessionName: "my-test",
  windowName: "app",
});

// Get target pane
const targetPane = result.targetPaneName;

// Check readiness
const ready = await adapter.isReady(targetPane);

// Send command
await tmux.sendCommand(targetPane, "help");

// Clean up
await adapter.cleanup(result.sessionName, result.windowName);
```

### With Arguments

```typescript
const adapter = createGenericAdapter("python", {
  args: ["-m", "rich.console"],
});

// Equivalent to: python -m rich.console
```

### With Readiness Detection

```typescript
const adapter = createGenericAdapter("bun run app.ts", {
  readyIndicator: "Server ready at",
});

// isReady() will wait for "Server ready at" text (5s timeout)
```

### With Pane Pattern Matching

```typescript
const adapter = createGenericAdapter("vim file.txt", {
  targetPanePattern: "~", // Match pane containing "~"
});

// findTargetPane() will search for pane with "~" in content
```

### Full Configuration

```typescript
const adapter = createGenericAdapter("custom-cli", {
  args: ["--interactive", "--debug"],
  targetPanePattern: "input>",      // Find pane with "input>"
  readyIndicator: "Type 'help'",    // Wait for this text
  verbose: true,                     // Log operations
});
```

## Common Patterns

### Testing a Command Sequence

```typescript
async function testCommandSequence(adapter: TUIAppAdapter) {
  // Launch
  const result = await adapter.launch({ verbose: true });
  const pane = result.targetPaneName;

  try {
    // Wait for readiness
    if (!(await adapter.isReady(pane))) {
      throw new Error("Application not ready");
    }

    // Execute commands
    await tmux.sendCommand(pane, "command1");
    await tmux.waitForText(pane, "expected output", 5000);

    await tmux.sendCommand(pane, "command2");
    // Verify state...

    console.log("Test passed!");
  } finally {
    // Always cleanup
    await adapter.cleanup(result.sessionName, result.windowName);
  }
}
```

### Testing with Telemetry

```typescript
async function testWithTelemetry(moduleId: string) {
  const adapter = createCanvasAdapter(moduleId);
  const result = await adapter.launch();
  const pane = result.targetPaneName;

  try {
    // Run test commands...
    await tmux.sendCommand(pane, "useradd testuser");
    await tmux.waitForText(pane, "$", 2000);

    // Access telemetry
    if (result.logDir) {
      const telemetryLog = `${result.logDir}/telemetry.jsonl`;
      // Read and analyze events...
    }
  } finally {
    await adapter.cleanup(result.sessionName, result.windowName);
  }
}
```

### Testing Generic App with Custom Readiness

```typescript
async function testCustomApp() {
  const adapter = createGenericAdapter("my-app --mode interactive", {
    readyIndicator: "awaiting input",
    verbose: true,
  });

  const result = await adapter.launch();

  try {
    // Wait for app to be ready
    if (!(await adapter.isReady(result.targetPaneName))) {
      throw new Error("App startup timeout");
    }

    // App is now ready for interaction
    await tmux.sendCommand(result.targetPaneName, "process data");
  } finally {
    await adapter.cleanup(result.sessionName, result.windowName);
  }
}
```

## Error Handling

### Launch Errors

```typescript
try {
  const result = await adapter.launch();
} catch (error) {
  if (error instanceof Error) {
    console.error(`Launch failed: ${error.message}`);
    // Error includes:
    // - What failed (launch, setup, environment)
    // - Why (missing prerequisite, command error)
    // - How to fix (install dependency, check config)
  }
}
```

### Cleanup Errors

Adapters continue cleanup even if one step fails:

```typescript
// Canvas adapter:
// 1. Kill tmux window
// 2. Kill Docker containers
// Errors in step 1 don't stop step 2

// Errors are logged but don't throw
```

### Readiness Timeout

```typescript
const ready = await adapter.isReady(pane);
if (!ready) {
  console.error("Application not ready after timeout");
  // Canvas: 5 retries × 500ms = 2.5s
  // Generic: 5s timeout
}
```

## Adapter Interface Reference

All adapters implement `TUIAppAdapter`:

```typescript
interface TUIAppAdapter {
  readonly name: string;
  readonly description: string;

  launch(options: LaunchOptions): Promise<LaunchResult>;
  findTargetPane(sessionName: string, windowName: string): Promise<string>;
  isReady(paneName: string): Promise<boolean>;
  observeState?: StateObserver; // For Phase 3
  cleanup(sessionName: string, windowName: string): Promise<void>;
}
```

### LaunchOptions

```typescript
interface LaunchOptions {
  sessionName?: string;    // Generated if not provided
  windowName?: string;     // Generated if not provided
  verbose?: boolean;       // Enable detailed logging
  [key: string]: any;      // App-specific options
}
```

### LaunchResult

```typescript
interface LaunchResult {
  sessionName: string;     // tmux session name
  windowName: string;      // tmux window name
  targetPaneName: string;  // pane to use for commands
  logDir?: string;         // Log directory (Canvas only)
}
```

## Tips and Tricks

### Verbose Logging

Enable to debug adapter behavior:

```typescript
const adapter = createCanvasAdapter("moduleId", { verbose: true });
// Logs:
// [Canvas] Launching lab: moduleId
// [Canvas] Canvas path: ...
// [Canvas] Session: ..., Window: ...
// etc.
```

### Custom Session Names

Useful for running multiple tests:

```typescript
const session1 = await adapter1.launch({ sessionName: "test-1" });
const session2 = await adapter2.launch({ sessionName: "test-2" });
```

### Pane Finding Strategies

Canvas (automatic):
- Finds pane with `student@` prompt
- Falls back to last pane

Generic (flexible):
- Default: use pane 0 (where command launched)
- With pattern: search all panes

### Readiness Detection Patterns

Canvas (built-in):
- Looks for `$` or `#` shell prompt
- Retries 5 times with 500ms delays

Generic (customizable):
- No readyIndicator: assume ready after launch
- With readyIndicator: wait for text
- With pattern: use for pane matching

## Advanced Usage

### Chaining Adapters

Run multiple apps in sequence:

```typescript
const canvas = createCanvasAdapter("linux-user-management");
const generic = createGenericAdapter("logger");

// Test Canvas
const result1 = await canvas.launch();
await testCanvasLab(result1);
await canvas.cleanup(result1.sessionName, result1.windowName);

// Then test generic app
const result2 = await generic.launch();
await testGenericApp(result2);
await generic.cleanup(result2.sessionName, result2.windowName);
```

### Factory Function Pattern

Create adapter factories for testing:

```typescript
function createTestAdapter(testType: "canvas" | "generic", config: any) {
  if (testType === "canvas") {
    return createCanvasAdapter(config.moduleId, {
      noTutor: true,
      verbose: config.debug,
    });
  } else {
    return createGenericAdapter(config.command, {
      args: config.args,
      readyIndicator: config.ready,
      verbose: config.debug,
    });
  }
}
```

## Next Steps

Once adapters are working:
1. Phase 3: Implement StateObserver for state matching
2. Phase 4: Build generic test runner
3. Phase 5: Build TUI tester agent

## File Locations

```
/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/
├── adapters/
│   ├── adapter-interface.ts      # Interface definitions
│   ├── canvas-adapter.ts         # Canvas implementation
│   ├── generic-adapter.ts        # Generic implementation
│   ├── index.ts                  # Exports
│   └── tsconfig.json             # TypeScript config
├── core/
│   ├── tmux-controller.ts        # Low-level tmux operations
│   ├── reporter.ts               # Test reporting
│   └── index.ts                  # Exports
└── ...
```

## Support

For issues:
1. Enable verbose logging
2. Check error message (includes context)
3. Verify prerequisites (tmux, Docker for Canvas)
4. Review adapter configuration

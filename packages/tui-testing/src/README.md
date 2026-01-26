# tui-testing/core - Generic TUI Testing Framework

Reusable, framework-agnostic components for automated terminal UI (TUI) testing.

## Overview

This module provides two core components extracted from the Canvas tests-poc POC:

1. **TmuxController** - High-level tmux interaction API
2. **Reporter** - Test result recording and reporting

Both components are completely generic with **zero framework-specific dependencies**. They only depend on Node.js standard library and can be integrated into any testing framework.

## Components

### TmuxController (tmux-controller.ts)

Provides async functions for controlling tmux panes and sessions. Useful for automated terminal UI testing.

**Key Functions:**
- `sendKeys(target, keys)` - Send keyboard input to a tmux pane
- `sendCommand(target, cmd)` - Send a command (with Enter)
- `capturePane(target)` - Get visible text from a pane
- `waitForText(target, text, timeout)` - Wait for text to appear (polls regularly)
- `getSessionInfo()` - Get tmux sessions and windows info
- `createWindow(sessionName, windowName?)` - Create a new tmux window
- `killWindow(target)` - Kill a tmux window
- `listPanes(target)` - List panes in a window
- `selectPane(target)` - Make a pane active
- `getPaneDirectory(target)` - Get a pane's working directory

**Dependencies:** Node.js `child_process`, `util`

**Example:**
```typescript
import { TmuxController } from "@tui-testing/core";

// Send command to a pane
await TmuxController.sendCommand("session:window.pane", "npm test");

// Wait for output
const found = await TmuxController.waitForText(
  "session:window.pane",
  "Tests passed",
  10000
);
```

### Reporter (reporter.ts)

Provides test result logging and reporting in markdown and JSON formats.

**Key Exports:**
- `TestLogger` - Class for recording test steps
- `TestResult` - Interface for a single step result
- `TestReport` - Interface for complete test report
- `generateMarkdownReport(report)` - Produce markdown output
- `generateJsonReport(report)` - Produce JSON output
- `saveMarkdownReport(report, path)` - Save markdown to file
- `saveJsonReport(report, path)` - Save JSON to file

**Dependencies:** Node.js `fs/promises` (async)

**Example:**
```typescript
import { TestLogger, saveMarkdownReport } from "@tui-testing/core";

const logger = new TestLogger();

logger.logSuccess("Step 1: Setup", 500);
logger.logSuccess("Step 2: Run tests", 1200);
logger.logFailure("Step 3: Verify", 100, "Expected text not found");

const report = logger.getReport("My Test");
await saveMarkdownReport(report, "./report.md");
```

## Usage

### Installation

Copy this directory into your project:
```bash
cp -r tui-testing/core your-project/src/lib/
```

Or reference it as a dependency:
```json
{
  "imports": {
    "@tui-testing/core": "./node_modules/@tui-testing/core"
  }
}
```

### Basic Integration

```typescript
import { TmuxController, TestLogger, saveMarkdownReport } from "@tui-testing/core";

async function runTest() {
  const logger = new TestLogger();

  try {
    // Send command
    await TmuxController.sendCommand("test:0.0", "npm test");

    // Wait for completion
    const passed = await TmuxController.waitForText(
      "test:0.0",
      "All tests passed",
      30000
    );

    if (passed) {
      logger.logSuccess("Test run", 1000);
    } else {
      logger.logFailure("Test run", 1000, "Tests did not complete");
    }
  } catch (error) {
    logger.logFailure("Test execution", 100, error.message);
  }

  const report = logger.getReport("My Test Suite");
  await saveMarkdownReport(report, "./test-report.md");
}
```

## Architecture

### Tmux Target Format

All tmux functions use standard tmux target format:
- `"session"` - entire session
- `"session:window"` - specific window
- `"session:window.pane"` - specific pane (most common)

### Polling Strategy

`waitForText()` polls pane content every 200ms by default. The polling interval is hardcoded but can be extended via a timeout parameter to allow custom control.

### Report Structure

Reports contain:
- Test metadata (name, date, overall status)
- Step-by-step results (description, status, duration, errors)
- Summary statistics (total duration, completion %)

## Testing

All files have been verified to:
- ✓ Import only from Node.js standard library
- ✓ Export clean, well-documented APIs
- ✓ Contain zero framework-specific logic
- ✓ Have proper TypeScript types

## Phase 1 Deliverables

This module is the Phase 1 extraction for the General-Purpose TUI Testing Agent project:

- [x] Examined tests-poc structure
- [x] Identified generic components
- [x] Copied to tui-testing/core/
- [x] Verified no Canvas-specific logic
- [x] Added TypeScript configuration
- [x] Created index.ts barrel export
- [x] Added comprehensive documentation

## Next Steps (Phase 2+)

Phase 2 will build adapters for:
- Canvas lab state reading (Canvas-specific)
- Generic app state observers (framework-agnostic)
- Custom telemetry schema mapping

This core module will serve as the foundation for all adapter and testing code.

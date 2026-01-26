# State Observer Usage Examples

## Quick Start

### Canvas Lab State Observer

```typescript
import { CanvasStateObserver } from "@tui-testing/core";
import * as tmux from "@tui-testing/core/tmux-controller";

// Initialize the observer with Canvas log directory
const observer = new CanvasStateObserver("/tmp/lab-logs-123", tmux);

// Wait for a step to be marked completed in state.json
const stepCondition = observer.createStepCompletedCondition("become-root");
const success = await observer.waitFor(stepCondition, 15000); // 15 second timeout

if (!success) {
  const diagnostics = await observer.getDiagnostics(stepCondition);
  console.error("Step did not complete:", diagnostics);
}
```

### Generic Text-Based Observer

```typescript
import { TextStateObserver } from "@tui-testing/core";
import * as tmux from "@tui-testing/core/tmux-controller";

// Initialize observer for any pane
const observer = new TextStateObserver("session:window.1", tmux);

// Wait for prompt to appear
const promptCondition = TextStateObserver.textAppears("$ ", false);
const ready = await observer.waitFor(promptCondition, 5000);

// Execute a command
await tmux.sendCommand("session:window.1", "ls -la");

// Wait for output
const outputCondition = TextStateObserver.textAppears("total", true);
const done = await observer.waitFor(outputCondition, 3000);
```

## Condition Types

### Text Condition - Case Sensitive

```typescript
const condition: StateCondition = {
  type: "text",
  pane: "session:window.0",
  text: "ERROR: Permission denied",
  caseSensitive: true, // Default
  description: "Error message appears",
};

const hasError = await observer.checkCondition(condition);
```

### Text Condition - Case Insensitive

```typescript
const condition: StateCondition = {
  type: "text",
  pane: "session:window.1",
  text: "WELCOME",
  caseSensitive: false,
  description: "Welcome banner shown",
};

const greeted = await observer.waitFor(condition, 5000);
```

### File Condition - Content Check

```typescript
const condition: StateCondition = {
  type: "file",
  path: "/tmp/lab-logs-123/commands.log",
  content: "sudo su",
  description: "User became root",
};

const becameRoot = await observer.checkCondition(condition);
```

### File Condition - Regex Pattern

```typescript
const condition: StateCondition = {
  type: "file",
  path: "/tmp/app.log",
  contentRegex: /ERROR.*Connection refused/i,
  description: "Connection error logged",
};

const hasConnectionError = await observer.checkCondition(condition);
```

### Custom Condition

```typescript
const condition: StateCondition = {
  type: "custom",
  description: "Custom validation",
  check: async () => {
    const content = await tmux.capturePane("session:window.0");
    const hasStep1 = content.includes("Step 1");
    const hasStep2 = content.includes("Step 2");
    return hasStep1 && hasStep2; // Both steps visible
  },
};

const bothStepsVisible = await observer.checkCondition(condition);
```

## Real-World Testing Scenarios

### Scenario 1: Canvas Lab with Multiple Steps

```typescript
async function testCanvasLab() {
  const observer = new CanvasStateObserver(logDir, tmux);
  const targetPane = "canvas-lab:canvas-lab.1"; // Docker pane

  // Step 1: Execute become-root command
  console.log("Testing: Become root");
  await tmux.sendCommand(targetPane, "sudo su");
  let condition = observer.createStepCompletedCondition("become-root");
  if (!await observer.waitFor(condition, 10000)) {
    throw new Error("Failed to become root");
  }

  // Step 2: Create user
  console.log("Testing: Create user");
  await tmux.sendCommand(targetPane, "useradd -m devuser");
  condition = observer.createStepCompletedCondition("create-user");
  if (!await observer.waitFor(condition, 10000)) {
    throw new Error("Failed to create user");
  }

  // Step 3: Set permissions
  console.log("Testing: Set permissions");
  await tmux.sendCommand(targetPane, "chmod 750 /home/devuser");
  condition = observer.createStepCompletedCondition("set-permissions");
  if (!await observer.waitFor(condition, 10000)) {
    throw new Error("Failed to set permissions");
  }

  console.log("All steps completed successfully!");
}
```

### Scenario 2: Wait for Application Readiness

```typescript
async function waitForAppReady() {
  const observer = new TextStateObserver("session:app.0", tmux);

  // Wait for any of three possible prompts
  const prompts = ["$ ", "> ", ">>> "];
  let ready = false;

  for (const prompt of prompts) {
    const condition = TextStateObserver.textAppears(prompt, false);
    if (await observer.checkCondition(condition)) {
      ready = true;
      console.log(`App ready with prompt: ${prompt}`);
      break;
    }
  }

  if (!ready) {
    // Detailed diagnostic
    const diagnostics = await observer.getDiagnostics(condition);
    console.error("App not ready:\n", diagnostics);
  }

  return ready;
}
```

### Scenario 3: Multi-File Validation

```typescript
async function validateTestResults(logDir: string) {
  const observer = new TextStateObserver("session:test.0", tmux);

  // Check commands were logged
  const cmdCondition: StateCondition = {
    type: "file",
    path: `${logDir}/commands.log`,
    contentRegex: /useradd.*devuser/,
  };

  // Check checks passed
  const checkCondition: StateCondition = {
    type: "file",
    path: `${logDir}/checks.log`,
    content: '"status":"passed"',
  };

  const cmdLogged = await observer.checkCondition(cmdCondition);
  const checkPassed = await observer.checkCondition(checkCondition);

  if (!cmdLogged) {
    const diag = await observer.getDiagnostics(cmdCondition);
    console.error("Commands not logged:\n", diag);
  }

  if (!checkPassed) {
    const diag = await observer.getDiagnostics(checkCondition);
    console.error("Checks not passed:\n", diag);
  }

  return cmdLogged && checkPassed;
}
```

### Scenario 4: Polling with Exponential Backoff

```typescript
async function waitWithBackoff(
  observer: StateObserver,
  condition: StateCondition,
  maxAttempts: number = 3
) {
  let timeout = 1000; // Start with 1 second

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Attempt ${attempt}: Waiting ${timeout}ms...`);
    const success = await observer.waitFor(condition, timeout, timeout / 5);

    if (success) {
      console.log(`Success on attempt ${attempt}`);
      return true;
    }

    // Double the timeout for next attempt
    timeout *= 2;
  }

  console.error("Failed after all attempts");
  const diag = await observer.getDiagnostics(condition);
  console.error("Diagnostics:", diag);
  return false;
}
```

## Static Helper Methods

### TextStateObserver Static Helpers

```typescript
// Simplest usage for text matching
const welcomeCondition = TextStateObserver.textAppears("Welcome");
const ready = await observer.waitFor(welcomeCondition, 5000);

// File content check
const loggedCondition = TextStateObserver.fileContains(
  "/tmp/test.log",
  "Task completed"
);
const success = await observer.checkCondition(loggedCondition);

// File pattern matching
const errorPattern = /ERROR:\s+\d+/;
const errorCondition = TextStateObserver.fileMatches(
  "/tmp/error.log",
  errorPattern
);
const hasError = await observer.checkCondition(errorCondition);
```

## Diagnostic Messages

### When Condition Fails

```typescript
const observer = new TextStateObserver("session:window.0", tmux);
const condition = TextStateObserver.textAppears("Login successful");

// Wait fails after timeout
const success = await observer.waitFor(condition, 2000);

if (!success) {
  // Get helpful diagnostic info
  const diagnostics = await observer.getDiagnostics(condition);
  console.error(diagnostics);
  // Output:
  // Expected text: "Login successful"
  // Pane: session:window.0
  // Last 5 lines:
  // Please enter username: admin
  // Please enter password: ****
  // Login failed. Access denied.
  // Retry? (y/n):
}
```

## Best Practices

### 1. Always Handle Timeout Cases

```typescript
// Good
const success = await observer.waitFor(condition, 5000);
if (!success) {
  const diagnostics = await observer.getDiagnostics(condition);
  console.error("Condition not met:", diagnostics);
  // Handle gracefully
}

// Bad - loses diagnostic info
if (!await observer.waitFor(condition, 5000)) {
  throw new Error("Condition failed"); // Unclear why
}
```

### 2. Use Appropriate Timeouts

```typescript
// Quick checks (200ms)
const promptVisible = await observer.waitFor(promptCondition, 200);

// Normal operations (5-10s)
const commandExecuted = await observer.waitFor(outputCondition, 5000);

// Long-running operations (30s+)
const labCompleted = await observer.waitFor(finalStepCondition, 30000);
```

### 3. Combine Conditions for Complex Checks

```typescript
async function bothVisible() {
  const step1 = TextStateObserver.textAppears("Step 1");
  const step2 = TextStateObserver.textAppears("Step 2");

  const has1 = await observer.checkCondition(step1);
  const has2 = await observer.checkCondition(step2);

  return has1 && has2;
}
```

### 4. Prefer Case-Insensitive for Prompts

```typescript
// More reliable (handles variations)
const prompt = TextStateObserver.textAppears("$", false);

// Less reliable (exact match only)
const prompt2 = TextStateObserver.textAppears("$", true);
```

### 5. Strip ANSI Codes Automatically

The observer automatically strips ANSI codes:

```typescript
// Input: "\x1b[31mERROR\x1b[0m: Failed"
// Search: "ERROR: Failed"
// Result: Match! (codes stripped automatically)

const condition = TextStateObserver.textAppears("ERROR: Failed");
const hasError = await observer.checkCondition(condition);
```

## Common Patterns

### Pattern 1: Wait then Act

```typescript
// Wait for prompt
const ready = await observer.waitFor(promptCondition, 5000);
if (!ready) throw new Error("App not ready");

// Now safe to send command
await tmux.sendCommand(pane, "command");
```

### Pattern 2: Verify Output

```typescript
// Send command
await tmux.sendCommand(pane, "ls");

// Verify output appeared
const listed = await observer.waitFor(
  TextStateObserver.textAppears("total"),
  3000
);
```

### Pattern 3: Wait for State File

```typescript
// Canvas lab completed
const done = await observer.waitFor(
  observer.createStepCompletedCondition("lab-complete"),
  30000
);
```

## Integration with Test Frameworks

### With Node.js Test Runner

```typescript
import { test } from "node:test";
import assert from "node:assert";
import { CanvasStateObserver } from "@tui-testing/core";

test("Canvas lab steps complete in order", async (t) => {
  const observer = new CanvasStateObserver(logDir, tmux);

  // Test step 1
  const step1Done = await observer.waitFor(
    observer.createStepCompletedCondition("step1"),
    5000
  );
  assert.ok(step1Done, "Step 1 should complete");

  // Test step 2
  const step2Done = await observer.waitFor(
    observer.createStepCompletedCondition("step2"),
    5000
  );
  assert.ok(step2Done, "Step 2 should complete");
});
```

## Troubleshooting

### Issue: Text not found after sendCommand

**Cause**: Command hasn't executed yet, output not visible
**Solution**: Increase timeout, use case-insensitive matching

```typescript
// Might fail
await observer.waitFor(condition, 500);

// Better
await observer.waitFor(condition, 2000, 100); // Poll every 100ms
```

### Issue: ANSI codes interfering with matching

**Cause**: Terminal colors/formatting in output
**Solution**: Observer strips them automatically, but verify with diagnostic

```typescript
const diagnostics = await observer.getDiagnostics(condition);
// Check if text appears without codes
```

### Issue: File not readable

**Cause**: Permission denied or file not found
**Solution**: Check logDir and file permissions, use getDiagnostics

```typescript
const diag = await observer.getDiagnostics(fileCondition);
// Will show: "File not found or not readable: /path/to/file"
```

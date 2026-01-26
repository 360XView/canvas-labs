# Phase 5: TUI Tester Agent - Quick Start

The TUI Tester Agent converts natural language test requests into executable tests.

## Installation

No additional dependencies. The agent uses the existing framework components:
- TUITestRunner
- Adapters (Canvas, Generic, Custom)
- State observers

## Basic Usage

```typescript
import { runTUITestAgent } from "./agents/index.js";

const response = await runTUITestAgent({
  app: "Canvas vTA",
  interactions: [
    "Navigate right",
    "Press Enter"
  ],
  assertions: [
    "Should show step 2",
    "Progress indicator updates"
  ]
});

console.log(response.summary);     // "✅ Test passed: ..."
console.log(response.report);      // Markdown report
console.log(response.generatedCode); // Generated test code (for reference)
```

## Request Types

### Canvas Lab Testing

```typescript
await runTUITestAgent({
  app: "Canvas vTA",                    // Auto-detected
  moduleId: "linux-user-management",   // Specific lab
  interactions: ["Navigate right", "Press Enter"],
  assertions: ["Should show step 2"]
});
```

### Generic CLI App Testing

```typescript
await runTUITestAgent({
  app: "My CLI Tool",
  appType: "generic",
  launchCommand: "node my-tool.js",    // Required for generic
  interactions: ["Type hello", "Press Enter"],
  assertions: ["Should show greeting"]
});
```

### Custom Adapter

```typescript
await runTUITestAgent({
  app: "My App",
  appType: "custom",
  customAdapter: myAdapter,             // Your adapter instance
  interactions: ["Press Enter"],
  assertions: ["Should work"]
});
```

## Natural Language Reference

### Interactions

```
Navigate right/left/up/down    → Arrow keys
Press Enter/Escape/Tab         → Keyboard keys
Type 'text' or Type text       → Text input
Wait 500ms or Wait 2 seconds   → Delay
Wait for 'prompt'              → Wait for text
```

### Assertions

```
Should show 'text'             → Text should appear
Should not show error          → Text should not appear
Verify 'text' appears          → Text should appear
Welcome message                → Text should appear (implicit)
```

## Response Structure

```typescript
interface AgentResponse {
  success: boolean;              // Pass/fail
  summary: string;               // One-line summary
  report: string;                // Markdown report
  diagnostics?: string;          // Only if failed
  generatedCode?: string;        // Generated code for reference
}
```

## Examples

### Example 1: Simple Canvas Test

```typescript
const response = await runTUITestAgent({
  app: "Canvas vTA",
  moduleId: "shell-navigation",
  interactions: [
    "Navigate right",
    "Wait for content to load"
  ],
  assertions: [
    "Should show step 1",
    "Should contain instructions"
  ]
});

if (response.success) {
  console.log("✓ Lab navigation works!");
} else {
  console.log("Test failed:");
  console.log(response.diagnostics);
}
```

### Example 2: CLI App With Multiple Steps

```typescript
const response = await runTUITestAgent({
  app: "Todo CLI",
  appType: "generic",
  launchCommand: "bun run todo-cli.ts",
  interactions: [
    "Type add task",
    "Press Enter",
    "Wait 500ms",
    "Type list",
    "Press Enter"
  ],
  assertions: [
    "Should show 'Task added'",
    "Should show task in list",
    "Should not show error"
  ]
});

console.log(response.report);
console.log("Generated code:\n", response.generatedCode);
```

### Example 3: Negative Testing

```typescript
const response = await runTUITestAgent({
  app: "Auth System",
  launchCommand: "node auth.js",
  interactions: [
    "Type invalid",
    "Press Enter"
  ],
  assertions: [
    "Should show error message",
    "Should not allow access",
    "Should prompt for retry"
  ]
});
```

## Common Patterns

### Test Setup and Teardown

```typescript
// Setup: Launch with initialization
const response = await runTUITestAgent({
  app: "MyApp",
  launchCommand: "node app.js --test",
  interactions: [
    "Wait for startup",
    "Type setup",
    "Press Enter"
  ],
  assertions: ["Should show ready prompt"]
});

// Teardown: Natural cleanup via TUITestRunner
// (automatically happens after test completes)
```

### Wait for Dynamic Content

```typescript
await runTUITestAgent({
  app: "MyApp",
  launchCommand: "node app.js",
  interactions: [
    "Press Enter",
    "Wait 1 second",        // Let UI render
    "Wait for loading done" // Wait for specific text
  ],
  assertions: ["Should show results"]
});
```

### Multiple Assertions on Same State

```typescript
await runTUITestAgent({
  app: "MyApp",
  launchCommand: "node app.js",
  interactions: ["Press Enter"],
  assertions: [
    "Should show title",
    "Should show menu",
    "Should show help text"
  ]
});
```

## Debugging

### View Generated Code

```typescript
const response = await runTUITestAgent({
  app: "MyApp",
  launchCommand: "node app.js",
  interactions: ["Press Enter"],
  assertions: ["Should work"]
});

console.log("Generated test code:");
console.log(response.generatedCode);
// Shows exactly what will be executed
```

### Enable Verbose Logging

```typescript
const response = await runTUITestAgent({
  app: "MyApp",
  launchCommand: "node app.js",
  interactions: ["Press Enter"],
  assertions: ["Should work"],
  verbose: true  // Enable detailed logging
});
```

### Analyze Failures

```typescript
const response = await runTUITestAgent({
  app: "MyApp",
  launchCommand: "node app.js",
  interactions: ["Press Enter"],
  assertions: ["Should show welcome"]
});

if (!response.success) {
  console.log("Summary:", response.summary);
  console.log("Report:\n", response.report);
  console.log("Diagnostics:\n", response.diagnostics);
  console.log("Generated code:\n", response.generatedCode);
}
```

## Tips and Best Practices

1. **Be explicit**: Use clear, specific language
   - ✅ "Type 'hello world'"
   - ❌ "Type something"

2. **Use specific text for assertions**:
   - ✅ "Should show Welcome message"
   - ❌ "Should work"

3. **Add waits for dynamic content**:
   - ✅ "Wait for loading to complete"
   - ❌ Direct assertion right after action

4. **One assertion per expectation**:
   - ✅ ["Should show title", "Should show menu"]
   - ❌ ["Should show title and menu and help"]

5. **Test one workflow per request**:
   - ✅ Multiple related steps in one test
   - ❌ Unrelated interactions mixed together

## Error Messages

### Invalid Request
```
Error: app field is required and must be a string
Provide the name of the TUI application (e.g., 'Canvas vTA', 'my-app')
```

### Parse Error
```
Could not understand the following interactions:
- "Go to the next thing"

Use clear, explicit language:
- "Navigate right/left/up/down"
- "Press Enter/Escape/Tab"
```

### Adapter Error
```
Cannot determine app type for "MyApp". 
Specify appType ("canvas" | "generic" | "custom") or provide launchCommand.
```

### Test Failure
```
Test failed: MyApp did not meet expectations

Failed steps:
- Assertion failed: Expected pane to contain "Welcome"
  Error: Text not found in output
```

## Full Type Definitions

```typescript
interface AgentRequest {
  app: string;
  appType?: "canvas" | "generic" | "custom";
  launchCommand?: string;
  interactions: string[];
  assertions: string[];
  moduleId?: string;
  verbose?: boolean;
  customAdapter?: any;
}

interface AgentResponse {
  success: boolean;
  summary: string;
  report: string;
  diagnostics?: string;
  generatedCode?: string;
}

async function runTUITestAgent(
  request: AgentRequest
): Promise<AgentResponse>
```

## Next Steps

1. Create a test file using the agent
2. Run tests to verify your TUI app behavior
3. Use generated code as a template for more complex tests
4. Check Phase 6 for test framework enhancements

See `PHASE_5_AGENT_IMPLEMENTATION.md` for full documentation.

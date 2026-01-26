# Phase 6: Quick Reference Guide

## What Was Created

Three files in `/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/examples/`:

1. **simple-menu.ts** - Interactive menu app (no npm deps)
2. **simple-menu-test.ts** - Test for menu app
3. **canvas-vta-test.ts** - Test for Canvas vTA

## Running Tests

### Simple Menu Test
```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas
bun run tui-testing/examples/simple-menu-test.ts
```

**Expected**: PASSED (exit 0)

### Canvas Test
```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas
bun run tui-testing/examples/canvas-vta-test.ts
```

**Expected**: PASSED (exit 0)

## Test Output Format

```
========== TEST REPORT ==========
Test: [App Name]
Date: [ISO Timestamp]
Result: [PASSED|FAILED]
Steps: X/Y passed
Duration: Zms

[Failed steps listed if any]
=================================
```

**Exit Codes**:
- `0` = All tests passed
- `1` = One or more tests failed

## Simple Menu Test

**What It Tests**:
- Menu displays
- Options are selectable
- Feedback is shown
- Menu reappears
- Exit works

**Steps** (10 total):
1. Menu title visible
2. All options visible
3. Select Option A
4. Get feedback for A
5. Return to menu
6. Select Option B
7. Get feedback for B
8. Return to menu again
9. Verify menu state
10. Exit cleanly

**Duration**: ~2-3 seconds

## Canvas Test

**What It Tests**:
- Canvas lab launches
- Steps display correctly
- Navigation works
- Content is accurate
- Cleanup happens

**Steps** (10 total):
1. Introduction displays
2. Lab content shows
3. Navigate to Create File
4. Task instructions visible
5. Navigate to Write Content
6. Write instructions visible
7. Navigate to Summary
8. Completion message shown
9. Navigate back to Introduction
10. Content correct at start

**Duration**: ~10-20 seconds

## Framework Components Verified

| Component | Simple Menu | Canvas |
|-----------|-------------|--------|
| TUITestRunner | ✅ | ✅ |
| GenericAdapter | ✅ | - |
| CanvasAdapter | - | ✅ |
| TextStateObserver | ✅ | - |
| CanvasStateObserver | - | ✅ |
| sendKeys | ✅ | ✅ |
| sendCommand | ✅ | ✅ |
| waitForText | ✅ | ✅ |
| assertPaneContains | ✅ | ✅ |
| Cleanup | ✅ | ✅ |

## Test API Cheat Sheet

### Actions
```typescript
await ctx.sendKeys("ArrowRight");        // Press a key
await ctx.sendKeys("C-c");               // Ctrl+C
await ctx.sendCommand("echo hello");     // Type and Enter
await ctx.capturePane();                 // Read pane content
```

### Assertions
```typescript
await ctx.assertPaneContains("text");      // Verify text present
await ctx.assertPaneNotContains("error");  // Verify text absent
await ctx.waitForText("text", 5000);       // Wait with timeout
await ctx.assertCondition(condition);      // Custom condition
```

### Configuration
```typescript
const runner = new TUITestRunner({
  adapter,
  verbose: true,  // Show logs
  timeouts: {
    launch: 30000,  // App startup
    ready: 10000,   // Ready indicator
    action: 5000,   // Between actions
  }
});
```

## Common Patterns

### Test Basic Menu
```typescript
await ctx.assertPaneContains("Menu");
await ctx.sendKeys("1");
await ctx.waitForText("Selected", 3000);
```

### Wait for Command Output
```typescript
await ctx.sendCommand("my-command");
await ctx.waitForText("result", 5000);
```

### Navigate Steps
```typescript
await ctx.sendKeys("ArrowRight");  // Next step
await ctx.sendKeys("ArrowLeft");   // Previous step
```

### Exit Application
```typescript
await ctx.sendKeys("q");           // Quit key
// or
await ctx.sendKeys("C-c");         // Ctrl+C
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Menu not found" | Run test with `verbose: true` to see what happened |
| "Timeout waiting for text" | Increase timeout in `waitForText()` call |
| "Target pane not found" | Check tmux manually: `tmux list-panes -t session:window` |
| "Cleanup failed" | Manually kill: `tmux kill-window -t session:window` |
| "Docker error" | Ensure Docker is running: `docker ps` |

## File Structure

```
tui-testing/
├── examples/
│   ├── simple-menu.ts                    (App)
│   ├── simple-menu-test.ts               (Test)
│   ├── canvas-vta-test.ts                (Test)
│   ├── tsconfig.json
│   └── README.md                         (Detailed guide)
├── core/                                 (Framework)
├── adapters/                             (Adapters)
├── agents/                               (Agent)
└── PHASE_6_SUMMARY.md                   (This phase)
```

## Next Steps

### To Create a New Test
1. Create adapter (use GenericAdapter for most cases)
2. Create TUITestRunner
3. Write test function
4. Run test
5. Check report

### To Test a Different App
```typescript
const adapter = createGenericAdapter("your-command", {
  readyIndicator: "expected prompt",
});

const runner = new TUITestRunner({ adapter });
const report = await runner.run(async (ctx) => {
  // Your test
});
```

### To Test Canvas Lab
```typescript
const adapter = createCanvasAdapter("lab-module-id");

const runner = new TUITestRunner({ adapter });
const report = await runner.run(async (ctx) => {
  // Your test
});
```

## Key Takeaways

1. **Framework is generic** - Works with any TUI app
2. **Simple syntax** - Easy to read and understand
3. **Proper cleanup** - No leaked sessions or containers
4. **Clear reporting** - Pass/fail with metrics
5. **Exit codes** - Integrates with CI/CD

## Performance Targets

| Test | Ideal | Max |
|------|-------|-----|
| Simple Menu | 2-3s | 5s |
| Canvas | 10-20s | 30s |
| Both together | 15-25s | 40s |

## Success Criteria

✅ Simple Menu test passes
✅ Canvas test passes
✅ Both use framework features
✅ Exit codes correct
✅ Cleanup works
✅ Output is clear
✅ No resource leaks

## Useful Commands

```bash
# List tmux sessions
tmux list-sessions

# List panes in window
tmux list-panes -t session:window

# Capture pane content
tmux capture-pane -p -t session:window.pane

# Kill window
tmux kill-window -t session:window

# Kill all sessions (danger!)
tmux kill-server

# Run test with output
bun run tui-testing/examples/simple-menu-test.ts 2>&1 | tee test.log

# Check exit code
bun run tui-testing/examples/simple-menu-test.ts && echo "PASS" || echo "FAIL"
```

## Documentation Links

- **Full README**: `examples/README.md` - Complete guide
- **Phase Summary**: `PHASE_6_SUMMARY.md` - Detailed implementation notes
- **This File**: `PHASE_6_QUICK_REFERENCE.md` - Quick lookup

## Support

For detailed information:
1. Check `examples/README.md` (troubleshooting section)
2. Check `PHASE_6_SUMMARY.md` (design details)
3. Run with `verbose: true`
4. Check framework source files

## Summary

Phase 6 proves the framework works with two different TUI apps:
- **Simple Menu**: Generic CLI app with GenericAdapter
- **Canvas vTA**: Complex lab with CanvasAdapter

Both tests pass, report clearly, and exit properly. Framework is ready for Phase 7 integration.

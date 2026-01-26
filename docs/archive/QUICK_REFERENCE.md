# TUI Testing Core - Quick Reference

## Fixed Issues at a Glance

| Issue | Category | Status | Key Change |
|-------|----------|--------|-----------|
| 1 | Silent Failures | ✅ | Try/catch on all tmux commands |
| 2 | Race Condition | ✅ | Added `pollInterval` param to `waitForText()` |
| 3 | Weak Heuristic | ✅ | New `getCurrentSession()` parses TMUX env |
| 4 | Error Context | ✅ | Try/catch in `saveReport()` with context |
| 5 | No Validation | ✅ | Input validation on all functions |
| 6 | Start Timing | ✅ | TestLogger init on first log call |
| 7 | Division by Zero | ✅ | Check `totalSteps > 0` before division |
| 8 | Missing Import | ✅ | `writeFile` moved to top-level import |
| 9 | ANSI Codes | ✅ | Documented in `capturePane()` JSDoc |
| 10 | Unclear Return | ✅ | `createWindow()` uses `-F "#{window_index}"` |
| 11 | Strict Mode | ✅ | tsconfig.json strict mode + options |

## Usage Examples

### Error Handling
```typescript
try {
  await sendCommand("session:0.0", "ls -la");
} catch (error) {
  console.error(error.message);
  // Example: Failed to send command to pane "session:0.0": Connection refused
  // Ensure the target exists and tmux is running.
}
```

### Getting Current Session
```typescript
import { getCurrentSession } from "./tmux-controller";

const session = getCurrentSession();
if (session) {
  console.log(`Current session: ${session}`);
} else {
  console.log("Not in a tmux session");
}
```

### Waiting with Custom Poll Interval
```typescript
// Default: 200ms polling
const found = await waitForText("session:0.0", "prompt", 10000);

// Slow operations: 500ms polling, 20s timeout
const foundSlow = await waitForText("session:0.0", "output", 20000, 500);
```

### Input Validation
All functions now validate input. Examples:

```typescript
// These throw errors immediately:
await sendKeys("session:0.0", "");           // Empty keys
await sendKeys("invalid-target", "text");    // Missing :
await createWindow("", "window");            // Empty session name
await saveReport("", "/path/file.txt");      // Empty report
```

### Handling ANSI Codes in Captured Output
```typescript
const content = await capturePane("session:0.0");

// If you need plain text without ANSI codes:
const cleaned = content.replace(/\x1b\[[0-9;]*m/g, "");
```

## Compilation & Type Checking

```bash
cd core/

# Check for errors (no output = success)
npx tsc --noEmit

# Build (creates dist/)
npm run build

# Test
npm test
```

## Type Safety Notes

- All async functions are properly typed with `Promise<T>`
- Parameter types are explicit (no implicit `any`)
- Strict mode enforces all TypeScript checks
- Arrow function callbacks are typed (e.g., `(s: string) => s`)

## Common Error Messages

| Error | Solution |
|-------|----------|
| `Invalid tmux target: empty or null` | Provide target in format `session:window.pane` |
| `Invalid keys: must be a non-empty string` | Don't pass empty string to `sendKeys()` |
| `Failed to send command to pane "..."` | Ensure pane exists: `tmux list-panes -t session:0` |
| `Failed to save report to "..."` | Check directory exists and has write permissions |
| `Failed to get session info` | Ensure tmux is running: `tmux list-sessions` |

## API Stability

✅ **Backward Compatible** - No breaking changes. New/enhanced features:
- `getCurrentSession()` - new public function
- `waitForText()` - optional `pollInterval` parameter (default 200ms)
- Better error messages and validation

## Performance Considerations

- `waitForText()` polls every 200ms by default
- For slow operations, increase `pollInterval` to 500ms+
- `capturePane()` returns raw output (includes ANSI codes for speed)
- TestLogger starts timing on first log, not at instantiation

## Troubleshooting

**"Cannot find module 'fs/promises'"**
- Not a code issue - happens at import time
- Make sure running on Node.js ≥18.0.0

**Type errors in strict mode**
- All types are enforced - check function signatures
- Use `// @ts-ignore` sparingly and document why

**waitForText() times out**
- Increase timeout: `waitForText(target, text, 20000)` for 20s
- Increase poll interval: `waitForText(target, text, 10000, 500)` for 500ms polling
- Check text exists: `capturePane()` and search manually

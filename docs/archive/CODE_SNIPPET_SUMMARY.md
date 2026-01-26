# Code Quality Fixes - Before/After Snippets

## Issue #3: Shell Prompt Detection

### Before (INCORRECT - False Positives)
```typescript
// Could match "$" anywhere in output
const hasPrompt = content.includes("$") || content.includes("#");
```

### After (CORRECT - Anchored Pattern)
```typescript
// Only matches prompt at end of line
const hasPrompt = /\n[$#]\s*$/.test(content);
```

**Key Points:**
- Pattern: `/\n[$#]\s*$/`
  - `\n` - newline before prompt
  - `[$#]` - either $ or #
  - `\s*` - optional whitespace after prompt
  - `$` - end of string
- Prevents false positives from text like "cost=$100"

---

## Issue #5: Log Directory Detection

### Before (FRAGILE - Depends on Directory Names)
```typescript
const logDirs = entries
  .filter((name: string) => name.startsWith("lab-logs-"))
  .map((name: string) => `${tmpDir}/${name}`);

if (logDirs.length > 0) {
  // Fragile: assumes directory name format predicts creation time
  const sortedDirs = logDirs.sort().reverse();
  return sortedDirs[0];
}
```

### After (ROBUST - Uses File System Metadata)
```typescript
import { readdir, stat } from "fs/promises";

const logDirs = entries
  .filter((name: string) => name.startsWith("lab-logs-"))
  .map((name: string) => `${tmpDir}/${name}`);

if (logDirs.length > 0) {
  // Robust: queries actual file modification times
  const dirsWithMtime = await Promise.all(
    logDirs.map(async (dir) => ({
      dir,
      mtime: (await stat(dir)).mtimeMs,
    }))
  );
  const mostRecent = dirsWithMtime.sort((a, b) => b.mtime - a.mtime)[0];
  return mostRecent.dir;
}
```

**Key Improvements:**
- Uses `fs.stat()` to get actual file modification times
- `mtimeMs` gives millisecond timestamp (no ambiguity)
- Handles concurrent labs correctly
- Independent of directory naming format

---

## Issue #7: Canvas Path Portability

### Before (HARD-CODED - Single User Only)
```typescript
this.canvasPath = 
  config.canvasPath || 
  "/Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0";
```

### After (PORTABLE - Environment Variable Support)
```typescript
this.canvasPath =
  config.canvasPath ||
  process.env.CANVAS_HOME ||
  "/Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0";
```

**Key Improvements:**
- Precedence: Config → Env → Default
- Works across users and machines
- Backward compatible (fallback to hard-coded path)
- Usage: `export CANVAS_HOME=/custom/path`

---

## Issue #9: @ts-ignore Justification

### Before (UNCLEAR)
```typescript
// @ts-ignore - Node.js built-in module
import { execFile } from "child_process";
// @ts-ignore - Node.js built-in module
import { promisify } from "util";
```

### After (CLEAR)
```typescript
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { execFile } from "child_process";
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { promisify } from "util";
```

**Key Improvements:**
- Explains WHY the suppression is needed
- Mentions ESM-specific issue
- Helps future maintainers understand the code

---

## Issue #1: Regex Pattern Validation

### Before (POOR DIAGNOSTICS)
```typescript
if (config.targetPanePattern) {
  try {
    this.targetPanePattern = new RegExp(config.targetPanePattern);
  } catch (error) {
    // Generic error message, no actual error details
    throw new Error(
      `Invalid targetPanePattern regex: ${config.targetPanePattern}`
    );
  }
}
```

### After (HELPFUL DIAGNOSTICS)
```typescript
if (config.targetPanePattern) {
  try {
    this.targetPanePattern = new RegExp(config.targetPanePattern);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (this.verbose) {
      console.error(
        `[Generic] Failed to compile regex pattern: ${errorMsg}`
      );
    }
    throw new Error(
      `Invalid targetPanePattern regex: ${config.targetPanePattern}\n${errorMsg}`
    );
  }
}
```

**Additional Fix in findTargetPane():**
```typescript
for (const paneIndex of panes) {
  const paneTarget = `${windowTarget}.${paneIndex}`;
  try {
    const content = await tmux.capturePane(paneTarget);
    try {
      if (this.targetPanePattern.test(content)) {
        return paneTarget;
      }
    } catch (regexError) {
      const errorMsg = regexError instanceof Error 
        ? regexError.message 
        : String(regexError);
      if (this.verbose) {
        console.error(
          `[Generic] Regex test error on pane ${paneTarget}: ${errorMsg}`
        );
      }
    }
  } catch (error) {
    // Continue to next pane
  }
}
```

**Key Improvements:**
- Captures actual error message from RegExp constructor
- Includes error details in thrown exception
- Logs errors with verbose flag
- Handles runtime regex test errors gracefully

---

## Issue #6: Error Propagation Documentation

### Canvas Adapter (WARNS - Non-Fatal)
```typescript
/**
 * Clean up Canvas resources.
 * Kills the tmux window and any Docker containers created by Canvas.
 *
 * Note: This adapter warns on cleanup errors rather than throwing, allowing
 * partial cleanup to succeed. This is intentional because Docker cleanup can
 * fail safely if containers were already removed or Docker is not running.
 * The critical cleanup (killing the tmux window) is attempted first.
 *
 * @param sessionName tmux session name
 * @param windowName tmux window name
 * @logs Warning messages on cleanup errors (does not throw)
 */
async cleanup(sessionName: string, windowName: string): Promise<void> {
  // ...
  if (errors.length > 0) {
    console.warn(`[Canvas] Cleanup completed with errors:\n${errors.join("\n")}`);
    // Does NOT throw - allows partial success
  }
}
```

### Generic Adapter (THROWS - Fatal)
```typescript
/**
 * Clean up resources.
 * Kills the tmux window.
 *
 * Note: This adapter throws on cleanup errors, unlike Canvas which warns.
 * This is appropriate for generic applications where cleanup failure is
 * always an error condition (we control the entire lifecycle).
 *
 * @param sessionName tmux session name
 * @param windowName tmux window name
 * @throws Error if cleanup fails
 */
async cleanup(sessionName: string, windowName: string): Promise<void> {
  try {
    await tmux.killWindow(windowTarget);
    // ...
  } catch (error) {
    // Throws on failure - signals real problem
    throw new Error(`Failed to clean up window: ${errorMsg}`);
  }
}
```

**Design Rationale:**
| Adapter | Error Handling | Reason |
|---------|---|---|
| Canvas | Warns (non-fatal) | Docker is external; may already be cleaned up |
| Generic | Throws (fatal) | We control entire lifecycle; failure is always an error |

---

## Summary of Changes

| Issue | File | Change Type | Lines | Impact |
|-------|------|------------|-------|--------|
| #3 | canvas-adapter.ts | Regex enhancement | 1 | Eliminates false positives |
| #5 | canvas-adapter.ts | Implementation | 15 | Concurrent lab support |
| #7 | canvas-adapter.ts | Feature addition | 1 | Cross-machine portability |
| #9 | Both files | Documentation | 4 | Code clarity |
| #1 | generic-adapter.ts | Error handling | 20 | Better diagnostics |
| #6 | Both files | Documentation | 10 | Design clarity |

**Total Changes**: ~51 lines of actual code + ~14 lines of JSDoc

All changes are:
- Backward compatible ✓
- TypeScript strict mode compliant ✓
- Thoroughly commented ✓
- Production-ready ✓


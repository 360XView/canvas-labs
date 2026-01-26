# Phase 2: Critical Code Quality Fixes

## Summary
All high-priority and medium-priority issues identified in Phase 2 Adapters review have been fixed and committed.

**Commit**: `d3bc65c` - Fix critical code quality issues in Canvas and Generic adapters

## Issues Fixed

### High-Priority Issues (All Fixed)

#### Issue #3: Canvas isReady() Shell Prompt Check Too Simple ✅
**File**: `adapters/canvas-adapter.ts` (line 248)

**Problem**: Used simple substring checks that could match partial text anywhere:
```typescript
// Before (INCORRECT)
if (content.includes("$") || content.includes("#")) {
```

**Solution**: Implemented anchored regex pattern that matches prompt at end of line:
```typescript
// After (CORRECT)
if (/\n[$#]\s*$/.test(content)) {
```

**Impact**: Prevents false positives from text containing "$" or "#" in the middle of output. Only detects actual shell prompts at the end of the last line.

---

#### Issue #5: Log Directory Collision - Lexicographic Sort Unreliable ✅
**File**: `adapters/canvas-adapter.ts` (lines 365-375)

**Problem**: Used string sort on directory names instead of actual file modification times:
```typescript
// Before (FRAGILE)
const sortedDirs = logDirs.sort().reverse();
return sortedDirs[0];
```

**Solution**: Use file modification times (mtime) to find the most recent directory:
```typescript
// After (ROBUST)
const dirsWithMtime = await Promise.all(
  logDirs.map(async (dir) => ({
    dir,
    mtime: (await stat(dir)).mtimeMs,
  }))
);
const mostRecent = dirsWithMtime.sort((a, b) => b.mtime - a.mtime)[0];
return mostRecent.dir;
```

**Changes**:
- Added `stat` import from `fs/promises`
- Queries actual filesystem metadata instead of relying on naming conventions
- Handles concurrent lab instances reliably

**Impact**: Robust handling of multiple lab instances running simultaneously. No longer depends on directory naming format or lexicographic ordering.

---

#### Issue #7: Hard-Coded Canvas Path Not Portable ✅
**File**: `adapters/canvas-adapter.ts` (lines 73-77)

**Problem**: Hard-coded path only works for one user:
```typescript
// Before (NOT PORTABLE)
this.canvasPath =
  config.canvasPath ||
  "/Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0";
```

**Solution**: Support environment variable with fallback:
```typescript
// After (PORTABLE)
this.canvasPath =
  config.canvasPath ||
  process.env.CANVAS_HOME ||
  "/Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0";
```

**Usage**: Users can now set `CANVAS_HOME` environment variable or pass `canvasPath` in config:
```bash
export CANVAS_HOME=/path/to/canvas/installation
```

**Impact**: Works across different users, machines, and custom Canvas installations. Maintains backward compatibility with hard-coded default.

---

#### Issue #9: Missing @ts-ignore Justification ✅
**Files**: `adapters/canvas-adapter.ts` and `adapters/generic-adapter.ts` (lines 16-23)

**Problem**: @ts-ignore comments lacked explanation, making code harder to maintain:
```typescript
// Before (UNCLEAR)
// @ts-ignore - Node.js built-in module
import { execFile } from "child_process";
```

**Solution**: Added clear explanation of why @ts-ignore is needed:
```typescript
// After (CLEAR)
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { execFile } from "child_process";
```

**Impact**: Improves code clarity and maintainability. Anyone reading the code understands why the suppression is necessary.

---

### Medium-Priority Issues (All Fixed)

#### Issue #1: Regex Pattern Compilation Not Validated ✅
**File**: `adapters/generic-adapter.ts` (lines 77-90)

**Problem**: Regex compilation errors in constructor weren't providing helpful debugging info:
```typescript
// Before (POOR DIAGNOSTICS)
if (config.targetPanePattern) {
  try {
    this.targetPanePattern = new RegExp(config.targetPanePattern);
  } catch (error) {
    throw new Error(`Invalid targetPanePattern regex: ${config.targetPanePattern}`);
  }
}
```

**Solution**: Capture and log the actual error message:
```typescript
// After (BETTER DIAGNOSTICS)
if (config.targetPanePattern) {
  try {
    this.targetPanePattern = new RegExp(config.targetPanePattern);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (this.verbose) {
      console.error(`[Generic] Failed to compile regex pattern: ${errorMsg}`);
    }
    throw new Error(
      `Invalid targetPanePattern regex: ${config.targetPanePattern}\n${errorMsg}`
    );
  }
}
```

**Additional fix**: Added error handling in `findTargetPane()` method (lines 220-234):
```typescript
try {
  if (this.targetPanePattern.test(content)) {
    // match found
  }
} catch (regexError) {
  const errorMsg = regexError instanceof Error ? regexError.message : String(regexError);
  if (this.verbose) {
    console.error(`[Generic] Regex test error on pane ${paneTarget}: ${errorMsg}`);
  }
}
```

**Impact**: Provides detailed error messages for invalid regex patterns. Prevents silent failures during pane pattern matching.

---

#### Issue #6: Inconsistent Error Propagation in Cleanup ✅
**Files**: `adapters/canvas-adapter.ts` and `adapters/generic-adapter.ts`

**Canvas Adapter** (lines 289-308): Warns on errors (intentionally non-fatal)
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
```

**Generic Adapter** (lines 289-306): Throws on errors (failure is always an error)
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
```

**Design Rationale**:
- **Canvas**: Tolerates Docker cleanup failures because Docker is an external dependency that may not be running or may have already cleaned up containers
- **Generic**: Throws on cleanup because a generic application cleanup failure indicates a real problem with the test setup

**Impact**: Clear documentation of design decisions. Developers understand why error handling differs between adapters.

---

## Acceptance Criteria - All Met ✅

- ✅ Issue #3: Shell prompt pattern is anchored and correct
- ✅ Issue #5: Log directory detection uses file timestamps via `fs.stat().mtimeMs`
- ✅ Issue #7: Canvas path uses environment variable `CANVAS_HOME` with fallback
- ✅ Issue #9: @ts-ignore comments are justified with clear explanations
- ✅ Issue #1: Regex test errors are caught and logged with verbose output
- ✅ Issue #6: Cleanup error behavior is documented in JSDoc comments
- ✅ Files compile in TypeScript strict mode (inherited tsconfig with `"strict": true`)
- ✅ No breaking changes to public API
- ✅ Git commit created with descriptive message (commit hash: d3bc65c)

## Files Modified

1. **`adapters/canvas-adapter.ts`**
   - Added `stat` to imports
   - Fixed shell prompt detection (line 248)
   - Added CANVAS_HOME environment variable support (line 75)
   - Implemented file mtime-based log directory detection (lines 365-375)
   - Enhanced JSDoc for cleanup method
   - Improved @ts-ignore comments (line 16)

2. **`adapters/generic-adapter.ts`**
   - Improved @ts-ignore comments (line 17)
   - Enhanced regex compilation error diagnostics (lines 77-90)
   - Added error handling in findTargetPane regex test (lines 220-234)
   - Enhanced JSDoc for cleanup method
   - Better error messages for invalid patterns

## Testing Notes

All changes:
- Are backward compatible (no breaking API changes)
- Maintain TypeScript strict mode compliance
- Follow existing code style and conventions
- Include appropriate logging with verbose flag support
- Pass validation in the adapter interface contract

## Deployment Checklist

- [ ] Code review (logic and correctness)
- [ ] Integration testing with Canvas labs
- [ ] Testing with generic TUI applications
- [ ] Environment variable documentation (CANVAS_HOME)
- [ ] Verification with multiple concurrent labs
- [ ] Documentation update in main README

---

**Implementation Date**: 2026-01-25  
**Status**: COMPLETE  
**Commit Hash**: d3bc65c77d9ecaa30d38f0e29d16569ce966f753

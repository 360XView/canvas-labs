# Bug: VTA Crashes After Revealing Hint

**Date:** 2026-01-27
**Status:** Cannot Reproduce (Intermittent)
**Severity:** Medium
**Component:** VTA Canvas (`src/canvases/vta.tsx`)

## Summary

VTA crashes/exits when pressing 'h' to reveal a hint, even though the hint is displayed briefly and telemetry is logged successfully.

## Reproduction Steps

1. Start a lab with hints:
   ```bash
   cd packages/canvas-plugin
   bun run src/cli.ts lab shell-navigation --no-tutor
   ```

2. In tmux, switch to VTA pane: `Ctrl+B` then `↑`

3. Navigate to a step with hints (e.g., `navigate-absolute`)

4. Press `h` to reveal hint

5. **Result:** Hint appears briefly, then VTA pane closes. Tmux renumbers remaining pane (Docker terminal becomes pane 0).

## Observations

- Hint IS displayed before crash
- Telemetry IS logged (`hint_requested` event appears in `telemetry.jsonl`)
- `solution_viewed` works without crashing
- `question_answered` works without crashing
- Only `hint_requested` causes the crash

## Telemetry Evidence

```json
{"event":"session_started","step":null}
{"event":"solution_viewed","step":"navigate-absolute"}
{"event":"hint_requested","step":"navigate-absolute"}  // Logged before crash
```

## Code Path

```
vta.tsx:541-557 (hint handler)
  → setHintsRevealed() - updates state
  → labState.sendMessage() - sends IPC (works, telemetry logged)
  → return
  → React re-render with new hint visible
  → CRASH (somewhere in render cycle?)
```

## Relevant Files

| File | Purpose |
|------|---------|
| `src/canvases/vta.tsx:541-557` | Hint key handler |
| `src/canvases/vta/components/task-panel.tsx:152-190` | HintsSection render |
| `src/canvases/vta/hooks/use-lab-feedback.ts:45-54` | sendMessage implementation |

## Hypothesis

The crash occurs during React re-render after `setHintsRevealed()` updates state. Possible causes:

1. **Ink rendering issue** - Something in the hint render causes Ink to crash
2. **Race condition** - State update conflicts with IPC message handling
3. **Memory/reference issue** - `hintsRevealed` Set handling

## Not the Cause

- IPC sendMessage (has try-catch, telemetry proves it completes)
- Missing type definition (types are correct)
- Missing hint data (hint displays before crash)

## Environment

- macOS Darwin 25.2.0
- Bun 1.3.6
- tmux with `--no-tutor` flag
- Lab: `shell-navigation`

## Suggested Investigation

1. Add console.log before/after `setHintsRevealed()` to narrow timing
2. Check if crash happens without IPC (comment out `labState.sendMessage`)
3. Test with React StrictMode disabled
4. Check Ink library for known issues with Set state updates

## Status Updates

**2026-01-27:** Could not reproduce on second test. Hint revealed successfully 3 times without crash. Telemetry logged correctly. Marking as intermittent - may be related to tmux focus timing or Ink render race condition. Archiving for now.

# VTA Telemetry Implementation Brief

**For:** Junior Developer
**Task:** Make VTA emit telemetry events for user interactions
**Codebase:** `canvas-labs/packages/canvas-plugin/src/`

---

## The Problem

When students interact with VTA (reveal hints, view solutions, answer questions), these interactions are not logged to telemetry. The tutor can't see what the student did.

**Current state:**
- VTA updates its UI when student reveals hint ✓
- VTA updates its UI when student answers question ✓
- But: NO telemetry events are written to `telemetry.jsonl`

**Goal:**
- Every VTA interaction → telemetry event → tutor can see it

---

## Architecture Overview

```
Student clicks "Reveal Hint"
    │
    ▼
VTA (vta.tsx)
    │ sends IPC message
    ▼
Event Hub (hub.ts)
    │ receives message, emits telemetry
    ▼
telemetry.jsonl
    │
    ▼
Tutor reads and understands student behavior
```

---

## Files You'll Modify

| File | What to do |
|------|------------|
| `src/ipc/types.ts` | Add new message types |
| `src/canvases/vta.tsx` | Send IPC messages when interactions happen |
| `src/lab/event-hub/hub.ts` | Handle incoming VTA messages, emit telemetry |

---

## Step 1: Add IPC Message Types

**File:** `src/ipc/types.ts`

Add these to the `LabMessage` union type (around line 51):

```typescript
export type LabMessage =
  | { type: "taskCompleted"; ... }
  | { type: "labStatus"; ... }
  // ... existing types ...

  // ADD THESE:
  | { type: "hintRequested"; stepId: string; hintIndex: number; totalHints: number }
  | { type: "solutionViewed"; stepId: string }
  // questionAnswered already exists (line 56)
```

---

## Step 2: Send IPC Messages from VTA

**File:** `src/canvases/vta.tsx`

### 2a. Hint Revealed (around line 541-548)

**Current code:**
```typescript
if (input === "h" || input === "H") {
  const hints = currentStep.content.hints || [];
  const nextHint = hints.find((h) => !hintsRevealed.has(h.id));
  if (nextHint) {
    setHintsRevealed((prev) => new Set([...prev, nextHint.id]));
  }
  return;
}
```

**Change to:**
```typescript
if (input === "h" || input === "H") {
  const hints = currentStep.content.hints || [];
  const nextHint = hints.find((h) => !hintsRevealed.has(h.id));
  if (nextHint) {
    const hintIndex = hints.findIndex((h) => h.id === nextHint.id);
    setHintsRevealed((prev) => new Set([...prev, nextHint.id]));

    // Send telemetry via IPC
    if (isLabMode) {
      labState.sendMessage({
        type: "hintRequested",
        stepId: currentStep.id,
        hintIndex: hintIndex,
        totalHints: hints.length,
      });
    }
  }
  return;
}
```

### 2b. Solution Viewed (around line 551-554)

**Current code:**
```typescript
if (input === "s" || input === "S") {
  setSolutionRevealed((prev) => !prev);
  return;
}
```

**Change to:**
```typescript
if (input === "s" || input === "S") {
  const wasRevealed = solutionRevealed;
  setSolutionRevealed((prev) => !prev);

  // Send telemetry when revealing (not hiding)
  if (!wasRevealed && isLabMode) {
    labState.sendMessage({
      type: "solutionViewed",
      stepId: currentStep.id,
    });
  }
  return;
}
```

### 2c. Question Answered (already sends, verify around line 481-492)

This already sends `questionAnswered` - just verify it's working. The code is:
```typescript
if (isLabMode) {
  const msg: LabMessage = {
    type: "questionAnswered",
    stepId: currentStep.id,
    isCorrect,
    selectedOptions: userAnswerIds,
    correctOptions: correctOptionIds,
    attempts: 1,
  };
  labState.sendMessage(msg);
}
```

---

## Step 3: Handle Messages in Event Hub

**File:** `src/lab/event-hub/hub.ts`

Find the socket data handler (around line 160-170). It currently looks like:

```typescript
data(socket, data) {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line) as LabMessage;
        // Handle incoming messages from vTA if needed  <-- THIS IS EMPTY!
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
}
```

**Change to:**
```typescript
data(socket, data) {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line) as LabMessage;
        handleVTAMessage(msg);  // ADD THIS
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
}
```

**Add this function** inside `createEventHub` (before the `return` statement):

```typescript
/**
 * Handle incoming messages from VTA canvas
 */
function handleVTAMessage(msg: LabMessage): void {
  if (!eventLogger) return;

  switch (msg.type) {
    case "hintRequested":
      eventLogger.logHintRequested(
        msg.stepId,
        msg.hintIndex,
        msg.totalHints
      );
      log(`VTA: Hint requested for step ${msg.stepId} (${msg.hintIndex + 1}/${msg.totalHints})`);
      break;

    case "solutionViewed":
      eventLogger.logSolutionViewed(msg.stepId);
      log(`VTA: Solution viewed for step ${msg.stepId}`);
      break;

    case "questionAnswered":
      eventLogger.logQuestionAnswered(
        msg.stepId,
        msg.isCorrect,
        msg.selectedOptions,
        msg.correctOptions,
        msg.attempts
      );
      log(`VTA: Question answered for step ${msg.stepId} (correct: ${msg.isCorrect})`);

      // Also mark step as complete if answer is correct
      if (msg.isCorrect && !completedSteps.has(msg.stepId)) {
        handleStepCompleted({
          stepId: msg.stepId,
          source: "question",
          taskIndex: 0,
        });
      }
      break;
  }
}
```

---

## Step 4: Test Your Changes

### 4.1 Run Existing Tests First

Before making changes, run the existing tests to establish a baseline:

```bash
cd packages/canvas-plugin
bun test
```

Key test files to watch:
- `src/test-harness/__tests__/tui-environment.test.ts` - has hint/solution telemetry tests
- `src/lab/telemetry/__tests__/event-logger.test.ts` - event logger tests
- `src/lab/__tests__/ipc.test.ts` - IPC tests

### 4.2 Automated Testing (Test Harness)

The test harness already has tests for hint and solution telemetry. After your changes, these should pass:

```bash
# Run specific telemetry tests
cd packages/canvas-plugin
bun test src/test-harness/__tests__/tui-environment.test.ts
```

**Existing tests that verify your work** (in `tui-environment.test.ts`):

```typescript
// Lines 118-127: Test hint telemetry
test("should log hint requests", async () => {
  await env.executeAction({
    type: "hint",
    stepId: "step-1",
    hintIndex: 0,
  });
  const events = env.getEvents();
  expect(events.some((e) => e.event_type === "hint_requested")).toBe(true);
});

// Lines 129-137: Test solution telemetry
test("should log solution views", async () => {
  await env.executeAction({
    type: "solution",
    stepId: "step-1",
  });
  const events = env.getEvents();
  expect(events.some((e) => e.event_type === "solution_viewed")).toBe(true);
});
```

### 4.3 Manual Testing (TUI)

> **Reference:** See the TUI testing skill at `.claude/skills/TUI-presentation-test/SKILL.md` for similar manual testing patterns.

Test the full VTA flow manually:

1. **Start a lab session:**
   ```bash
   cd canvas-labs/packages/canvas-plugin
   bun run src/cli.ts lab linux-user-management
   ```

2. **Test interactions in VTA:**
   - Press `h` to reveal a hint
   - Press `s` to reveal solution
   - Navigate to a question step, press `1` to select, press `Enter` to submit

3. **Verify telemetry was logged:**
   ```bash
   cat /tmp/lab-logs-*/telemetry.jsonl | jq -c '.event_type'
   ```

   You should see:
   ```
   "session_started"
   "hint_requested"
   "solution_viewed"
   "question_answered"
   ```

4. **Inspect full event details:**
   ```bash
   cat /tmp/lab-logs-*/telemetry.jsonl | jq 'select(.event_type == "hint_requested")'
   ```

### 4.4 Write a New Test (Optional)

If you want to add a focused test for the VTA IPC flow:

**File:** `src/lab/__tests__/vta-telemetry.test.ts` (new file)

```typescript
import { describe, test, expect } from "bun:test";
import { createEventLogger } from "../telemetry/event-logger";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("VTA Telemetry via IPC", () => {
  test("should log hint_requested event", () => {
    const logDir = mkdtempSync(join(tmpdir(), "test-"));
    const logger = createEventLogger({
      logDir,
      moduleId: "test-module",
      studentId: "test-student",
    });

    logger.logHintRequested("step-1", 0, 2);

    const events = logger.getEvents();
    const hintEvent = events.find((e) => e.event_type === "hint_requested");

    expect(hintEvent).toBeDefined();
    expect(hintEvent?.payload).toEqual({
      step_id: "step-1",
      hint_index: 0,
      total_hints: 2,
    });
  });

  test("should log solution_viewed event", () => {
    const logDir = mkdtempSync(join(tmpdir(), "test-"));
    const logger = createEventLogger({
      logDir,
      moduleId: "test-module",
      studentId: "test-student",
    });

    logger.logSolutionViewed("step-1");

    const events = logger.getEvents();
    const solutionEvent = events.find((e) => e.event_type === "solution_viewed");

    expect(solutionEvent).toBeDefined();
    expect(solutionEvent?.payload?.step_id).toBe("step-1");
  });
});
```

Run your new test:
```bash
bun test src/lab/__tests__/vta-telemetry.test.ts
```

---

## Summary of Changes

| Change | File | Lines |
|--------|------|-------|
| Add `hintRequested` message type | `ipc/types.ts` | ~56 |
| Add `solutionViewed` message type | `ipc/types.ts` | ~57 |
| Send hint IPC in VTA | `canvases/vta.tsx` | ~541-548 |
| Send solution IPC in VTA | `canvases/vta.tsx` | ~551-554 |
| Handle VTA messages in hub | `lab/event-hub/hub.ts` | ~160-170 |

---

## Existing Code References

Study these to understand the patterns:

1. **How IPC messages are sent from VTA:**
   - `vta.tsx:481-492` - existing `questionAnswered` message

2. **How Event Logger writes events:**
   - `telemetry/event-logger.ts:169-179` - `logHintRequested`
   - `telemetry/event-logger.ts:182-192` - `logSolutionViewed`
   - `telemetry/event-logger.ts:231-250` - `logQuestionAnswered`

3. **How Event Hub handles step completion:**
   - `event-hub/hub.ts:93-130` - `handleStepCompleted` function

---

## Questions?

If you get stuck:
1. Check the existing patterns in the code (especially `questionAnswered`)
2. Look at the telemetry event logger to see what parameters each method expects
3. Test incrementally - get one event working before moving to the next

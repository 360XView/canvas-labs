# Telemetry Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add missing telemetry events to better understand student behavior: step navigation, time on steps, and session lifecycle.

**Architecture:** VTA sends IPC messages to Event Hub on user interactions. Event Hub logs to telemetry via EventLogger. We add `stepViewed` IPC message and corresponding `step_started` telemetry event.

**Tech Stack:** React/Ink (VTA), Bun (IPC), JSONL telemetry files

---

## Audit Summary (from Phase 1)

### Currently Emitted Events
| Event | Status | Location |
|-------|--------|----------|
| `session_started` | ✓ | hub.ts |
| `session_ended` | ✓ | hub.ts |
| `command_executed` | ✓ | event-logger.ts (dual-write) |
| `student_action` | ✓ | hub.ts |
| `check_passed` | ✓ | hub.ts |
| `step_completed` | ✓ | hub.ts |
| `hint_requested` | ✓ | hub.ts |
| `solution_viewed` | ✓ | hub.ts |
| `question_answered` | ✓ | hub.ts |

### Events NOT Being Emitted (to implement)
| Event | Priority | Reason |
|-------|----------|--------|
| `step_started` | **HIGH** | Track when user views a step, time spent |
| `check_failed` | **SKIP** | Too noisy - checks run every 2s |

### Events Deferred (future work)
| Event | Notes |
|-------|-------|
| `idle_detected` | Requires timer infrastructure |
| `tutor_*` events | No tutor-watcher exists yet |
| `terminal_resized` | Low priority UX insight |

---

## Task 1: Add `stepViewed` IPC Message Type

**Files:**
- Modify: `packages/canvas-plugin/src/ipc/types.ts:51-65`

**Step 1: Add the message type to LabMessage union**

Add after line 58 (after `solutionViewed`):

```typescript
| { type: "stepViewed"; stepId: string; previousStepId?: string; stepType: "introduction" | "task" | "question" | "summary" }
```

**Step 2: Verify types compile**

Run: `cd packages/canvas-plugin && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/canvas-plugin/src/ipc/types.ts
git commit -m "feat(telemetry): add stepViewed IPC message type"
```

---

## Task 2: Handle `stepViewed` in Event Hub

**Files:**
- Modify: `packages/canvas-plugin/src/lab/event-hub/hub.ts:143-169`

**Step 1: Add handler case in handleVTAMessage**

Add after the `solutionViewed` case (around line 154):

```typescript
case "stepViewed":
  eventLogger.logStepStarted(msg.stepId, msg.stepType);
  log(`VTA: Step viewed: ${msg.stepId} (${msg.stepType})`);
  break;
```

**Step 2: Verify types compile**

Run: `cd packages/canvas-plugin && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/canvas-plugin/src/lab/event-hub/hub.ts
git commit -m "feat(telemetry): handle stepViewed in event hub"
```

---

## Task 3: Send `stepViewed` from VTA on Navigation

**Files:**
- Modify: `packages/canvas-plugin/src/canvases/vta.tsx:300-322`

**Step 1: Add useEffect to send stepViewed on step change**

Find the existing useEffect that resets state when step changes (around line 301-306):

```typescript
// Reset state when step changes
useEffect(() => {
  setHintsRevealed(new Set());
  setSolutionRevealed(false);
  setSelectedOptions(new Set());
  setScrollOffset(0);
}, [currentStepIndex]);
```

Replace with:

```typescript
// Reset state when step changes and send telemetry
useEffect(() => {
  setHintsRevealed(new Set());
  setSolutionRevealed(false);
  setSelectedOptions(new Set());
  setScrollOffset(0);

  // Send step viewed telemetry in lab mode
  if (isLabMode && currentStep) {
    labState.sendMessage({
      type: "stepViewed",
      stepId: currentStep.id,
      stepType: currentStep.type as "introduction" | "task" | "question" | "summary",
    });
  }
}, [currentStepIndex, isLabMode, currentStep?.id, currentStep?.type, labState]);
```

**Step 2: Verify types compile**

Run: `cd packages/canvas-plugin && bun run tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/canvas-plugin/src/canvases/vta.tsx
git commit -m "feat(telemetry): send stepViewed on VTA navigation"
```

---

## Task 4: Write Integration Test

**Files:**
- Create: `packages/canvas-plugin/src/lab/telemetry/__tests__/step-viewed.test.ts`

**Step 1: Write test for step_started event emission**

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createEventLogger } from "../event-logger";

describe("step_started telemetry", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("logStepStarted emits step_started event with correct payload", () => {
    const logger = createEventLogger({
      logDir: tempDir,
      moduleId: "test-module",
      studentId: "test-student",
    });

    logger.startSession(1);
    logger.logStepStarted("step-1", "task");

    const events = logger.getEvents();
    const stepStartedEvent = events.find((e) => e.event_type === "step_started");

    expect(stepStartedEvent).toBeDefined();
    expect(stepStartedEvent?.event_type).toBe("step_started");
    if (stepStartedEvent?.event_type === "step_started") {
      expect(stepStartedEvent.payload.step_id).toBe("step-1");
      expect(stepStartedEvent.payload.step_type).toBe("task");
    }
  });

  test("step_started events are written to telemetry.jsonl", () => {
    const logger = createEventLogger({
      logDir: tempDir,
      moduleId: "test-module",
      studentId: "test-student",
    });

    logger.startSession(1);
    logger.logStepStarted("intro", "introduction");
    logger.logStepStarted("task-1", "task");
    logger.logStepStarted("quiz", "question");

    const content = readFileSync(join(tempDir, "telemetry.jsonl"), "utf-8");
    const lines = content.trim().split("\n");
    const events = lines.map((l) => JSON.parse(l));

    const stepStartedEvents = events.filter((e) => e.event_type === "step_started");
    expect(stepStartedEvents).toHaveLength(3);
    expect(stepStartedEvents[0].payload.step_type).toBe("introduction");
    expect(stepStartedEvents[1].payload.step_type).toBe("task");
    expect(stepStartedEvents[2].payload.step_type).toBe("question");
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd packages/canvas-plugin && bun test src/lab/telemetry/__tests__/step-viewed.test.ts`
Expected: PASS (logStepStarted already exists, just not called)

**Step 3: Commit**

```bash
git add packages/canvas-plugin/src/lab/telemetry/__tests__/step-viewed.test.ts
git commit -m "test(telemetry): add step_started event tests"
```

---

## Task 5: Update Timeline Viewer (if exists)

**Files:**
- Check: `packages/canvas-plugin/src/canvases/timeline/` (if exists)

**Step 1: Check if timeline viewer exists**

Run: `ls packages/canvas-plugin/src/canvases/timeline/`

If exists, add `step_started` to the event type handlers. If not, skip this task.

**Step 2: (If exists) Add explanation for step_started**

In `explainer.ts`, add case:

```typescript
case "step_started":
  return `Student navigated to step "${event.payload.step_id}" (${event.payload.step_type})`;
```

**Step 3: Commit (if changes made)**

```bash
git add packages/canvas-plugin/src/canvases/timeline/
git commit -m "feat(timeline): add step_started event explanation"
```

---

## Task 6: Manual Integration Test

**Step 1: Start a lab**

```bash
cd packages/canvas-plugin && bun run src/cli.ts lab linux-user-management
```

**Step 2: Navigate between steps using arrow keys**

Press right arrow 2-3 times to move through steps.

**Step 3: Check telemetry file**

```bash
cat /tmp/lab-logs-*/telemetry.jsonl | grep step_started
```

Expected: See `step_started` events with step_id and step_type for each navigation.

**Step 4: Exit lab and verify session_ended**

Press `q` to quit.

```bash
cat /tmp/lab-logs-*/telemetry.jsonl | grep session_ended
```

Expected: See `session_ended` event.

---

## Task 7: Update Documentation

**Files:**
- Modify: `docs/plans/telemetry-improvements.md`

**Step 1: Update the audit table**

Change `step_started` row from `?` to `✓` and add implementation note.

**Step 2: Add note about check_failed decision**

Add under Phase 2:

```markdown
### Decisions

- **`check_failed` - SKIPPED**: Too noisy. Checks run every 2 seconds in polling loop, would flood telemetry with failures before student completes task. The `student_action` event with `result: "failure"` captures command-level failures which is sufficient.
```

**Step 3: Commit**

```bash
git add docs/plans/telemetry-improvements.md
git commit -m "docs: update telemetry plan with implementation status"
```

---

## Summary

After completing all tasks:

| Event | Before | After |
|-------|--------|-------|
| `step_started` | Defined, never emitted | ✓ Emitted on VTA navigation |
| `check_failed` | Defined, never emitted | SKIPPED (too noisy) |

**New capabilities:**
- Track which steps students view
- Calculate time spent on each step (via timestamp diff)
- Identify navigation patterns (skipping steps, going back)

**Future work (not in this plan):**
- `idle_detected` - requires timer infrastructure
- `tutor_*` events - requires tutor-watcher component

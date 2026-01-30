# Telemetry Improvements Plan

> **For Claude:** Review existing telemetry, identify gaps, and implement missing event logging to better understand user behavior and system responses.

**Goal:** Comprehensive telemetry that answers: Where do students get stuck? What mistakes are common? Is the tutor helping?

**Codebase:** `/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs`

---

## Phase 1: Audit Current Telemetry

### Step 1: Find all telemetry emission points

Search for where telemetry events are created:

```bash
# Find telemetry emission
rg "event_type" packages/canvas-plugin/src --type ts
rg "emit.*event" packages/canvas-plugin/src --type ts
rg "telemetry" packages/canvas-plugin/src --type ts
```

### Step 2: Document current event types

Check `packages/canvas-plugin/src/` for:
- `telemetry.jsonl` writing code
- Event type definitions
- Payload structures

**Known event types (from sample capture):**
| event_type | Logged? | Payload |
|------------|---------|---------|
| `session_started` | ✓ | attempt_number |
| `session_ended` | ✓ | steps_completed, total_time |
| `command_executed` | ✓ | command, exit_code, cwd |
| `student_action` | ✓ | action_kind, action, result, evidence |
| `check_passed` | ✓ | step_id, source |
| `step_completed` | ✓ | step_id, source |
| `step_started` | ✓ | step_id, step_type (added 2026-01-30) |
| `hint_requested` | ✓ | step_id, hint_index, total_hints |
| `solution_viewed` | ✓ | step_id |
| `question_answered` | ✓ | step_id, is_correct, selected_options, correct_options, attempts |
| `check_failed` | ✗ | Skipped - too noisy (see Decisions below) |

### Step 3: Create checklist of current state

After auditing, update this table with ✓ or ✗ for each event type.

---

## Decisions

- **`check_failed` - SKIPPED**: Too noisy. Checks run every 2 seconds in polling loop, would flood telemetry with failures before student completes task. The `student_action` event with `result: "failure"` captures command-level failures which is sufficient.

- **`step_started` - IMPLEMENTED** (2026-01-30): Added `stepViewed` IPC message from VTA on navigation, handled in Event Hub to emit `step_started` telemetry. Enables tracking time spent on each step and navigation patterns.

---

## Phase 2: Identify Missing Events

### User Navigation Events (VTA)

| Event | Purpose | Suggested Payload |
|-------|---------|-------------------|
| `step_viewed` | User navigated to a step | `{ step_id, previous_step_id, time_on_previous }` |
| `step_expanded` | User expanded step details | `{ step_id }` |
| `step_collapsed` | User collapsed step details | `{ step_id }` |
| `hint_expanded` | User opened hint accordion | `{ step_id, hint_level }` |
| `solution_expanded` | User opened solution | `{ step_id, time_spent_before }` |

**Where to implement:** VTA component (`packages/canvas-plugin/src/canvases/vta/`)

### User Struggle Events

| Event | Purpose | Suggested Payload |
|-------|---------|-------------------|
| `check_failed` | Check ran but didn't pass | `{ step_id, check_script, error_output }` |
| `command_failed` | Command returned non-zero | `{ command, exit_code, stderr }` |
| `repeated_attempt` | Same command run multiple times | `{ command, attempt_count }` |
| `idle_detected` | No activity for 30+ seconds | `{ step_id, idle_duration }` |

**Where to implement:**
- Check failures: Orchestrator (`packages/canvas-plugin/src/lab/`)
- Command failures: Command logger
- Idle detection: tutor-watcher or new component

### Tutor Interaction Events

| Event | Purpose | Suggested Payload |
|-------|---------|-------------------|
| `tutor_message_sent` | Tutor AI responded | `{ message_preview, context_size }` |
| `tutor_event_received` | TUTOR:EVENT was processed | `{ trigger, steps_completed }` |
| `tutor_busy_skipped` | Event skipped due to busy | `{ trigger }` |

**Where to implement:** tutor-watcher (`packages/canvas-plugin/src/tutor/`)

### Session Context Events

| Event | Purpose | Suggested Payload |
|-------|---------|-------------------|
| `session_paused` | User idle for 5+ minutes | `{ step_id, duration }` |
| `session_resumed` | Activity after pause | `{ step_id, pause_duration }` |
| `terminal_resized` | Viewport changed | `{ width, height }` |
| `session_ended` | Lab closed/completed | `{ steps_completed, total_time, hints_used }` |

---

## Phase 3: Implementation

### Priority Order

1. **High value, easy to add:**
   - `check_failed` (add alongside check_passed)
   - `hint_requested` / `solution_viewed` (verify these exist)
   - `step_viewed` (VTA navigation)

2. **High value, medium effort:**
   - `tutor_message_sent` (capture tutor responses)
   - `idle_detected` (add timer to tutor-watcher)
   - `session_ended` (cleanup handler)

3. **Nice to have:**
   - `repeated_attempt` (requires command history tracking)
   - `terminal_resized` (SIGWINCH handler)

### Implementation Pattern

For each new event:

```typescript
// 1. Define event type
interface TelemetryEvent {
  event_id: string;
  timestamp: string;
  session_id: string;
  module_id: string;
  student_id: string;
  step_id?: string;
  event_type: string;  // Add new type here
  payload: Record<string, unknown>;
}

// 2. Add emission function or use existing
function emitTelemetry(eventType: string, payload: object) {
  // ... append to telemetry.jsonl
}

// 3. Call at appropriate point
emitTelemetry('step_viewed', {
  step_id: currentStep,
  previous_step_id: prevStep,
  time_on_previous: elapsed
});
```

### Files to Modify

| Component | File(s) | Events to Add |
|-----------|---------|---------------|
| VTA | `src/canvases/vta/*.tsx` | step_viewed, step_expanded, hint/solution |
| Orchestrator | `src/lab/orchestrator.ts` | check_failed |
| tutor-watcher | `src/tutor/watcher.ts` | tutor events, idle detection |
| Session | `src/lab/session.ts` | session_paused, session_resumed, session_ended |

---

## Phase 4: Verification

### Update Timeline Viewer

After adding new events, update the timeline viewer to display them:

1. **Parser** (`src/canvases/timeline/parser.ts`): Handle new event types
2. **Explainer** (`src/canvases/timeline/explainer.ts`): Add explanations
3. **Types** (`src/canvases/timeline/types.ts`): Add to Track if needed

### Test with Sample Capture

1. Run a lab with new telemetry
2. Open in timeline viewer: `bun run src/cli.ts timeline /path/to/capture --assistant`
3. Verify new events appear and have good explanations
4. Ask assistant to analyze - does it provide better insights?

---

## Success Criteria

After implementation, we should be able to answer:

- [ ] Which step took the longest?
- [ ] How many failed attempts before success?
- [ ] Did the student use hints? Which ones?
- [ ] Did they view solutions? When?
- [ ] Was the tutor helpful? (correlation: tutor message → subsequent success)
- [ ] Where do students commonly get stuck?
- [ ] How much idle time (thinking vs confused)?

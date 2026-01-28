# Multi-Lab Telemetry Architecture Design

**Date:** January 24, 2026
**Status:** Design (Ready for Implementation)
**Scope:** Extend Canvas to support Linux CLI, Splunk, and Python labs with unified telemetry

---

## 1. Executive Summary

Canvas currently supports only Linux CLI labs with a tightly coupled command-capture and check-script validation model. This design extends Canvas to support multiple lab types (Splunk, Python, etc.) using the **tutor-workbook-lab model** with a **unified event adapter pattern**.

Key insight: Instead of forcing each lab type into the existing command/check architecture, we normalize all lab outputs into a common telemetry schema via adapters. This allows:
- Each lab type to use its native tools (Splunk queries, Python tests, CLI commands)
- The workbook (vTA) to remain lab-agnostic
- Claude Code tutor to have full visibility into student actions regardless of lab type
- Easy addition of new lab types without architectural refactoring

---

## 2. Architecture Overview

### 2.1 System Layers

```
┌────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                         │
│                    Workbook (vTA Canvas)                       │
│  - Steps/tasks sidebar, hints, solutions, progress tracking   │
│  - Receives completion events via IPC                         │
│  - Lab-agnostic (doesn't know lab type)                       │
└────────────────────────────────────────────────────────────────┘
                              ▲
                              │ reads state
                              │
                    ┌─────────┴─────────┐
                    │   Event Hub       │
                    │   (Orchestrator)  │
                    │   telemetry.jsonl │
                    └─────────┬─────────┘
                    ▲         │         ▲
                    │         │         │
         ┌──────────┴─────────┴─────────┴──────────┐
         │     LAB ADAPTERS (Normalize Events)     │
         └──────────┬─────────┬─────────┬──────────┘
                    │         │         │
         ┌──────────▼──┐  ┌───▼──────┐  ┌──────────▼──┐
         │ Linux CLI   │  │ Splunk   │  │  Python     │
         │ Adapter     │  │ Adapter  │  │  Adapter    │
         └──────────┬──┘  └───┬──────┘  └──────────┬──┘
                    │         │         │
         ┌──────────▼──┐  ┌───▼──────┐  ┌──────────▼──┐
         │ Monitor     │  │ Query    │  │ Code        │
         │ Process     │  │ Monitor  │  │ Submitter   │
         └─────────────┘  └──────────┘  └─────────────┘
         │                │                │
         │ Linux labs     │ Splunk         │ Python IDE +
         │ (Docker +      │ (Web queries   │ Agent
         │  commands)     │  on logs)      │

┌────────────────────────────────────────────────────────────────┐
│                    TUTOR LAYER                                 │
│               Claude Code Agent                               │
│  - Reads telemetry.jsonl (full event history)                │
│  - Reads state.json (completed steps, metadata)              │
│  - Analyzes patterns, struggles, misunderstandings           │
│  - Provides contextual hints and feedback                    │
│  - Can mark steps complete or inject new tasks               │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Key Design Principles

1. **Workbook-Lab Separation**: Workbook is a dumb renderer of state; lab does the work
2. **Event Adapter Pattern**: Each lab type has native monitor + thin adapter layer
3. **Unified Telemetry**: All events normalized to common schema, stored in single JSONL file
4. **Lab Agnostic**: Workbook doesn't care which lab is running (Linux/Splunk/Python)
5. **Extensible**: Adding a new lab type = new adapter + monitor, no core changes
6. **Full Tutor Visibility**: Claude Code sees all student actions, not just pass/fail

---

## 3. Unified Event Schema

All telemetry events, regardless of lab type, conform to this schema:

```json
{
  "event_id": "evt-a1b2c3d4",
  "timestamp": "2024-01-24T10:30:45.123Z",
  "session_id": "sess-x8y9z0w1",
  "module_id": "linux-user-management",
  "lab_type": "linux_cli|splunk|python",
  "student_id": "anonymous",
  "step_id": "become-root",
  "event_type": "student_action|check_passed|check_failed|hint_requested|solution_viewed|step_completed|session_started|session_ended",

  "action_kind": "execute_command|execute_query|submit_code|view_hint|view_solution",
  "result": "success|failure|partial",

  "evidence": {
    // Lab-specific details (preserved as-is for tutor analysis)
    "command": "sudo su",           // linux_cli specific
    "exit_code": 0,

    "query": "index=main sourcetype=access",  // splunk specific
    "result_count": 42,
    "finding_confidence": 0.85,

    "code": "print('hello')",        // python specific
    "test_name": "test_hello",
    "test_passed": true,

    "source": "command|check|tutor",
    "tool_name": "check-user-exists.sh|pytest"
  },

  "metadata": {
    "retry_count": 0,
    "hints_revealed": 0,
    "solution_viewed": false,
    "task_index": 0
  }
}
```

**Key insights:**
- `event_type` and `action_kind` are standardized across all labs
- `lab_type` tells tutor how to interpret `evidence`
- `evidence` contains raw lab-specific data (tutor can see complete picture)
- `result` (success/failure/partial) enables uniform scoring logic
- `metadata` tracks learning signals (hints, retries) consistently

---

## 4. Lab Type Implementations

### 4.1 Linux CLI Lab (Existing, Refactored)

```
Docker Container (Linux)
    │
    ├─ commands.log (JSON)  ◄─ PROMPT_COMMAND hook
    │  └─ {"command":"sudo su", "exit_code":0, ...}
    │
    └─ checks.log (Text)  ◄─ Background polling
       └─ "[check:become-root.sh] PASSED"

    │
    ▼ (Volume mount to host)

Host: /tmp/lab-logs-{id}/
    │
    ├─ Monitor Process (spawn.ts refactored)
    │  ├─ Watch commands.log & checks.log
    │  └─ Validate against rules
    │
    └─ Linux CLI Adapter
       └─ Convert:
          - {command, exit_code} → {action_kind, result, evidence}
          - Pass to Event Hub
```

**Event examples from Linux labs:**
```json
{"event_type":"student_action","action_kind":"execute_command","result":"success","evidence":{"command":"sudo su","exit_code":0,"source":"command"},"lab_type":"linux_cli"}
{"event_type":"check_passed","evidence":{"source":"check","tool_name":"check-user-exists.sh"},"lab_type":"linux_cli"}
```

### 4.2 Splunk Lab (New)

```
Splunk Server (Pre-loaded logs)
    │
    └─ Student submits SPL query via Web UI
       └─ Query Monitor watches Splunk API / Web logs

       ├─ Query executed
       ├─ Results retrieved (e.g., found attacker IPs)
       └─ Log to query log file

       │
       ▼ (Local file or API polling)

Host: /tmp/lab-logs-{id}/
    │
    ├─ Splunk Query Monitor (new)
    │  ├─ Poll Splunk API for query results
    │  ├─ Analyze findings vs known-good results
    │  └─ Emit events
    │
    └─ Splunk Adapter
       └─ Convert:
          - {query, results, finding_confidence} → {action_kind, result, evidence}
          - Pass to Event Hub
```

**Event examples from Splunk labs:**
```json
{"event_type":"student_action","action_kind":"execute_query","result":"partial","evidence":{"query":"index=main sourcetype=access | stats count","result_count":42,"finding_confidence":0.65},"lab_type":"splunk"}
{"event_type":"check_passed","evidence":{"query":"...","result_count":42,"source":"query_validation"},"lab_type":"splunk"}
```

### 4.3 Python Lab (New)

```
Student IDE (Local or Web-based)
    │
    └─ Student writes code, submits for testing
       └─ Code Submitter (SMP Agent) receives code

       ├─ Runs tests (pytest)
       ├─ Captures output (pass/fail)
       └─ Emits event

       │
       ▼ (HTTP or IPC to host)

Host: /tmp/lab-logs-{id}/
    │
    ├─ Code Submission Handler (new)
    │  ├─ Receive code from IDE
    │  ├─ Execute tests
    │  └─ Emit events
    │
    └─ Python Adapter
       └─ Convert:
          - {code, test_results, coverage} → {action_kind, result, evidence}
          - Pass to Event Hub
```

**Event examples from Python labs:**
```json
{"event_type":"student_action","action_kind":"submit_code","result":"failure","evidence":{"code":"def add(a,b):\n  return a","test_name":"test_add","test_output":"AssertionError: expected 3, got 1"},"lab_type":"python"}
{"event_type":"check_passed","evidence":{"test_name":"test_add","test_passed":true,"coverage":0.95},"lab_type":"python"}
```

---

## 5. Event Hub (Central Orchestrator)

The Event Hub is the single point where all adapters converge. It:

```typescript
// Responsibilities:
1. Receives events from any adapter
2. Validates against schema
3. Appends to telemetry.jsonl (immutable event log)
4. Broadcasts to vTA canvas via IPC (real-time UI updates)
5. Updates state.json (for tutor to read)
6. Maintains completedSteps deduplication

// Interface:
class EventHub {
  async logEvent(event: CanvasEvent): Promise<void>
  async getState(): Promise<LabState>
  async broadcastToVTA(message: LabMessage): Promise<void>
  async updateCompletedSteps(stepId, source): Promise<void>
}
```

**Data flow:**
```
Adapter emits:
{
  action_kind: "execute_command",
  result: "success",
  evidence: {...}
}
  │
  ▼
Event Hub validates schema
  │
  ├─ Append to telemetry.jsonl
  ├─ Check if step completed
  ├─ Update state.json
  ├─ Send IPC to vTA
  └─ Tutor can read immediately
```

---

## 6. Tutor Feedback Loop

Claude Code tutor has two data sources:

### 6.1 State File (Current Snapshot)
```json
{
  "session_id": "sess-x8y9z0w1",
  "lab_type": "splunk",
  "module_id": "splunk-attack-detection",
  "completed_steps": [
    {
      "step_id": "intro",
      "completed_at": "2024-01-24T10:30:45Z",
      "source": "tutor"
    },
    {
      "step_id": "find-attacker",
      "completed_at": "2024-01-24T10:31:22Z",
      "source": "check"
    }
  ],
  "current_step_id": "find-attacker",
  "in_progress_steps": ["find-attacker"],
  "lab_context": {
    // Lab-specific context (e.g., which logs are available)
  }
}
```

### 6.2 Telemetry File (Complete History)
```jsonl
{"event_type":"student_action","action_kind":"execute_query","result":"failure","evidence":{"query":"index=main | stats count"},...}
{"event_type":"hint_requested","step_id":"find-attacker",...}
{"event_type":"student_action","action_kind":"execute_query","result":"success","evidence":{"query":"index=main sourcetype=access user=admin FAILED",...}}
```

**Tutor analysis:**
```
Read state.json + telemetry.jsonl
  │
  ├─ Student is on "find-attacker" step
  ├─ 1st query failed (wrong syntax)
  ├─ 2nd query succeeded (found attacker)
  ├─ Asked for 1 hint
  │
  ▼
Determine: "Student struggled with query syntax, then figured it out"
  │
  ├─ Praise the learning
  ├─ Offer optional: "Here's a simpler way to write SPL..."
  ├─ Suggest: "Next, can you identify ALL attackers, not just one?"
  └─ Or: Mark step complete automatically if criteria met
```

---

## 7. Architectural Changes Required

### 7.1 Code Structure Changes

**New directories:**
```
src/lab/
├── adapters/                  # NEW
│   ├── linux-cli-adapter.ts   # Refactored from monitor.ts
│   ├── splunk-adapter.ts      # NEW
│   └── python-adapter.ts      # NEW
│
├── monitors/                  # NEW (split from monitor.ts)
│   ├── linux-cli-monitor.ts
│   ├── splunk-monitor.ts
│   └── python-monitor.ts
│
├── event-hub/                 # NEW (core hub)
│   ├── event-hub.ts
│   ├── event-schema.ts
│   └── deduplicator.ts
│
├── monitor.ts                 # REMOVE (refactored into adapters + hub)
├── spawn.ts                   # KEEP (still orchestrates lab startup)
└── healthcheck.ts             # KEEP (mostly lab-agnostic)
```

### 7.2 Data Flow Changes

**Old (Linux-only):**
```
Docker → commands.log/checks.log → Monitor → Telemetry + IPC → vTA
```

**New (Multi-lab):**
```
Lab (any type) → Native output → Monitor → Adapter → Event Hub → {Telemetry + IPC, state.json} → {vTA, Tutor}
```

### 7.3 Configuration Changes

**New lab configuration (YAML):**
```yaml
labs:
  linux-user-management:
    type: linux_cli
    adapter: linux-cli-adapter
    monitor: linux-cli-monitor

  splunk-attack-detection:
    type: splunk
    adapter: splunk-adapter
    monitor: splunk-monitor
    splunk_endpoint: "https://splunk.local:8089"

  python-basics:
    type: python
    adapter: python-adapter
    monitor: python-monitor
    test_framework: pytest
```

---

## 8. Implementation Roadmap

### Phase 1: Refactor Linux Labs (Foundational)
- [ ] Extract monitor logic into Linux CLI adapter
- [ ] Create Event Hub with unified schema
- [ ] Migrate existing telemetry to new schema
- [ ] Update vTA canvas to work with Event Hub
- [ ] Update tutor to work with new schema

### Phase 2: Add Splunk Support
- [ ] Build Splunk query monitor
- [ ] Create Splunk adapter
- [ ] Write Splunk lab module (YAML)
- [ ] Test end-to-end tutor feedback

### Phase 3: Add Python Support
- [ ] Build code submission handler
- [ ] Create Python adapter (pytest integration)
- [ ] Write Python lab module (YAML)
- [ ] Test end-to-end scoring

### Phase 4: Polish & Extend
- [ ] Add more lab types as needed
- [ ] Performance optimization
- [ ] Tutor feedback enrichment

---

## 9. Success Criteria

1. **Extensibility**: Adding a new lab type requires only:
   - New monitor (watches lab output)
   - New adapter (normalizes to schema)
   - New lab YAML config
   - No changes to Event Hub, vTA, or tutor

2. **Unified Telemetry**: All labs produce same telemetry schema
   - Tutor can analyze patterns across lab types
   - Scoring logic is consistent

3. **Full Tutor Visibility**: Tutor can see:
   - All student actions (not just completions)
   - Struggles and retries (learning signals)
   - Lab-specific context (queries, code, etc.)

4. **Backward Compatibility**: Existing Linux labs continue to work
   - No breaking changes to modules
   - Scoring remains consistent

5. **Performance**: Event processing is sub-100ms
   - vTA gets real-time UI updates
   - Tutor can respond quickly

---

## 10. Open Questions & Considerations

1. **Tutor Activation**: When does Claude Code tutor activate?
   - On every event? (too chatty)
   - On step completion? (good balance)
   - On manual invocation? (student initiates)
   - Configurable per lab?

2. **Lab-Specific Scoring**: Do scoring presets (strict/partial/practice) apply to all lab types?
   - Or does each lab type define its own scoring rules?

3. **Multi-Language Tutors**: Should different labs have different tutor personas?
   - Linux labs: Unix expert
   - Splunk labs: Security analyst
   - Python labs: Python mentor
   - Or single unified tutor?

4. **Hints & Solutions**: How do hints/solutions work in non-CLI labs?
   - Splunk: "Try filtering by source_ip first"?
   - Python: Show a test case or boilerplate?

---

## 11. References

- Current Canvas implementation: `/docs/LAB_ENVIRONMENT.md`
- Existing telemetry system: `src/lab/telemetry/`
- vTA Canvas component: `src/canvases/vta/vta.tsx`
- Tutor access patterns: `src/lab/tutor-watcher.ts`

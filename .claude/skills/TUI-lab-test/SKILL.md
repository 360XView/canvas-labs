---
name: tui-lab-test
description: Test VTA lab interactions and telemetry. Use when user types /tui_lab_test or asks to test labs, verify telemetry, test hints/solutions/questions, debug VTA events, check if telemetry is logging correctly, or test the lab learning flow.
---

# Lab Testing (VTA + Telemetry)

Test and debug VTA lab interactions: hints, solutions, questions, and telemetry logging.

## Paths

```
PLUGIN_DIR=/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin
```

## Quick Test (Automated)

Run the test harness which includes hint/solution telemetry tests:

```bash
cd $PLUGIN_DIR && bun test src/test-harness/__tests__/tui-environment.test.ts
```

Run all telemetry tests:

```bash
cd $PLUGIN_DIR && bun test src/lab/telemetry/__tests__/
```

## Cleanup Before Testing

Remove old logs to start fresh:

```bash
rm -rf /tmp/lab-logs-*
```

## Launch Lab (Manual Testing)

Requires visible Terminal window.

**IMPORTANT: Copy commands exactly - they include `cd` to the correct directory.**

```bash
# Launch lab in new Terminal window
osascript -e 'tell application "Terminal"
    activate
    do script "cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin && bun run src/cli.ts lab linux-user-management"
end tell'
```

## VTA Controls

| Key | Action | Telemetry Event |
|-----|--------|-----------------|
| `h` | Reveal next hint | `hint_requested` |
| `s` | Toggle solution | `solution_viewed` |
| `1-9` | Select question option | - |
| `Enter` | Submit answer / Next step | `question_answered` |
| `←`/`→` | Navigate steps | `step_started` |
| `d` | Toggle debug panel | - |
| `q` | Quit | `session_ended` |

## Watch Telemetry (Real-time)

Open a second terminal and watch events as they happen:

```bash
# Watch all events
tail -f /tmp/lab-logs-*/telemetry.jsonl | jq -c '{event: .event_type, step: .step_id}'

# Watch with full details
tail -f /tmp/lab-logs-*/telemetry.jsonl | jq .
```

## Verify Telemetry

After testing, check that events were logged:

```bash
# List all event types
cat /tmp/lab-logs-*/telemetry.jsonl | jq -c '.event_type' | sort | uniq -c

# Check hints
cat /tmp/lab-logs-*/telemetry.jsonl | jq 'select(.event_type == "hint_requested")'

# Check solutions
cat /tmp/lab-logs-*/telemetry.jsonl | jq 'select(.event_type == "solution_viewed")'

# Check questions
cat /tmp/lab-logs-*/telemetry.jsonl | jq 'select(.event_type == "question_answered")'

# Check step completions
cat /tmp/lab-logs-*/telemetry.jsonl | jq 'select(.event_type == "step_completed")'
```

## Expected Output

### After pressing `h` (reveal hint):
```json
{
  "event_type": "hint_requested",
  "step_id": "become-root",
  "payload": {
    "step_id": "become-root",
    "hint_index": 0,
    "total_hints": 1
  }
}
```

### After pressing `s` (view solution):
```json
{
  "event_type": "solution_viewed",
  "step_id": "become-root",
  "payload": {
    "step_id": "become-root"
  }
}
```

### After answering question:
```json
{
  "event_type": "question_answered",
  "step_id": "quiz-step",
  "payload": {
    "step_id": "quiz-step",
    "is_correct": true,
    "selected_options": ["option-1"],
    "correct_options": ["option-1"],
    "attempt_number": 1
  }
}
```

## Verify State File

The tutor reads state from:

```bash
cat /tmp/lab-logs-*/state.json | jq .
```

## Troubleshooting

### No telemetry events appearing?

1. **Check if monitor is running:**
   ```bash
   ps aux | grep monitor
   ```

2. **Check IPC socket exists:**
   ```bash
   ls -la /tmp/lab-*.sock
   ```

3. **Check for errors in monitor:**
   ```bash
   # Look at recent container logs if using Docker
   docker logs $(cat /tmp/lab-logs-*/container.id) 2>&1 | tail -20
   ```

### Events appear but missing hint/solution?

The VTA → Event Hub IPC may not be connected. Check:
```bash
# In VTA, press 'd' to show debug panel
# Look for "Lab Connected" status in header
```

### Old data confusing results?

```bash
rm -rf /tmp/lab-logs-* && echo "Cleaned up"
```

### IPC socket permission issues?

```bash
ls -la /tmp/lab-*.sock
# Should be readable/writable by your user
```

## Test Checklist

Manual testing checklist:

- [ ] Launch lab successfully
- [ ] VTA shows "Lab Connected" in header
- [ ] Press `h` → `hint_requested` event appears
- [ ] Press `s` → `solution_viewed` event appears
- [ ] Navigate to question step
- [ ] Select answer, press Enter → `question_answered` event appears
- [ ] Complete a task → `step_completed` event appears
- [ ] Quit with `q` → `session_ended` event appears

## Related

- [TUI Presentation Test](./../TUI-presentation-test/SKILL.md) - For testing presentations
- [Test Harness](../../packages/canvas-plugin/src/test-harness/) - Automated testing framework
- [VTA Telemetry Implementation Brief](../../../canvas-team/arch/docs/plans/vta-telemetry-implementation-brief.md) - Implementation details

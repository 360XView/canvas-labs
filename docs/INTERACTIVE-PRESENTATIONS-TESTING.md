# Interactive Presentations - Testing Guide

This guide documents how to test the interactive presentations feature without needing the full tmux/Tutor setup for every change.

## Key Insight: Test Components in Isolation

The interactive presentations system has several components that can be tested independently:

```
┌─────────────────────────────────────────────────────────────┐
│                    Full Integration                          │
│    (tmux + Claude Tutor + VTA + Watcher + State Files)      │
├─────────────────────────────────────────────────────────────┤
│              VTA Rendering Only                              │
│         (present --file, no Tutor)                          │
├─────────────────────────────────────────────────────────────┤
│           Component Tests (No TTY)                           │
│    Watcher | Generator | State Files | IPC Messages         │
└─────────────────────────────────────────────────────────────┘
         ↑ Start here - fast iteration, no terminal needed
```

**Lesson learned:** Don't jump to full integration testing. Most bugs can be caught at the component level.

## Quick Start

```bash
cd packages/canvas-plugin

# Test generator
./testing/presentations/test-generator.sh

# Test watcher event detection
./testing/presentations/test-watcher.sh

# Test full VTA (needs terminal)
bun run src/cli.ts present --file /tmp/test-presentation.yaml
```

## Component Tests

### 1. Generator (`test-generator.sh`)

Tests that markdown is correctly converted to presentation YAML.

**What it verifies:**
- Headers become slides
- Sentences are split into segments
- Bullets become bullet-type segments
- Code blocks become code-type segments

**Run:**
```bash
./testing/presentations/test-generator.sh
```

**Manual verification:**
```bash
# Create markdown
cat > /tmp/test.md << 'EOF'
# First Slide
This is a sentence. Here is another.

## Second Slide
- Bullet one
- Bullet two
EOF

# Generate
bun run src/cli.ts present-gen /tmp/test.md -o /tmp/output.yaml

# Verify structure
cat /tmp/output.yaml
```

### 2. Watcher (`test-watcher.sh`)

Tests that the watcher correctly detects state changes and processes Tutor commands.

**What it verifies:**
- Slide changes trigger `PRESENTATION:SLIDE_CHANGED`
- Mode changes trigger `PRESENTATION:MODE_CHANGED`
- Explain requests trigger `PRESENTATION:EXPLAIN_REQUESTED`
- Tutor highlight commands are processed

**Run:**
```bash
./testing/presentations/test-watcher.sh
```

**Expected output:**
```
✓ SLIDE_CHANGED detected
✓ MODE_CHANGED detected
✓ EXPLAIN_REQUESTED detected
✓ Highlight command processed
```

### 3. State File Format (`test-state-format.sh`)

Tests that state files have the correct structure.

**Run:**
```bash
./testing/presentations/test-state-format.sh
```

## Integration Tests

### VTA Only (No Tutor)

Test the VTA canvas without the full Tutor integration:

```bash
bun run src/cli.ts present --file /tmp/test-presentation.yaml
```

**Test checklist:**
- [ ] Slide renders with content
- [ ] `←`/`→` keys navigate slides
- [ ] `g` key shows "GUIDED" mode indicator
- [ ] `e` key shows "GUIDED" and triggers explain
- [ ] `q` key exits

**Verify state updates:**
```bash
# In another terminal, watch the state file
watch -n 0.5 'cat /tmp/presentation-logs-*/presentation-state.json | jq .'
```

### Full Interactive Mode

Only use this for final verification:

```bash
bun run src/cli.ts present --file /tmp/test-presentation.yaml --interactive
```

**Test checklist:**
- [ ] Tmux opens with Claude (left) and VTA (right)
- [ ] Claude receives `PRESENTATION:SLIDE_CHANGED` on navigation
- [ ] Claude receives `PRESENTATION:MODE_CHANGED` on g/arrow keys
- [ ] Claude receives `PRESENTATION:EXPLAIN_REQUESTED` on e key
- [ ] Claude can send highlight commands that VTA displays

## Debugging Tips

### Check State File

```bash
# Find latest log directory
ls -lt /tmp/presentation-logs-* | head -1

# Read state
cat /tmp/presentation-logs-*/presentation-state.json | jq .
```

### Check Watcher Logs

The watcher logs to stdout. In interactive mode, it runs detached. Check the PID file:

```bash
cat /tmp/presentation-logs-*/watcher.pid
# Then check if process is running
ps aux | grep <pid>
```

### Test IPC Manually

```bash
# Write a test command
cat > /tmp/presentation-logs-*/tutor-commands.json << 'EOF'
{
  "commands": [{
    "id": "manual-test-1",
    "type": "highlight",
    "payload": {"segmentIndex": 0}
  }]
}
EOF
```

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Watcher doesn't detect changes | Debounce timing | Wait 200ms between changes |
| Events not sent to Claude | No tmux target | Check watcher was started with target |
| Same command ignored | Duplicate ID | Use unique IDs with `$RANDOM` |
| State file not updating | Wrong log directory | Check `--log-dir` option |

## Adding New Tests

When adding features, create component tests first:

1. **For state changes:** Add test case to `test-watcher.sh`
2. **For new commands:** Add command type test to `test-watcher.sh`
3. **For generator changes:** Add markdown pattern to `test-generator.sh`

## Lessons Learned

1. **Don't test in tmux first** - Component tests are faster and catch most bugs
2. **State files are the contract** - Verify JSON structure before testing UI
3. **Watcher logs without tmux** - Use this for testing event detection
4. **Socket errors are OK** - When testing watcher alone, IPC failures are expected
5. **Use unique command IDs** - `$RANDOM-$(date +%s)` prevents duplicate detection

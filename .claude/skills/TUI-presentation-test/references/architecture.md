# Interactive Presentations Architecture

## Source Code Locations

```
PLUGIN_DIR=/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin

src/presentation/
├── types.ts       # TypeScript interfaces
├── generator.ts   # Markdown → YAML conversion
├── loader.ts      # Load presentations from files/directory
├── watcher.ts     # Monitor state, emit events to Tutor
└── spawn.ts       # Launch tmux session with Tutor + VTA

src/lab/tutor-control/
└── presentation-state.ts  # State management for VTA

src/canvases/vta/
└── ...            # VTA canvas rendering (shared with labs)
```

## Key Types (src/presentation/types.ts)

```typescript
interface PresentationState {
  presentationId: string;
  socketPath: string;
  currentSlide: InteractiveSlide;
  slideIndex: number;        // 0-indexed
  slideNumber: number;       // 1-indexed (human-readable)
  totalSlides: number;
  mode: "guided" | "browse";
  highlightedSegment: number | null;
  explainRequestedAt?: string;  // ISO timestamp when 'e' pressed
  lastUpdated: string;
}

interface PresentationTutorCommand {
  id: string;
  type: "highlight" | "clearHighlight" | "nextSlide" | "previousSlide" | "navigateToSlide";
  payload?: { segmentIndex?: number; slideIndex?: number; };
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INPUT                                │
│                    (←/→ navigate, g mode, e explain)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VTA CANVAS                                  │
│   - Renders slides                                               │
│   - Handles keyboard input                                       │
│   - Writes state to presentation-state.json                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              /tmp/presentation-logs-*/                           │
│   presentation-state.json  ←── VTA writes here                   │
│   tutor-commands.json      ←── Tutor writes here                 │
│   watcher.pid              ←── Watcher process ID                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     WATCHER (watcher.ts)                         │
│   - Monitors presentation-state.json for changes                 │
│   - Detects: slide changes, mode changes, explain requests       │
│   - Sends IPC events to Tutor via tmux                           │
│   - Monitors tutor-commands.json for Tutor commands              │
│   - Forwards commands to VTA via Unix socket                     │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   TUTOR (Claude)        │     │   VTA (via socket)      │
│   Receives events:      │     │   Receives commands:    │
│   - SLIDE_CHANGED       │────▶│   - highlight           │
│   - MODE_CHANGED        │     │   - clearHighlight      │
│   - EXPLAIN_REQUESTED   │     │   - nextSlide           │
│   Writes commands to    │     │   - previousSlide       │
│   tutor-commands.json   │     │   - navigateToSlide     │
└─────────────────────────┘     └─────────────────────────┘
```

## Debugging Techniques

### Watch State Changes Live
```bash
watch -n 0.5 'cat /tmp/presentation-logs-*/presentation-state.json | jq .'
```

### Watch Watcher Logs
```bash
# Find watcher PID
cat /tmp/presentation-logs-*/watcher.pid

# Tail watcher output (if running in foreground)
# Or check the log directory for output
```

### Test IPC Manually
```bash
# Simulate Tutor sending highlight command
LOG_DIR=$(ls -td /tmp/presentation-logs-* | head -1)
cat > "$LOG_DIR/tutor-commands.json" << 'EOF'
{"commands":[{"id":"test-$RANDOM","type":"highlight","payload":{"segmentIndex":0}}]}
EOF
```

### Test Watcher Without Tmux
```bash
# Watcher logs events to stdout when no tmux target
bun run src/presentation/watcher.ts /tmp/test-dir /tmp/fake.sock
```

## Adding New Tests

### New Event Type
1. Add detection logic in `test-watcher.sh`
2. Write state change that triggers event
3. Verify log output contains expected message

### New Command Type
1. Add command to `tutor-commands.json` in test
2. Verify watcher processes and forwards it

### New Generator Feature
1. Add markdown pattern to `test-generator.sh`
2. Verify output YAML contains expected structure

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Watcher doesn't detect changes | Debounce timing | Wait 200ms between state writes |
| Events not reaching Tutor | No tmux target | Check watcher started with target |
| Duplicate command ignored | Same command ID | Use unique IDs: `test-$RANDOM-$(date +%s)` |
| State file not updating | Wrong log directory | Check `--log-dir` option or find latest |
| Socket connection failed | VTA not running | Start VTA first, then watcher |

## CLI Commands Reference

```bash
# Generate presentation from markdown
bun run src/cli.ts present-gen input.md -o output.yaml

# View presentation (VTA only)
bun run src/cli.ts present --file presentation.yaml

# Interactive mode (tmux + Tutor)
bun run src/cli.ts present --file presentation.yaml --interactive

# List available presentations
bun run src/cli.ts present --list
```

# Timeline Viewer Canvas Design

**Date:** 2026-01-30
**Status:** Draft
**Author:** EvalLead + User collaboration

## Overview

A TUI canvas for visualizing EvalLead capture data to validate and debug component interactions between VTA, Container, and Tutor.

### Goals

1. **Validate component interactions** — Confirm VTA, Container, and Tutor orchestrate correctly
2. **Debug timing issues** — See event sequences, debounce behavior, missed triggers
3. **Tune tutor responses** — Understand how tutor responds to actions and events

### Non-Goals (v1)

- Live streaming mode (future Phase 3)
- Editing or replaying captures
- Exporting visualizations

## Data Sources

The timeline viewer parses capture folders created by `/el_test_tutor`:

| File | Content | Events Extracted |
|------|---------|------------------|
| `telemetry.jsonl` | JSONL telemetry events | session_started, command_executed, step_completed, check_passed |
| `checks.log` | Check script results | PASSED/FAILED per check script |
| `commands.log` | Shell commands executed | Command with timestamp, user, cwd |
| `tutor-watcher.log` | Tutor file watcher debug log | File events, debounce timers, TUTOR:EVENT sends |
| `state.json` | Step completion state | Step IDs and completion timestamps |
| `capture.json` | Session metadata | Module ID, duration, results summary |

## Visualization Modes

### Swim Lanes Mode

Horizontal tracks per component, events as nodes, time axis below:

```
┌─────────────────────────────────────────────────────────────────────┐
│ VTA:       ●━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━●━━━━━━━●━━━━━━━●━━━━━━━●│
│ Container: ━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━●━━━━━━━●━━━━━━━●━━━━━━│
│ Checks:    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━●━━━━━━━●━━━━━━━●━━━━│
│ Tutor:     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━●━━│
│            10:07:09              10:09:15    10:09:21    10:09:29   │
└─────────────────────────────────────────────────────────────────────┘
```

**Tracks:**

| Track | Color | Source |
|-------|-------|--------|
| VTA | Blue | telemetry (step_completed, session events) |
| Container | Green | commands.log, telemetry (command_executed) |
| Checks | Yellow | checks.log, telemetry (check_passed) |
| Tutor | Magenta | tutor-watcher.log |

### Unified Timeline Mode

Single chronological list, color-coded by source:

```
│ 10:09:15.469  [checks]    check-is-root.sh PASSED                   │
│ 10:09:15.470  [telemetry] check_passed: become-root            ←    │
│ 10:09:15.470  [telemetry] step_completed: become-root               │
│ 10:09:18.521  [tutor]     Debounce complete, sending event          │
│ 10:09:18.531  [tutor]     Sent: TUTOR:EVENT                         │
│ 10:09:19.904  [commands]  useradd -m devuser                        │
```

## Layout

Split view with timeline (60%) and detail panel (40%):

```
┌─────────────────────────────────────────────────────────────────────┐
│ Timeline Viewer: tutor-test-20260130-120659    [m]ode [q]uit   12:07│
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                     TIMELINE AREA (60%)                             │
│              (swim lanes or unified list)                           │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ ● step_completed: become-root                        10:09:15.470   │
│ ─────────────────────────────────────────────────────────────────── │
│ Source: telemetry.jsonl                                             │
│ Event ID: evt-e874077e                                              │
│ Session: sess-f8939bf1                                              │
│                                                                     │
│ Payload:                                                            │
│   step_id: "become-root"                                            │
│   source: "check"                                                   │
│                                                                     │
│ Related events (±500ms):                                            │
│   -0ms  [checks] check-is-root.sh PASSED                           │
│   +0ms  [telemetry] check_passed: become-root                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Keyboard Controls

### Navigation

| Key | Action |
|-----|--------|
| `←` `→` | Move cursor to previous/next event (chronologically) |
| `↑` `↓` | In swim lanes: move between tracks. In unified: scroll list |
| `Home` / `End` | Jump to first/last event |
| `PgUp` / `PgDn` | Jump 10 events forward/back |

### View Controls

| Key | Action |
|-----|--------|
| `m` | Toggle mode (swim lanes ↔ unified timeline) |
| `+` / `-` | Zoom time scale in/out |
| `0` | Reset zoom to fit all events |
| `Tab` | Toggle focus between timeline and detail panel |
| `j` / `k` | Scroll detail panel (when focused) |

### Filtering

| Key | Action |
|-----|--------|
| `1`-`4` | Toggle track visibility (1=VTA, 2=Container, 3=Checks, 4=Tutor) |
| `a` | Show all tracks |

### General

| Key | Action |
|-----|--------|
| `q` / `Esc` | Quit |
| `?` | Show help overlay |

## Data Model

```typescript
interface TimelineConfig {
  capturePath: string;           // Folder path to capture
  title?: string;                // Display name (defaults to folder name)
}

interface TimelineEvent {
  id: string;                    // Unique ID
  timestamp: Date;               // When it happened
  source: EventSource;           // Which log file
  track: Track;                  // Which swim lane
  label: string;                 // Short description (shown on timeline)
  content: string;               // Full content (shown in detail panel)
  raw: unknown;                  // Original parsed data
}

type EventSource = "telemetry" | "checks" | "commands" | "tutor" | "state";
type Track = "vta" | "container" | "checks" | "tutor";

interface TimelineState {
  events: TimelineEvent[];       // All parsed events
  cursor: number;                // Currently selected event index
  mode: "swimlanes" | "unified"; // Visualization mode
  visibleTracks: Set<Track>;     // Which tracks are shown
  zoom: number;                  // Time scale factor
  detailScroll: number;          // Scroll position in detail panel
}
```

### Parsing Rules

| Source | Event Type | Track | Label Format |
|--------|------------|-------|--------------|
| telemetry | session_started | vta | "session started" |
| telemetry | step_completed | vta | "✓ {step_id}" |
| telemetry | command_executed | container | "{command}" (truncated) |
| telemetry | check_passed | checks | "✓ {step_id}" |
| commands.log | (any line) | container | "{command}" |
| checks.log | PASSED/FAILED | checks | "{script} {status}" |
| tutor-watcher | File event | tutor | "file: {filename}" |
| tutor-watcher | Sent: TUTOR:EVENT | tutor | "→ TUTOR:EVENT" |
| tutor-watcher | Debounce | tutor | "debounce {action}" |

## File Structure

```
packages/canvas-plugin/src/canvases/
├── timeline/
│   ├── index.tsx              # Main component
│   ├── types.ts               # TimelineConfig, TimelineEvent, etc.
│   ├── parser.ts              # Load & parse capture folder
│   ├── components/
│   │   ├── swim-lanes.tsx     # Swim lane visualization
│   │   ├── unified-list.tsx   # Unified timeline list
│   │   ├── detail-panel.tsx   # Event detail view
│   │   ├── time-axis.tsx      # Timestamp ruler
│   │   ├── track-row.tsx      # Single swim lane track
│   │   └── event-node.tsx     # Clickable event dot/marker
│   └── hooks/
│       └── use-timeline.ts    # State management (cursor, zoom, filters)
```

### Changes to Existing Files

```
packages/canvas-plugin/src/canvases/index.tsx
  → Add case "timeline": renderTimeline(...)
```

## CLI Usage

```bash
# View a capture folder
bun run src/cli.ts show timeline --config '{"capturePath": "/tmp/evallead-captures/tutor-test-20260130-120659"}'

# Convenience alias (future)
bun run src/cli.ts timeline /tmp/evallead-captures/tutor-test-20260130-120659
```

## Testing

### Test Layers

| Layer | Approach |
|-------|----------|
| Parser | Unit tests — verify each log format parses correctly |
| Data model | Unit tests — event sorting, track assignment, filtering |
| UI components | Snapshot tests — render components, compare output |
| Integration | Visual tests — screenshot TUI, compare against baseline |

### Visual Testing with Screenshots

```bash
# Capture TUI screenshot using macOS screencapture
screencapture -l$(osascript -e 'tell app "Terminal" to id of window 1') screenshot.png

# Or use tmux capture for text-based snapshots
tmux capture-pane -t timeline-test -p > snapshot.txt
```

### Test Fixtures

```
packages/canvas-plugin/src/canvases/timeline/
├── __tests__/
│   ├── parser.test.ts           # Unit: parse each file type
│   ├── use-timeline.test.ts     # Unit: state management
│   └── fixtures/
│       └── sample-capture/      # Copy of real capture folder
│           ├── telemetry.jsonl
│           ├── checks.log
│           ├── commands.log
│           ├── tutor-watcher.log
│           ├── state.json
│           └── capture.json
```

### EvalLead Integration

New command `/el_test_timeline`:

1. Launch timeline viewer with sample capture
2. Send keystrokes via tmux (navigate, toggle mode)
3. Capture screenshots at key states
4. Compare against baselines in `~/.evallead/baselines/timeline/`

### Test Scenarios

| Scenario | Validates |
|----------|-----------|
| Load sample capture | Parser works, events appear |
| Arrow key navigation | Cursor moves, detail panel updates |
| Mode toggle (`m`) | Swim lanes ↔ Unified switches correctly |
| Track filter (`1`-`4`) | Tracks hide/show, cursor adjusts |
| Empty capture folder | Graceful error message |
| Malformed log file | Skip bad lines, show warning |

## Implementation Phases

### Phase 1: Core Viewer (v1)

- Parser for all 5 log file types
- Swim lanes view with 4 tracks
- Unified timeline view
- Keyboard navigation (arrows, home/end)
- Detail panel with formatted content
- Mode toggle (`m`)
- Track filtering (`1`-`4`, `a`)

### Phase 2: Polish

- Time zoom (`+`/`-`/`0`)
- Related events in detail panel (±500ms)
- Help overlay (`?`)
- Better timestamp formatting (relative vs absolute)

### Phase 3: Live Mode (future)

- Watch log directory for changes
- Stream new events onto timeline
- Auto-scroll option
- "Pause" to freeze and explore

## Open Questions

None currently — design validated through brainstorming session.

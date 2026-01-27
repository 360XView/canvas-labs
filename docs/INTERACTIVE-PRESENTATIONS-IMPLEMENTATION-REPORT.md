# Interactive Presentations - Implementation Report

## Summary

**Status: ✅ COMPLETE (MVP + enhancements)**

Implemented MVP for interactive presentations with:
- Markdown → YAML generator
- VTA with segment highlighting
- Bidirectional Tutor ↔ VTA communication
- Guided/Browse modes
- Real-time event notifications to Claude
- Deeper explanation mode ('e' key)

**Commits:**
- `788915f` feat: add interactive presentations with Tutor narration
- `309e298` fix: complete end-to-end interactive presentation state sync
- `5c145b2` feat: add Tutor slide navigation commands
- `24440ec` fix: change presentation layout to Claude left, VTA right
- `e3bc8fb` fix: use unique command IDs with $RANDOM in tutor commands
- `1bb5f29` fix: add human-readable slideNumber (1-indexed) to state
- `9c4d2a2` feat: send PRESENTATION events to Claude via tmux

---

## Phase-by-Phase Implementation

### Phase 1: Types & IPC Messages ✅

| Spec | Status | File |
|------|--------|------|
| `NarrationSegment` interface | ✅ | `src/presentation/types.ts` |
| `InteractiveSlide` interface | ✅ | `src/presentation/types.ts` |
| `InteractivePresentation` interface | ✅ | `src/presentation/types.ts` |
| `PresentationMode` type | ✅ | `src/presentation/types.ts` |
| `PresentationState` interface | ✅ | `src/presentation/types.ts` |
| `highlight` IPC message | ✅ | `src/ipc/types.ts` |
| `clearHighlight` IPC message | ✅ | `src/ipc/types.ts` |

---

### Phase 2: Presentation State Writer ✅

| Spec | Status | File |
|------|--------|------|
| `createPresentationStateWriter()` | ✅ | `src/lab/tutor-control/presentation-state.ts` |
| `initialize()` method | ✅ | Initializes with full slide info |
| `setSlide()` method | ✅ | Updates slideIndex + currentSlide |
| `setMode()` method | ✅ | Updates mode field |
| `setHighlight()` method | ✅ | Updates highlightedSegment |
| State file at `{logDir}/presentation-state.json` | ✅ | Includes full slide content for Tutor |

---

### Phase 3: VTA Interactive Presentation Scenario ✅

| Spec | Status | File |
|------|--------|------|
| `scenario === "interactive-presentation"` detection | ✅ | `src/canvases/vta.tsx` |
| `highlightedSegment` state | ✅ | React state in VTA |
| Handle `highlight` IPC message | ✅ | via `useLabFeedback` hook |
| Navigation events → state file | ✅ | `writePresentationStateUpdate()` |
| Mode switching on `e`/`g` keys | ✅ | Switches to GUIDED mode |
| Arrows switch to BROWSE mode | ✅ | Implemented |
| `presentation-content.tsx` component | ✅ | `src/canvases/vta/components/` |
| Segment highlighting (blue bg) | ✅ | `bgBlue` + white text |
| Mode indicator | ✅ | Shows GUIDED/BROWSE |

**Keyboard Bindings:**

| Key | Spec | Implemented |
|-----|------|-------------|
| `→`/`Enter` | Next slide | ✅ |
| `←` | Previous slide | ✅ |
| `e` | Explain (guided mode) | ✅ |
| `g` | Guided mode | ✅ |
| `Space` | Advance highlight | ❌ Not implemented |
| `q` | Quit | ✅ |

---

### Phase 4: Interactive Presentation Spawner ✅

| Spec | Status | File |
|------|--------|------|
| `spawnInteractivePresentation()` | ✅ | `src/presentation/spawn.ts` |
| Create logDir `/tmp/presentation-{id}/` | ✅ | Uses timestamp suffix |
| Initialize `presentation-state.json` | ✅ | Full slide content |
| Create tutor workspace with prompt | ✅ | Generates CLAUDE.md |
| Tmux layout (60/40 split) | ✅ | VTA top, Tutor bottom |
| Start state watcher | ✅ | `src/presentation/watcher.ts` |
| `--interactive` CLI flag | ✅ | `src/cli.ts` |

**Additional implementation:**
- Watcher monitors `tutor-commands.json` and relays to VTA via IPC
- Tutor CLAUDE.md includes full slide reference with segments
- Writes `presentation-full.json` for Tutor reference

---

### Phase 5: Tutor Prompt Template ✅

| Spec | Status | File |
|------|--------|------|
| `presenting-tutor.md` template | ✅ | `templates/presenting-tutor.md` |
| State file location | ✅ | Included in generated CLAUDE.md |
| GUIDED mode instructions | ✅ | Narrate, highlight, invite questions |
| BROWSE mode instructions | ✅ | Stay quiet, answer questions |
| Command format for highlighting | ✅ | JSON format documented |

**Enhancement:** Spawner generates context-specific CLAUDE.md with:
- Exact state file path
- Full slide reference with segment indices
- Example highlight commands

---

### Phase 6: Generator CLI ✅

| Spec | Status | File |
|------|--------|------|
| `present-gen` command | ✅ | `src/cli.ts` |
| Read markdown file | ✅ | `src/presentation/generator.ts` |
| Split by headers → slides | ✅ | H1/H2 headers become slides |
| Split prose → sentence segments | ✅ | Period/question mark split |
| Bullets → segment each | ✅ | Detects `-`, `*`, numbered |
| Code blocks → code segments | ✅ | Preserves formatting |

---

## Post-Implementation Fixes (309e298)

Issues discovered during testing:

| Issue | Fix |
|-------|-----|
| VTA couldn't find log directory | Fixed `deriveLogDir()` to handle `presentation-*` sockets |
| State file not updated on navigation | Added `--log-dir` CLI option, passed through to VTA |
| Tutor didn't know current slide | State file now includes full currentSlide content |
| Forward navigation didn't update state | Added state write after `setCurrentStepIndex(newIndex)` |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         tmux session                            │
├───────────────────────────┬─────────────────────────────────────┤
│  Claude Code (Tutor)      │  VTA Canvas                         │
│                           │  ┌─────────────────────────────────┐│
│  Receives events:         │  │ Slide Content          GUIDED  ││
│  • SLIDE_CHANGED          │  │ • Segment 0                     ││
│  • MODE_CHANGED           │  │ • [Segment 1 - highlighted]     ││
│  • EXPLAIN_REQUESTED      │  │ • Segment 2                     ││
│                           │  └─────────────────────────────────┘│
│  Sends commands:          │  User keys:                         │
│  • highlight              │  • ←/→ Navigate (BROWSE)            │
│  • nextSlide              │  • g = Guided mode                  │
│  • previousSlide          │  • e = Explain (deeper)             │
│  • navigateToSlide        │  • q = Quit                         │
└───────────────────────────┴─────────────────────────────────────┘

                    ↕ State Sync + Events

┌─────────────────────────────────────────────────────────────────┐
│                  /tmp/presentation-logs-{id}/                   │
│  ├── presentation-state.json  (VTA writes, Tutor reads)        │
│  ├── tutor-commands.json      (Tutor writes, Watcher reads)    │
│  └── presentation-full.json   (Full slide reference)           │
└─────────────────────────────────────────────────────────────────┘

        ↕ IPC (Unix Socket)              ↕ tmux send-keys

┌─────────────────────────────────────────────────────────────────┐
│  Watcher Process                                                │
│  - Monitors tutor-commands.json → sends to VTA via socket       │
│  - Monitors presentation-state.json → sends events to Claude    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Created/Modified

**NEW Files (10):**
- `src/presentation/types.ts`
- `src/presentation/generator.ts`
- `src/presentation/spawn.ts`
- `src/presentation/watcher.ts`
- `src/presentation/loader.ts`
- `src/lab/tutor-control/presentation-state.ts`
- `src/canvases/vta/components/presentation-content.tsx`
- `templates/presenting-tutor.md`

**MODIFIED Files (6):**
- `src/ipc/types.ts` - Added highlight/clearHighlight messages
- `src/canvases/vta.tsx` - Interactive presentation scenario
- `src/canvases/vta/types.ts` - Added narrationSegments field
- `src/canvases/vta/hooks/use-lab-feedback.ts` - Highlight callbacks
- `src/cli.ts` - Added `present-gen` and `--interactive` flag
- `src/canvases/index.tsx` - Added logDir option

---

## Post-MVP Enhancements (Session 2)

After initial MVP testing, the following enhancements were added:

### Tutor Navigation Commands ✅

Tutor can now control VTA slide navigation by writing commands to `tutor-commands.json`:

| Command | Description |
|---------|-------------|
| `nextSlide` | Advance to next slide |
| `previousSlide` | Go back one slide |
| `navigateToSlide` | Jump to specific slide (0-indexed) |

**Files modified:** `watcher.ts`, `ipc/types.ts`, `vta.tsx`

---

### Layout Change ✅

Changed from vertical split (VTA top, Tutor bottom) to horizontal split:

```
┌──────────────────────┬─────────────────────────────────┐
│ Claude Code (Tutor)  │  VTA Canvas                     │
│                      │  ┌─────────────────────────────┐│
│ Narrates slides,     │  │ Slide Content      GUIDED   ││
│ answers questions    │  │ • Segment 0                 ││
│                      │  │ • [Segment 1 - highlighted] ││
│                      │  └─────────────────────────────┘│
└──────────────────────┴─────────────────────────────────┘
```

**Files modified:** `spawn.ts` (changed `-v` to `-h` split)

---

### Human-Readable Slide Numbers ✅

Added `slideNumber` (1-indexed) alongside `slideIndex` (0-indexed) in state file:

```json
{
  "slideIndex": 0,
  "slideNumber": 1,
  ...
}
```

This prevents Tutor from confusing "Slide 1" with index 1 (which is actually Slide 2).

**Files modified:** `types.ts`, `presentation-state.ts`, `vta.tsx`

---

### Real-Time Event Notifications ✅

Watcher now sends events to Claude via tmux when user interacts with VTA:

| Event | Trigger |
|-------|---------|
| `PRESENTATION:SLIDE_CHANGED to N` | User navigates to slide N |
| `PRESENTATION:MODE_CHANGED to guided` | User presses 'g' |
| `PRESENTATION:MODE_CHANGED to browse` | User uses arrow keys |
| `PRESENTATION:EXPLAIN_REQUESTED for slide N` | User presses 'e' |

This enables Claude to react immediately when the user navigates or requests help.

**Files modified:** `watcher.ts`, `spawn.ts` (CLAUDE.md generation)

---

### Deeper Explanation Mode ('e' key) ✅

Pressing 'e' sends `PRESENTATION:EXPLAIN_REQUESTED` event, signaling Claude to provide a more detailed, in-depth explanation of the current slide (vs 'g' which just enters guided mode for normal narration).

**Files modified:** `vta.tsx`, `watcher.ts`, `types.ts`

---

### Unique Command IDs ✅

Fixed issue where navigation commands were ignored after the first one. Tutor commands now use `$RANDOM-$(date +%s)` for unique IDs.

**Files modified:** `spawn.ts` (CLAUDE.md heredoc escaping)

---

## Not Implemented

| Feature | Reason |
|---------|--------|
| `Space` to advance highlight | Low priority, Tutor controls highlights |
| Slide transitions/animations | Out of scope for MVP |

---

## Usage

```bash
# Generate presentation from markdown
bun run src/cli.ts present-gen input.md -o output.yaml

# View presentation (simple mode)
bun run src/cli.ts present --file output.yaml

# Interactive mode with Tutor narration
bun run src/cli.ts present --file output.yaml --interactive
```

---

## Developer Testing Guide

See `docs/INTERACTIVE-PRESENTATIONS-TESTING.md` for complete testing documentation.
Test scripts are in `packages/canvas-plugin/testing/presentations/`.

**Quick start:**
```bash
cd packages/canvas-plugin

# Run all automated tests
./testing/presentations/run-all-tests.sh

# Or run individual tests
./testing/presentations/test-generator.sh   # Test markdown → YAML
./testing/presentations/test-watcher.sh     # Test event detection
./testing/presentations/test-state-format.sh # Validate state JSON

# Manual VTA testing (no Tutor)
bun run src/cli.ts present --file testing/presentations/sample-presentation.yaml

# Full interactive testing
bun run src/cli.ts present --file testing/presentations/sample-presentation.yaml --interactive
```

**Key insight:** Test components in isolation before full integration. Most bugs can be caught without launching tmux.

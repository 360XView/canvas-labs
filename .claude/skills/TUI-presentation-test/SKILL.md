---
name: tui-presentation-test
description: Test Interactive Presentations TUI component. Use when user types /tui_presentation_test or asks to test presentations, verify VTA rendering, run presentation tests, check the interactive presentations feature, debug presentation issues, or understand how presentations work.
---

# Interactive Presentations Testing

Test and debug the Canvas Interactive Presentations TUI component.

## Paths

```
PLUGIN_DIR=/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin
TEST_DIR=$PLUGIN_DIR/testing/presentations
```

## Quick Test (Automated)

```bash
cd $PLUGIN_DIR && ./testing/presentations/run-all-tests.sh
```

Runs: generator, watcher, and state format tests.

## Launch VTA (Manual Testing)

Requires visible Terminal window.

**IMPORTANT: Copy these commands exactly - they include `cd` to the correct directory. Do not omit the `cd` prefix.**

```bash
# VTA only
osascript -e 'tell application "Terminal"
    activate
    do script "cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin && bun run src/cli.ts present --file testing/presentations/sample-presentation.yaml"
end tell'

# Full integration (tmux + Tutor)
osascript -e 'tell application "Terminal"
    activate
    do script "cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin && bun run src/cli.ts present --file testing/presentations/sample-presentation.yaml --interactive"
end tell'
```

## VTA Controls

| Key | Action |
|-----|--------|
| `→`/`←` | Navigate slides |
| `g` | Toggle guided mode |
| `e` | Request explanation |
| `q` | Quit |

## Verify State

```bash
cat /tmp/presentation-logs-*/presentation-state.json | jq .
```

## Events

- `PRESENTATION:SLIDE_CHANGED` - Navigation
- `PRESENTATION:MODE_CHANGED` - Guided/browse toggle
- `PRESENTATION:EXPLAIN_REQUESTED` - User pressed 'e'

## For Developers

See [references/architecture.md](references/architecture.md) for:
- Source code locations and component structure
- Data flow diagram (VTA → State → Watcher → Tutor)
- Key TypeScript interfaces
- Debugging techniques (watch state, test IPC manually)
- How to add new tests
- Common issues and fixes

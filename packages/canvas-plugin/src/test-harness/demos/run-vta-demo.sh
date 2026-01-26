#!/bin/bash
# VTA Navigation Demo Runner
#
# This script starts the demo in an existing tmux session.
# Usage: ./run-vta-demo.sh [session-name]

SESSION="${1:-final-test}"
DEMO_WINDOW="vta-demo"
PROJECT_DIR="/Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0"

echo "🎬 VTA Navigation Demo"
echo "   Session: $SESSION"
echo ""

# Check if session exists
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "❌ Session '$SESSION' not found"
    echo "   Available sessions:"
    tmux list-sessions
    exit 1
fi

# Create demo window
echo "Creating demo window..."
WINDOW_INDEX=$(tmux new-window -t "$SESSION" -n "$DEMO_WINDOW" -P -F "#{window_index}")
PANE="$SESSION:$WINDOW_INDEX.0"
echo "   Window: $PANE"

# Start the lab
echo "Starting lab..."
tmux send-keys -t "$PANE" "cd $PROJECT_DIR && bun run src/cli.ts lab linux-user-management --no-tutor" C-m

# Wait for lab to start
echo "Waiting for VTA to load (this may take a moment)..."
sleep 5

# Check if it loaded
CONTENT=$(tmux capture-pane -t "$PANE" -p)
if echo "$CONTENT" | grep -q "Introduction\|Linux User"; then
    echo "   ✓ VTA loaded!"
else
    echo "   Still loading, waiting more..."
    sleep 5
fi

echo ""
echo "🎮 Starting navigation demo..."
echo ""

# Demo function
demo_step() {
    local msg="$1"
    local key="$2"
    local delay="${3:-1.5}"

    echo "   $msg"
    if [ -n "$key" ]; then
        tmux send-keys -t "$PANE" "$key"
    fi
    sleep "$delay"
}

# Navigate through steps
echo "📍 Step Navigation (→ and ←)"
demo_step "→ Step 2: Become Root" "Right"
demo_step "→ Step 3: Create User" "Right"
demo_step "→ Step 4: Set Permissions" "Right"
demo_step "→ Step 5: Add to Group" "Right"
demo_step "← Back to Step 4" "Left"
demo_step "← Back to Step 3" "Left"

# Debug panel
echo ""
echo "🔧 Debug Panel (d)"
demo_step "Opening debug panel..." "d" 2
demo_step "Closing debug panel..." "d"

# Hints
echo ""
echo "💡 Hints (h)"
demo_step "→ Go to Step 2 (task step)" "Right"
demo_step "Showing hint..." "h" 2

echo ""
echo "✅ Demo complete!"
echo ""
echo "The VTA is still running in tmux window '$DEMO_WINDOW'"
echo ""
echo "To interact with it:"
echo "   tmux select-window -t $SESSION:$DEMO_WINDOW"
echo ""
echo "To see it (if not visible):"
echo "   tmux attach -t $SESSION"
echo ""
echo "Keyboard shortcuts in VTA:"
echo "   ← → : Navigate steps"
echo "   ↑ ↓ : Scroll content"
echo "   h   : Show hint"
echo "   s   : Show solution"
echo "   d   : Toggle debug panel"
echo "   q   : Quit"

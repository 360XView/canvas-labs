#!/bin/bash
# Test the presentation watcher event detection
# Run from packages/canvas-plugin directory
#
# This tests that the watcher correctly:
# - Detects slide changes
# - Detects mode changes
# - Detects explain requests
# - Processes Tutor highlight commands

# Don't use set -e because we handle test failures ourselves

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PLUGIN_DIR"

echo "=== Interactive Presentations: Watcher Test ==="
echo ""

# Create test directory
TEST_DIR="/tmp/watcher-test-$$"
mkdir -p "$TEST_DIR"
echo "Test directory: $TEST_DIR"

# Create initial state file
cat > "$TEST_DIR/presentation-state.json" << 'EOF'
{
  "slideNumber": 1,
  "slideIndex": 0,
  "mode": "browse",
  "highlightedSegment": null
}
EOF

# Create empty commands file
echo '{"commands":[]}' > "$TEST_DIR/tutor-commands.json"

# Capture watcher output
WATCHER_LOG="$TEST_DIR/watcher.log"

echo "Starting watcher (output captured to $WATCHER_LOG)..."
bun run src/presentation/watcher.ts "$TEST_DIR" "/tmp/fake-socket-$$.sock" > "$WATCHER_LOG" 2>&1 &
WATCHER_PID=$!
echo "Watcher PID: $WATCHER_PID"

# Give watcher time to start
sleep 0.5

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local name="$1"
    local expected="$2"

    sleep 0.3  # Wait for debounce

    if grep -q "$expected" "$WATCHER_LOG"; then
        echo "✓ $name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "✗ $name"
        echo "  Expected: $expected"
        echo "  Log contents:"
        tail -5 "$WATCHER_LOG" | sed 's/^/    /'
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo ""
echo "Running tests..."
echo ""

# Test 1: Slide change
echo '{"slideNumber":2,"slideIndex":1,"mode":"browse"}' > "$TEST_DIR/presentation-state.json"
run_test "SLIDE_CHANGED detected" "PRESENTATION:SLIDE_CHANGED to 2"

# Test 2: Mode change
echo '{"slideNumber":2,"slideIndex":1,"mode":"guided"}' > "$TEST_DIR/presentation-state.json"
run_test "MODE_CHANGED detected" "PRESENTATION:MODE_CHANGED to guided"

# Test 3: Explain request
echo '{"slideNumber":2,"slideIndex":1,"mode":"guided","explainRequestedAt":"2026-01-27T15:00:00Z"}' > "$TEST_DIR/presentation-state.json"
run_test "EXPLAIN_REQUESTED detected" "PRESENTATION:EXPLAIN_REQUESTED for slide 2"

# Test 4: Another slide change (after explain)
echo '{"slideNumber":3,"slideIndex":2,"mode":"browse","explainRequestedAt":"2026-01-27T15:00:00Z"}' > "$TEST_DIR/presentation-state.json"
run_test "SLIDE_CHANGED after explain" "PRESENTATION:SLIDE_CHANGED to 3"

# Test 5: Tutor highlight command
cat > "$TEST_DIR/tutor-commands.json" << 'EOF'
{"commands":[{"id":"test-highlight-1","type":"highlight","payload":{"segmentIndex":0}}]}
EOF
run_test "Highlight command processed" "Sent highlight: segment 0"

# Test 6: Tutor navigation command
cat > "$TEST_DIR/tutor-commands.json" << 'EOF'
{"commands":[{"id":"test-highlight-1","type":"highlight","payload":{"segmentIndex":0}},{"id":"test-next-1","type":"nextSlide"}]}
EOF
run_test "NextSlide command processed" "Sent nextSlide"

# Cleanup
kill $WATCHER_PID 2>/dev/null || true

echo ""
echo "=== Results ==="
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -gt 0 ]; then
    echo "Full watcher log:"
    cat "$WATCHER_LOG"
    echo ""
    echo "Test directory preserved at: $TEST_DIR"
    exit 1
else
    echo "=== All Watcher Tests Passed ==="
    rm -rf "$TEST_DIR"
    echo "Test directory cleaned up."
fi

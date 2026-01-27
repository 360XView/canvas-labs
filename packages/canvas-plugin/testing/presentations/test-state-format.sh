#!/bin/bash
# Test that presentation state files have the correct structure
# Run from packages/canvas-plugin directory
#
# This validates the JSON schema of presentation-state.json

# Don't use set -e because ((var++)) returns 1 when var=0, causing false failures

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PLUGIN_DIR"

echo "=== Interactive Presentations: State Format Test ==="
echo ""

# Check for existing state files from recent runs (exclude watcher-test directories)
STATE_FILES=$(ls -t /tmp/presentation-logs-*/presentation-state.json 2>/dev/null | grep -v "watcher-test" | head -5)

if [ -z "$STATE_FILES" ]; then
    echo "No presentation state files found."
    echo ""
    echo "To create one, run:"
    echo "  bun run src/cli.ts present --file <presentation.yaml>"
    echo ""
    echo "Or generate a test presentation first:"
    echo "  ./testing/presentations/test-generator.sh"
    exit 1
fi

echo "Found state files:"
echo "$STATE_FILES" | head -3
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

check_field() {
    local file="$1"
    local field="$2"
    local description="$3"

    if jq -e ".$field" "$file" > /dev/null 2>&1; then
        echo "  ✓ $description ($field)"
        ((TESTS_PASSED++))
    else
        echo "  ✗ $description ($field) - MISSING"
        ((TESTS_FAILED++))
    fi
}

# Test the most recent state file
LATEST=$(echo "$STATE_FILES" | head -1)
echo "Testing: $LATEST"
echo ""

# Required fields
check_field "$LATEST" "presentationId" "Presentation ID"
check_field "$LATEST" "socketPath" "Socket path"
check_field "$LATEST" "slideIndex" "Slide index (0-indexed)"
check_field "$LATEST" "slideNumber" "Slide number (1-indexed)"
check_field "$LATEST" "totalSlides" "Total slides"
check_field "$LATEST" "mode" "Mode (guided/browse)"
check_field "$LATEST" "lastUpdated" "Last updated timestamp"

# Optional but expected fields
echo ""
echo "Optional fields:"
if jq -e ".currentSlide" "$LATEST" > /dev/null 2>&1; then
    echo "  ✓ currentSlide object present"
    check_field "$LATEST" "currentSlide.id" "Current slide ID"
    check_field "$LATEST" "currentSlide.title" "Current slide title"
fi

if jq -e ".explainRequestedAt" "$LATEST" > /dev/null 2>&1; then
    echo "  ✓ explainRequestedAt present (user pressed 'e')"
else
    echo "  - explainRequestedAt not present (user hasn't pressed 'e')"
fi

# Validate field types
echo ""
echo "Type validation:"

MODE=$(jq -r ".mode" "$LATEST")
if [ "$MODE" = "guided" ] || [ "$MODE" = "browse" ]; then
    echo "  ✓ mode is valid: $MODE"
    ((TESTS_PASSED++))
else
    echo "  ✗ mode has invalid value: $MODE (expected 'guided' or 'browse')"
    ((TESTS_FAILED++))
fi

SLIDE_INDEX=$(jq ".slideIndex" "$LATEST")
SLIDE_NUMBER=$(jq ".slideNumber" "$LATEST")
EXPECTED_NUMBER=$((SLIDE_INDEX + 1))
if [ "$SLIDE_NUMBER" -eq "$EXPECTED_NUMBER" ]; then
    echo "  ✓ slideNumber = slideIndex + 1 ($SLIDE_NUMBER = $SLIDE_INDEX + 1)"
    ((TESTS_PASSED++))
else
    echo "  ✗ slideNumber mismatch: $SLIDE_NUMBER != $SLIDE_INDEX + 1"
    ((TESTS_FAILED++))
fi

echo ""
echo "=== Results ==="
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -gt 0 ]; then
    echo "State file contents:"
    jq . "$LATEST"
    exit 1
else
    echo "=== All State Format Tests Passed ==="
fi

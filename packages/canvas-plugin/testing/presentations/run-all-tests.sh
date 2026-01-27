#!/bin/bash
# Run all interactive presentation tests
# Run from packages/canvas-plugin directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PLUGIN_DIR"

echo "========================================"
echo "Interactive Presentations - Test Suite"
echo "========================================"
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0

run_test_script() {
    local name="$1"
    local script="$2"

    echo "----------------------------------------"
    echo "Running: $name"
    echo "----------------------------------------"
    echo ""

    if bash "$script"; then
        echo ""
        echo ">>> $name: PASSED"
        ((TOTAL_PASSED++))
    else
        echo ""
        echo ">>> $name: FAILED"
        ((TOTAL_FAILED++))
    fi
    echo ""
}

# Component tests (no TTY required)
run_test_script "Generator Test" "$SCRIPT_DIR/test-generator.sh"
run_test_script "Watcher Test" "$SCRIPT_DIR/test-watcher.sh"

# State format test (requires previous run)
if ls /tmp/presentation-logs-*/presentation-state.json > /dev/null 2>&1; then
    run_test_script "State Format Test" "$SCRIPT_DIR/test-state-format.sh"
else
    echo "----------------------------------------"
    echo "Skipping: State Format Test (no state files found)"
    echo "Run a presentation first to generate state files"
    echo "----------------------------------------"
    echo ""
fi

echo "========================================"
echo "Test Suite Complete"
echo "========================================"
echo ""
echo "Passed: $TOTAL_PASSED"
echo "Failed: $TOTAL_FAILED"
echo ""

if [ $TOTAL_FAILED -gt 0 ]; then
    echo "Some tests failed. Check output above for details."
    exit 1
else
    echo "All tests passed!"
    echo ""
    echo "Next steps for manual testing:"
    echo "  # VTA only (no Tutor)"
    echo "  bun run src/cli.ts present --file testing/presentations/sample-presentation.yaml"
    echo ""
    echo "  # Full interactive mode"
    echo "  bun run src/cli.ts present --file testing/presentations/sample-presentation.yaml --interactive"
fi

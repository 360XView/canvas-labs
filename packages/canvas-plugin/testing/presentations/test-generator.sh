#!/bin/bash
# Test the presentation generator
# Run from packages/canvas-plugin directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PLUGIN_DIR"

echo "=== Interactive Presentations: Generator Test ==="
echo ""

# Create test markdown with various content types
TEST_MD="/tmp/generator-test-$$.md"
TEST_YAML="/tmp/generator-test-$$.yaml"

cat > "$TEST_MD" << 'EOF'
# Introduction

This is the first paragraph. It has two sentences.

## Bullet Points

- First bullet item
- Second bullet item
- Third bullet item

## Code Example

Here is some code:

```javascript
function hello() {
  console.log("Hello, world!");
}
```

## Mixed Content

Opening sentence here.

- A bullet
- Another bullet

Final sentence for this slide.

## Conclusion

Thank you for watching. Questions are welcome.
EOF

echo "Test markdown created at: $TEST_MD"
echo ""

# Run generator
echo "Running generator..."
bun run src/cli.ts present-gen "$TEST_MD" -o "$TEST_YAML"
echo ""

# Verify output
echo "=== Verification ==="

# Check slide count
SLIDE_COUNT=$(grep -c "^  - id: slide-" "$TEST_YAML" || true)
echo "Slides generated: $SLIDE_COUNT"
if [ "$SLIDE_COUNT" -eq 5 ]; then
    echo "✓ Correct slide count (5)"
else
    echo "✗ Expected 5 slides, got $SLIDE_COUNT"
    exit 1
fi

# Check for sentence segments
if grep -q "type: sentence" "$TEST_YAML"; then
    echo "✓ Sentence segments found"
else
    echo "✗ No sentence segments found"
    exit 1
fi

# Check for bullet segments
if grep -q "type: bullet" "$TEST_YAML"; then
    echo "✓ Bullet segments found"
else
    echo "✗ No bullet segments found"
    exit 1
fi

# Check for code segments
if grep -q "type: code" "$TEST_YAML"; then
    echo "✓ Code segments found"
else
    echo "✗ No code segments found"
    exit 1
fi

echo ""
echo "=== All Generator Tests Passed ==="
echo ""
echo "Generated YAML saved to: $TEST_YAML"
echo "To inspect: cat $TEST_YAML"

# Auto cleanup in non-interactive mode
if [ -t 0 ]; then
    # Interactive - ask user
    echo ""
    read -p "Clean up test files? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -f "$TEST_MD" "$TEST_YAML"
        echo "Cleaned up."
    fi
else
    # Non-interactive - auto cleanup
    rm -f "$TEST_MD" "$TEST_YAML"
fi

#!/bin/bash
# Check greet.sh exists, is executable, and greets with argument

SCRIPT="/home/student/scripts/greet.sh"

if [ ! -f "$SCRIPT" ]; then
    exit 1
fi

if [ ! -x "$SCRIPT" ]; then
    exit 1
fi

# Test with an argument
OUTPUT=$("$SCRIPT" "Alice" 2>&1)
if [[ "$OUTPUT" == *"Hello"*"Alice"* ]]; then
    /usr/local/bin/log-check-result.sh "greet-script" "passed" "greet.sh correctly uses arguments"
    exit 0
fi

exit 1

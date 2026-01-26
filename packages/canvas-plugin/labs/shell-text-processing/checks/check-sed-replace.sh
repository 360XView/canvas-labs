#!/bin/bash
# Check that errors-fixed.txt exists and has ERROR instead of error

FIXED_FILE="/home/student/data/errors-fixed.txt"

if [ ! -f "$FIXED_FILE" ]; then
    exit 1
fi

# Should contain ERROR (uppercase)
if ! grep -q "ERROR" "$FIXED_FILE"; then
    exit 1
fi

# Should NOT contain lowercase "error:" at the start of lines
if grep -q "^error:" "$FIXED_FILE"; then
    exit 1
fi

/usr/local/bin/log-check-result.sh "sed-replace" "passed" "Text replacement successful - error changed to ERROR"
exit 0

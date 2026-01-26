#!/bin/bash
# Check check-file.sh exists and has working conditional logic

SCRIPT="/home/student/scripts/check-file.sh"

if [ ! -f "$SCRIPT" ]; then
    exit 1
fi

if [ ! -x "$SCRIPT" ]; then
    exit 1
fi

# Create a test file
touch /tmp/test-file-for-lab

# Test with existing file - should report exists
OUTPUT_EXISTS=$("$SCRIPT" /tmp/test-file-for-lab 2>&1)

# Test with non-existing file - should report not found
OUTPUT_MISSING=$("$SCRIPT" /tmp/nonexistent-file-xyz 2>&1)

# Clean up
rm -f /tmp/test-file-for-lab

# Check outputs indicate the script differentiates between existing and missing
if [[ "$OUTPUT_EXISTS" == *"exist"* ]] || [[ "$OUTPUT_EXISTS" == *"found"* ]]; then
    if [[ "$OUTPUT_MISSING" == *"not"* ]] || [[ "$OUTPUT_MISSING" != "$OUTPUT_EXISTS" ]]; then
        /usr/local/bin/log-check-result.sh "if-script" "passed" "check-file.sh has working conditional"
        exit 0
    fi
fi

exit 1

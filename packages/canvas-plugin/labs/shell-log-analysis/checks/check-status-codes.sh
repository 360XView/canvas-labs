#!/bin/bash
# Check that status-codes.txt exists and contains HTTP status code counts

FILE="/home/student/analysis/status-codes.txt"

if [ ! -f "$FILE" ]; then
    exit 1
fi

# Check that it contains count + status code format (e.g., "  10 200")
if grep -qE "^\s*[0-9]+\s+(200|404|500|403)" "$FILE"; then
    # Verify 200 is present (most common in our data)
    if grep -q "200" "$FILE"; then
        /usr/local/bin/log-check-result.sh "status-codes" "passed" "Status code analysis complete"
        exit 0
    fi
fi

exit 1

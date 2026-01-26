#!/bin/bash
# Check that analyze-logs.sh exists, is executable, and creates a report

SCRIPT="/home/student/scripts/analyze-logs.sh"
REPORT="/home/student/analysis/report.txt"

# Check script exists
if [ ! -f "$SCRIPT" ]; then
    exit 1
fi

# Check script is executable
if [ ! -x "$SCRIPT" ]; then
    exit 1
fi

# Run the script
"$SCRIPT" > /dev/null 2>&1

# Check that report was created
if [ ! -f "$REPORT" ]; then
    exit 1
fi

# Verify report has content (at least header and some data)
if [ -s "$REPORT" ]; then
    # Check for expected sections
    if grep -qi "report\|analysis\|log" "$REPORT" || grep -qE "^\s*[0-9]+" "$REPORT"; then
        /usr/local/bin/log-check-result.sh "analysis-script" "passed" "Analysis script works correctly"
        exit 0
    fi
fi

exit 1

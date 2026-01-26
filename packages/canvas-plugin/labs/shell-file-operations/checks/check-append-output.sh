#!/bin/bash
# Check that results.txt has been appended with date output

RESULTS_FILE="/home/student/data/results.txt"

if [ ! -f "$RESULTS_FILE" ]; then
    exit 1
fi

# Check line count - should have at least 2 lines (SUCCESS lines + date)
LINE_COUNT=$(wc -l < "$RESULTS_FILE")

if [ "$LINE_COUNT" -ge 2 ]; then
    # Additionally check if there's a date-like pattern (day/month/year format or date output)
    if grep -qE "[0-9]{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec" "$RESULTS_FILE"; then
        /usr/local/bin/log-check-result.sh "append-output" "passed" "Date appended to results.txt successfully"
        exit 0
    fi
fi

exit 1

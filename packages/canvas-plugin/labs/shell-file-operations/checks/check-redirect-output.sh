#!/bin/bash
# Check that results.txt exists and contains SUCCESS lines

RESULTS_FILE="/home/student/data/results.txt"

if [ ! -f "$RESULTS_FILE" ]; then
    exit 1
fi

# Check that it contains SUCCESS (case insensitive)
if grep -qi "SUCCESS" "$RESULTS_FILE"; then
    /usr/local/bin/log-check-result.sh "redirect-output" "passed" "Output redirected successfully to results.txt"
    exit 0
fi

exit 1

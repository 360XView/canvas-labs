#!/bin/bash
# Check that word-freq.txt exists and contains word frequency data

FREQ_FILE="/home/student/data/word-freq.txt"

if [ ! -f "$FREQ_FILE" ]; then
    exit 1
fi

# Check that file has content (at least 1 line)
LINE_COUNT=$(wc -l < "$FREQ_FILE")
if [ "$LINE_COUNT" -lt 1 ]; then
    exit 1
fi

# Check that it contains numbers (from uniq -c)
if grep -qE "^\s*[0-9]+" "$FREQ_FILE"; then
    # Check for common words that should be in the top results
    # "the" appears 6 times, should be in top 3
    if grep -qi "the" "$FREQ_FILE"; then
        /usr/local/bin/log-check-result.sh "word-frequency" "passed" "Word frequency analysis complete"
        exit 0
    fi
fi

exit 1

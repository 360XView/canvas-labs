#!/bin/bash
# Check that top-ips.txt exists and contains IP frequency data

FILE="/home/student/analysis/top-ips.txt"

if [ ! -f "$FILE" ]; then
    exit 1
fi

# Check that it contains numbers (from uniq -c) and IPs
if grep -qE "^\s*[0-9]+\s+192\.168\." "$FILE"; then
    # Check that 192.168.1.100 is in there (most frequent in our data)
    if grep -q "192.168.1.100" "$FILE"; then
        /usr/local/bin/log-check-result.sh "top-ips" "passed" "Top IP analysis complete"
        exit 0
    fi
fi

exit 1

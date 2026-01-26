#!/bin/bash
# Check that failed-users.txt exists and contains usernames from failed logins

FILE="/home/student/analysis/failed-users.txt"

if [ ! -f "$FILE" ]; then
    exit 1
fi

# Check that it contains expected usernames (admin, root, guest, test)
# At least two of these should be present
FOUND=0

if grep -q "admin" "$FILE"; then
    FOUND=$((FOUND + 1))
fi
if grep -q "root" "$FILE"; then
    FOUND=$((FOUND + 1))
fi
if grep -q "guest" "$FILE"; then
    FOUND=$((FOUND + 1))
fi
if grep -q "test" "$FILE"; then
    FOUND=$((FOUND + 1))
fi

if [ "$FOUND" -ge 2 ]; then
    /usr/local/bin/log-check-result.sh "failed-usernames" "passed" "Failed usernames extracted"
    exit 0
fi

exit 1

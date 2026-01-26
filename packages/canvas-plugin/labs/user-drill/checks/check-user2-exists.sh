#!/bin/bash
# Check that user2 exists and create marker for delete check

MARKER="/var/log/lab-commands/.user2-created"

if id "user2" &>/dev/null; then
    touch "$MARKER"
    echo "user2 exists"
    exit 0
else
    echo "user2 does not exist"
    exit 1
fi

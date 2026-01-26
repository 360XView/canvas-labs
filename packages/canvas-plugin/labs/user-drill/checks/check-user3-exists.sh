#!/bin/bash
# Check that user3 exists and create marker for delete check

MARKER="/var/log/lab-commands/.user3-created"

if id "user3" &>/dev/null; then
    touch "$MARKER"
    echo "user3 exists"
    exit 0
else
    echo "user3 does not exist"
    exit 1
fi

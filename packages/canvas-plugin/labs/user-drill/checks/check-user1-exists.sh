#!/bin/bash
# Check that user1 exists and create marker for delete check

MARKER="/var/log/lab-commands/.user1-created"

if id "user1" &>/dev/null; then
    # Create marker so delete check knows user was created
    touch "$MARKER"
    echo "user1 exists"
    exit 0
else
    echo "user1 does not exist"
    exit 1
fi

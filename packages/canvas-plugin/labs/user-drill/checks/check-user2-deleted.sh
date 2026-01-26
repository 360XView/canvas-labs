#!/bin/bash
# Check that user2 was created (marker exists) AND has been deleted

MARKER="/var/log/lab-commands/.user2-created"

if [ ! -f "$MARKER" ]; then
    echo "user2 was never created - complete create-user2 first"
    exit 1
fi

if id "user2" &>/dev/null; then
    echo "user2 still exists"
    exit 1
else
    echo "user2 deleted"
    exit 0
fi

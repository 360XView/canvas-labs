#!/bin/bash
# Check that user3 was created (marker exists) AND has been deleted

MARKER="/var/log/lab-commands/.user3-created"

if [ ! -f "$MARKER" ]; then
    echo "user3 was never created - complete create-user3 first"
    exit 1
fi

if id "user3" &>/dev/null; then
    echo "user3 still exists"
    exit 1
else
    echo "user3 deleted"
    exit 0
fi

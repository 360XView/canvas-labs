#!/bin/bash
# Check that user1 was created (marker exists) AND has been deleted

MARKER="/var/log/lab-commands/.user1-created"

# First verify the user was created at some point
if [ ! -f "$MARKER" ]; then
    echo "user1 was never created - complete create-user1 first"
    exit 1
fi

# Now check if the user has been deleted
if id "user1" &>/dev/null; then
    echo "user1 still exists"
    exit 1
else
    echo "user1 deleted"
    exit 0
fi

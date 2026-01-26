#!/bin/bash
# Check if devuser has been created
# Returns 0 (success) if user exists, 1 otherwise

if id "devuser" &>/dev/null; then
    # User exists - log result and exit successfully
    /usr/local/bin/log-check-result.sh "create-user" "passed" "User devuser exists"
    exit 0
fi

# User doesn't exist yet - keep polling
exit 1

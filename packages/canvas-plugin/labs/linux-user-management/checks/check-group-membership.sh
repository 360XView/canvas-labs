#!/bin/bash
# Check if devuser is in the developers group
# Returns 0 (success) if user is in group, 1 otherwise

# First check if user exists
if ! id "devuser" &>/dev/null; then
    exit 1
fi

# Check if user is in developers group
if id "devuser" | grep -q "(developers)"; then
    # User is in developers group - log result and exit successfully
    /usr/local/bin/log-check-result.sh "add-to-group" "passed" "User devuser is in developers group"
    exit 0
fi

# Also check using groups command (different format)
if groups devuser 2>/dev/null | grep -q "\bdevelopers\b"; then
    /usr/local/bin/log-check-result.sh "add-to-group" "passed" "User devuser is in developers group"
    exit 0
fi

# User not in group yet - keep polling
exit 1

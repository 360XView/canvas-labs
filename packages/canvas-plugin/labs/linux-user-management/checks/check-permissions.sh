#!/bin/bash
# Check if /home/devuser has permissions 750
# Returns 0 (success) if permissions are correct, 1 otherwise

HOME_DIR="/home/devuser"

# First check if directory exists
if [ ! -d "${HOME_DIR}" ]; then
    exit 1
fi

# Get permissions in octal format
PERMS=$(stat -c "%a" "${HOME_DIR}" 2>/dev/null)

if [ "${PERMS}" = "750" ]; then
    # Permissions are correct - log result and exit successfully
    /usr/local/bin/log-check-result.sh "set-permissions" "passed" "Permissions on ${HOME_DIR} are 750"
    exit 0
fi

# Permissions not set correctly yet - keep polling
exit 1

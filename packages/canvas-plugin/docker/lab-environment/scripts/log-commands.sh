#!/bin/bash
# Command logging script for lab environment
# This file is sourced in /etc/profile.d/ to log all commands

# Log directory (mounted from host)
LOG_DIR="/var/log/lab-commands"
LOG_FILE="${LOG_DIR}/commands.log"

# Ensure log directory exists
mkdir -p "${LOG_DIR}"

# Function to log commands as JSON
log_command() {
    local cmd="$1"

    # Skip empty commands
    if [ -z "$cmd" ]; then
        return
    fi

    # Skip the logging command itself
    if [[ "$cmd" == *"log_command"* ]]; then
        return
    fi

    # Get current timestamp in ISO format
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

    # Get current user
    local user=$(whoami)

    # Get current working directory
    local pwd=$(pwd)

    # Escape special characters for JSON
    cmd=$(echo "$cmd" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/\t/\\t/g')
    pwd=$(echo "$pwd" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')

    # Write JSON log entry
    echo "{\"timestamp\":\"${timestamp}\",\"user\":\"${user}\",\"pwd\":\"${pwd}\",\"command\":\"${cmd}\"}" >> "${LOG_FILE}"
}

# Set up PROMPT_COMMAND to log the last command
# This function is called before each prompt is displayed
_log_last_command() {
    # Get the last command from history
    local last_cmd=$(history 1 | sed 's/^[ ]*[0-9]*[ ]*//')
    log_command "$last_cmd"
}

# Only set PROMPT_COMMAND if not already set for logging
if [[ "$PROMPT_COMMAND" != *"_log_last_command"* ]]; then
    export PROMPT_COMMAND="_log_last_command${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
fi

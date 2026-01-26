#!/bin/bash
# Helper script to log check results to checks.log
# Usage: log-check-result.sh <stepId> <status> [message]

STEP_ID="$1"
STATUS="$2"
MESSAGE="${3:-}"

LOG_FILE="/var/log/lab-commands/checks.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Escape special JSON characters in message
# Replace \ with \\, then " with \"
escape_json() {
    local str="$1"
    str="${str//\\/\\\\}"  # Escape backslashes first
    str="${str//\"/\\\"}"  # Escape double quotes
    str="${str//$'\n'/\\n}" # Escape newlines
    str="${str//$'\r'/\\r}" # Escape carriage returns
    str="${str//$'\t'/\\t}" # Escape tabs
    echo "$str"
}

# Build JSON entry with proper escaping
if [ -n "${MESSAGE}" ]; then
    ESCAPED_MSG=$(escape_json "$MESSAGE")
    echo "{\"stepId\":\"${STEP_ID}\",\"status\":\"${STATUS}\",\"timestamp\":\"${TIMESTAMP}\",\"message\":\"${ESCAPED_MSG}\"}" >> "${LOG_FILE}"
else
    echo "{\"stepId\":\"${STEP_ID}\",\"status\":\"${STATUS}\",\"timestamp\":\"${TIMESTAMP}\"}" >> "${LOG_FILE}"
fi

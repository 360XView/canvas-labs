#!/bin/bash
# Check that analyze-logs.sh accepts a log directory argument

SCRIPT="/home/student/scripts/analyze-logs.sh"

# Check script exists and is executable
if [ ! -f "$SCRIPT" ] || [ ! -x "$SCRIPT" ]; then
    exit 1
fi

# Check if script uses $1 or ${1 for argument handling
if grep -qE '\$1|\$\{1' "$SCRIPT"; then
    # Also check for LOG_DIR or similar variable pattern
    if grep -qE '(LOG_DIR|LOGDIR|log_dir|DIR).*=.*\$' "$SCRIPT" || grep -qE '\$1.*log|log.*\$1' "$SCRIPT"; then
        /usr/local/bin/log-check-result.sh "reusable-script" "passed" "Script accepts directory argument"
        exit 0
    fi

    # Alternative: script directly uses $1 in commands
    if grep -qE '\$1/|"\$1"|'"'"'\$1'"'" "$SCRIPT"; then
        /usr/local/bin/log-check-result.sh "reusable-script" "passed" "Script accepts directory argument"
        exit 0
    fi
fi

exit 1

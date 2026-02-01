#!/bin/bash
# Capture Claude Code Stop events for tutor output logging
# Configured via .claude/settings.local.json in tutor workspace

# Required: set by spawn.ts
LAB_LOG_DIR="${LAB_LOG_DIR:-}"
SESSION_ID="${LAB_SESSION_ID:-unknown}"

OUTPUT_FILE="$LAB_LOG_DIR/tutor-speech.jsonl"
ERROR_FILE="$LAB_LOG_DIR/tutor-speech-errors.jsonl"

# Helper: log error and exit cleanly
log_error() {
    local msg="$1"
    local ts=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    echo "{\"timestamp\":\"$ts\",\"error\":\"$msg\",\"session_id\":\"$SESSION_ID\"}" >> "$ERROR_FILE" 2>/dev/null
    exit 0  # Always exit 0 - never block Claude
}

# Validate environment
[ -z "$LAB_LOG_DIR" ] && log_error "LAB_LOG_DIR not set"
[ ! -d "$LAB_LOG_DIR" ] && log_error "LAB_LOG_DIR does not exist: $LAB_LOG_DIR"

# Read Stop event from stdin
EVENT=$(cat)

# Extract transcript path
TRANSCRIPT_PATH=$(echo "$EVENT" | jq -r '.transcript_path // empty')

[ -z "$TRANSCRIPT_PATH" ] && log_error "No transcript_path in event"
[ ! -f "$TRANSCRIPT_PATH" ] && log_error "Transcript file not found: $TRANSCRIPT_PATH"

# Extract latest assistant message from transcript
RESPONSE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1 | jq -r '.message.content[0].text // empty' 2>/dev/null)

[ -z "$RESPONSE" ] && exit 0  # No response to capture (not an error)

# Append structured event
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
CLAUDE_SESSION=$(echo "$EVENT" | jq -r '.session_id // empty')

jq -n \
    --arg ts "$TIMESTAMP" \
    --arg lab_sid "$SESSION_ID" \
    --arg claude_sid "$CLAUDE_SESSION" \
    --arg content "$RESPONSE" \
    '{
        timestamp: $ts,
        session_id: $lab_sid,
        claude_session_id: $claude_sid,
        event_type: "tutor_utterance",
        content: $content
    }' >> "$OUTPUT_FILE"

exit 0

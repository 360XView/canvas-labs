#!/bin/bash
# Check if user has become root
# Multiple detection methods since sudo su doesn't log properly

LOG_FILE="/var/log/lab-commands/commands.log"

# Method 1: Check if any commands were run as root (from log)
if [ -f "$LOG_FILE" ] && [ -s "$LOG_FILE" ]; then
  if grep -q '"user":"root"' "$LOG_FILE" 2>/dev/null; then
    echo '{"status":"passed","message":"Commands detected running as root"}'
    exit 0
  fi
fi

# Method 2: Check for ANY root shell process attached to ANY pts
# This detects if someone ran sudo su and is now in a root shell
if ps aux 2>/dev/null | grep -E "^root.+pts/[0-9]+.+(bash|sh)$" | grep -v grep >/dev/null; then
  echo '{"status":"passed","message":"Root shell session detected"}'
  exit 0
fi

# Method 3: Check if a file marker exists (created by root)
MARKER="/tmp/.root-session-marker"
if [ -f "$MARKER" ]; then
  echo '{"status":"passed","message":"Root session marker found"}'
  exit 0
fi

echo '{"status":"failed","message":"Not running as root. Run: sudo su"}'
exit 1

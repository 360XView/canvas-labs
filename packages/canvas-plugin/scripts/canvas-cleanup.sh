#!/bin/bash
# canvas-cleanup.sh - Clean up orphaned canvas lab processes
#
# Usage: ./canvas-cleanup.sh [--dry-run]
#
# This script finds and kills orphaned canvas lab processes:
# - monitor.ts processes
# - progress-updater.ts processes
# - tutor-watcher.ts processes
# - Docker containers with lab- prefix

set -e

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "Dry run mode - no processes will be killed"
  echo ""
fi

echo "=== Canvas Labs Cleanup Utility ==="
echo ""

# Function to kill matching processes
cleanup_processes() {
  local pattern="$1"
  local name="$2"

  local pids=$(pgrep -f "$pattern" 2>/dev/null || true)

  if [[ -z "$pids" ]]; then
    echo "✓ No orphaned $name processes found"
  else
    local count=$(echo "$pids" | wc -l | tr -d ' ')
    echo "Found $count orphaned $name process(es):"
    echo "$pids" | while read pid; do
      if [[ -n "$pid" ]]; then
        local cmd=$(ps -p "$pid" -o args= 2>/dev/null | head -c 60 || echo "unknown")
        echo "  PID $pid: $cmd..."
      fi
    done

    if [[ "$DRY_RUN" == "false" ]]; then
      echo "$pids" | xargs kill 2>/dev/null || true
      echo "  → Killed"
    fi
  fi
}

# Clean up bun processes
cleanup_processes "lab/monitor.ts" "monitor"
cleanup_processes "tutor/progress-updater.ts" "progress-updater"
cleanup_processes "lab/tutor-watcher.ts" "tutor-watcher"

echo ""

# Clean up Docker containers
CONTAINERS=$(docker ps -q --filter "name=lab-" 2>/dev/null || true)
if [[ -z "$CONTAINERS" ]]; then
  echo "✓ No orphaned Docker containers found"
else
  COUNT=$(echo "$CONTAINERS" | wc -l | tr -d ' ')
  echo "Found $COUNT orphaned Docker container(s):"
  docker ps --filter "name=lab-" --format "  {{.ID}}: {{.Names}} ({{.Status}})"

  if [[ "$DRY_RUN" == "false" ]]; then
    echo "$CONTAINERS" | xargs docker kill 2>/dev/null || true
    echo "  → Killed"
  fi
fi

echo ""

# Clean up old log directories (older than 1 day)
OLD_LOGS=$(find /tmp -maxdepth 1 -name "lab-logs-*" -mtime +1 2>/dev/null || true)
if [[ -z "$OLD_LOGS" ]]; then
  echo "✓ No old log directories found"
else
  COUNT=$(echo "$OLD_LOGS" | wc -l | tr -d ' ')
  echo "Found $COUNT old log director(ies) (>1 day old):"
  echo "$OLD_LOGS" | while read dir; do
    echo "  $dir"
  done

  if [[ "$DRY_RUN" == "false" ]]; then
    echo "$OLD_LOGS" | xargs rm -rf 2>/dev/null || true
    echo "  → Removed"
  fi
fi

echo ""
echo "=== Cleanup complete ==="

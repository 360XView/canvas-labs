// Tutor Watcher - Monitors lab logs and sends events to Claude Code via tmux
// Usage: bun run src/lab/tutor-watcher.ts <logs-dir> <tmux-target>

import { watch, existsSync, statSync, appendFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Get CLI arguments (declared early for log function)
const logsDir = process.argv[2];
const tmuxTarget = process.argv[3] || "lab:0.0";
const socketPath = process.argv[4]; // Optional: for heartbeat

// Log to file for debugging (since process runs detached)
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  process.stdout.write(line);
  // Also write to log file in the watched directory
  if (logsDir) {
    try {
      appendFileSync(`${logsDir}/tutor-watcher.log`, line);
    } catch {
      // Ignore write errors
    }
  }
}

// Configuration
const DEBOUNCE_MS = 3_000;    // Wait 3s after last activity before sending event
const MIN_COOLDOWN_MS = 2_000;  // Minimum wait between events (even with hook signal)
const MAX_COOLDOWN_MS = 30_000; // Maximum wait - fallback if hook doesn't fire
const STARTUP_DELAY_MS = 5_000; // Wait before reacting to events (let lab settle)

interface WatcherState {
  debounceTimer: ReturnType<typeof setTimeout> | null;
  busy: boolean;
  commandsSize: number;
  checksSize: number;
  stateSize: number;
  lastEventTime: number;  // Track when we last sent an event
  pendingEvent: boolean;  // True if an event occurred while busy
  initialized: boolean;   // True after startup delay
  hasUserActivity: boolean; // True after first command is logged
}

const state: WatcherState = {
  debounceTimer: null,
  busy: false,
  commandsSize: 0,
  checksSize: 0,
  stateSize: 0,
  lastEventTime: 0,
  pendingEvent: false,
  initialized: false,
  hasUserActivity: false,
};

if (!logsDir) {
  log("Usage: bun run tutor-watcher.ts <logs-dir> [tmux-target]");
  log("  logs-dir: Path to lab logs directory (e.g., /tmp/lab-logs-xxx)");
  log("  tmux-target: Tmux pane target (default: lab:0.0)");
  process.exit(1);
}

const commandsLog = `${logsDir}/commands.log`;
const checksLog = `${logsDir}/checks.log`;
const stateFile = `${logsDir}/state.json`;

// Send a command to Claude Code via tmux
async function sendToClaudeCode(command: string): Promise<void> {
  try {
    // Send text literally with -l flag, then carriage return separately
    await execFileAsync("tmux", ["send-keys", "-t", tmuxTarget, "-l", command]);
    await execFileAsync("tmux", ["send-keys", "-t", tmuxTarget, "C-m"]);
    log(`[tutor-watcher] Sent: ${command}`);
  } catch (error) {
    log(`[tutor-watcher] Failed to send command: ${error}`);
  }
}

// Send TUTOR:EVENT command (debounced)
function sendEvent(): void {
  if (state.busy) {
    log("[tutor-watcher] Skipping event - Claude is busy");
    return;
  }

  state.busy = true;

  sendToClaudeCode("TUTOR:EVENT").finally(() => {
    // Release busy lock after cooldown
    setTimeout(() => {
      state.busy = false;
    }, MIN_COOLDOWN_MS);
  });
}

// Send SESSION_END before shutdown so the tutor can write observations
async function sendSessionEnd(): Promise<void> {
  log("[tutor-watcher] Sending TUTOR:SESSION_END");
  try {
    await sendToClaudeCode("TUTOR:SESSION_END");
    // Give the tutor time to write observations
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    log("[tutor-watcher] SESSION_END grace period complete");
  } catch (error) {
    log(`[tutor-watcher] Failed to send SESSION_END: ${error}`);
  }
}

// Handle log file changes
function onLogChange(isCommand: boolean = false): void {
  log(`[tutor-watcher] onLogChange called - isCommand: ${isCommand}, initialized: ${state.initialized}, hasUserActivity: ${state.hasUserActivity}`);

  // Track user activity when commands are logged
  if (isCommand) {
    state.hasUserActivity = true;
    log(`[tutor-watcher] User activity detected!`);
  }

  // Don't react until initialized
  if (!state.initialized) {
    log(`[tutor-watcher] Not yet initialized, ignoring`);
    return;
  }

  // Only send events after user has run at least one command
  if (!state.hasUserActivity) {
    log(`[tutor-watcher] No user activity yet, ignoring`);
    return;
  }

  if (state.busy) {
    log(`[tutor-watcher] Busy, ignoring`);
    return;
  }

  // Clear existing debounce timer
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  log(`[tutor-watcher] Setting debounce timer for ${DEBOUNCE_MS}ms`);

  // Set new debounce timer
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    log(`[tutor-watcher] Debounce complete, sending event`);
    sendEvent();
  }, DEBOUNCE_MS);
}

// Check if files have actually changed (not just touched)
function hasFileChanged(path: string, lastSize: number): { changed: boolean; newSize: number } {
  if (!existsSync(path)) {
    return { changed: false, newSize: 0 };
  }

  const stats = statSync(path);
  const newSize = stats.size;
  return { changed: newSize > lastSize, newSize };
}

// Start watching log files
function startWatching(): void {
  log(`[tutor-watcher] Watching ${logsDir}`);
  log(`[tutor-watcher] Target: ${tmuxTarget}`);

  // Initialize file sizes
  if (existsSync(commandsLog)) {
    state.commandsSize = statSync(commandsLog).size;
  }
  if (existsSync(checksLog)) {
    state.checksSize = statSync(checksLog).size;
  }
  if (existsSync(stateFile)) {
    state.stateSize = statSync(stateFile).size;
  }

  // Watch the logs directory - only react to actual log changes
  watch(logsDir, { persistent: true }, (eventType, filename) => {
    // Ignore our own log file to prevent infinite loops
    if (filename === "tutor-watcher.log") {
      return;
    }
    log(`[tutor-watcher] File event: ${eventType} ${filename}`);

    if (filename === "commands.log") {
      const { changed, newSize } = hasFileChanged(commandsLog, state.commandsSize);
      log(`[tutor-watcher] commands.log - changed: ${changed}, oldSize: ${state.commandsSize}, newSize: ${newSize}`);
      if (changed) {
        state.commandsSize = newSize;
        onLogChange(true); // This is a user command
      }
    } else if (filename === "checks.log") {
      const { changed, newSize } = hasFileChanged(checksLog, state.checksSize);
      log(`[tutor-watcher] checks.log - changed: ${changed}, oldSize: ${state.checksSize}, newSize: ${newSize}`);
      if (changed) {
        state.checksSize = newSize;
        // Check changes also indicate user activity (user did something that triggered a check)
        onLogChange(true);
      }
    } else if (filename === "state.json") {
      // state.json is updated when questions are answered, tasks completed, etc.
      const { changed, newSize } = hasFileChanged(stateFile, state.stateSize);
      log(`[tutor-watcher] state.json - changed: ${changed}, oldSize: ${state.stateSize}, newSize: ${newSize}`);
      if (changed) {
        state.stateSize = newSize;
        // State changes also indicate user activity (step completed, question answered)
        onLogChange(true);
      }
    }
  });

  // Mark as initialized after startup delay
  setTimeout(() => {
    state.initialized = true;
    log("[tutor-watcher] Initialized - now responding to events");
  }, STARTUP_DELAY_MS);
}

// Heartbeat for orphan detection (initialized after start)
let heartbeat: { stop: () => void } | null = null;

// Handle shutdown
process.on("SIGINT", () => {
  log("\n[tutor-watcher] Shutting down...");
  heartbeat?.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  log("[tutor-watcher] Shutting down, sending SESSION_END...");
  await sendSessionEnd();
  heartbeat?.stop();
  process.exit(0);
});

// Start the watcher
startWatching();

// Start heartbeat if socket path provided
if (socketPath) {
  const { createHeartbeat } = await import("./heartbeat");
  heartbeat = createHeartbeat({
    socketPath,
    checkIntervalMs: 30_000,
    missedChecksBeforeExit: 3,
    onOrphaned: async () => {
      log("[tutor-watcher] Session ended, sending SESSION_END...");
      await sendSessionEnd();
      heartbeat?.stop();
      process.exit(0);
    },
    onLog: log,
  });
  heartbeat.start();
}

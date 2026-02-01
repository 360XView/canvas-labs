// Lab Monitor - Watches logs for task completion
// Refactored to use Event Hub with adapter pattern for multi-lab support
// Maintains backward compatibility with existing Linux CLI labs

import { dirname, join } from "path";
import type { LabType } from "./telemetry/types";
import { createEventHubForLab, type CreateEventHubForLabOptions } from "./event-hub/factory";
import type { EventHub } from "./event-hub/hub";
import type { EventLogger } from "./telemetry/event-logger";
import { startSpeechWatcher } from "./tutor-control/speech-watcher";

export interface MonitorOptions {
  logPath: string;
  socketPath: string;
  moduleId: string;
  studentId?: string; // Profile ID for telemetry, defaults to "anonymous"
  checksLogPath?: string; // Path to checks.log, defaults to same directory as logPath
  labType?: LabType; // NEW: Lab type, defaults to "linux_cli"
  enableTelemetry?: boolean; // Enable telemetry logging, defaults to true
  onTaskCompleted?: (stepId: string, taskId: string, source: "command" | "check" | "tutor") => void;
  onError?: (error: Error) => void;
  onLog?: (message: string) => void;
}

export interface Monitor {
  start: () => Promise<void>;
  stop: () => void;
  isRunning: () => boolean;
  getSessionId: () => string | null;
  getEventLogger: () => EventLogger | null;
}

export async function createMonitor(options: MonitorOptions): Promise<Monitor> {
  const { logPath, socketPath, moduleId, studentId = "anonymous", labType = "linux_cli", onTaskCompleted, onError, onLog } = options;

  // Default checks.log to same directory as commands.log
  const logDir = dirname(logPath);
  const checksLogPath = options.checksLogPath ?? join(logDir, "checks.log");

  // Create event hub with appropriate adapter
  const hub = createEventHubForLab({
    labType,
    moduleId,
    logPath,
    logDir,
    socketPath,
    studentId,
    checksLogPath,
    onTaskCompleted: (stepId, source) => {
      onTaskCompleted?.(stepId, `task-0`, source);
    },
    onError,
    onLog,
  });

  // Speech watcher cleanup function (set after start)
  let stopSpeechWatcher: (() => void) | null = null;

  return {
    async start() {
      await hub.start();

      // Start speech watcher to capture tutor utterances
      try {
        stopSpeechWatcher = await startSpeechWatcher({
          logDir,
          onUtterance: (event) => {
            hub.emitTutorUtterance(event);
            onLog?.(`Speech watcher: tutor utterance captured`);
          },
          onError: (err) => {
            onLog?.(`Speech watcher error: ${err.message}`);
          },
        });
        onLog?.("Speech watcher started");
      } catch (e) {
        onLog?.(`Warning: Could not start speech watcher: ${e}`);
      }
    },

    stop() {
      // Stop speech watcher first
      if (stopSpeechWatcher) {
        stopSpeechWatcher();
        stopSpeechWatcher = null;
      }
      hub.stop();
    },

    isRunning() {
      return hub.isRunning();
    },

    getSessionId() {
      return hub.getSessionId();
    },

    getEventLogger() {
      return hub.getEventLogger();
    },
  };
}

// CLI entry point for running monitor standalone
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log("Usage: bun run monitor.ts <log-path> <socket-path> <module-id> [lab-type]");
    process.exit(1);
  }

  const [logPath, socketPath, moduleId, providedLabType] = args;
  const labType = (providedLabType ?? process.env.LAB_TYPE ?? "linux_cli") as LabType;

  // Import heartbeat dynamically to avoid circular deps
  const { createHeartbeat } = await import("./heartbeat");

  const monitor = await createMonitor({
    logPath,
    socketPath,
    moduleId,
    labType,
    onTaskCompleted: (stepId: string, taskId: string, source: "command" | "check" | "tutor") => {
      console.log(`[COMPLETED] Step: ${stepId}, Task: ${taskId}, Source: ${source}`);
    },
    onError: (error) => {
      console.error(`[ERROR] ${error.message}`);
    },
    onLog: (message) => {
      console.log(`[LOG] ${message}`);
    },
  });

  await monitor.start();

  // Start heartbeat to detect orphaned state
  const heartbeat = createHeartbeat({
    socketPath,
    checkIntervalMs: 30_000, // Check every 30s
    missedChecksBeforeExit: 3, // Exit after 3 missed checks (90s)
    onOrphaned: () => {
      console.log("[monitor] Session ended, shutting down...");
      monitor.stop();
      process.exit(0);
    },
    onLog: (msg) => console.log(msg),
  });
  heartbeat.start();

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    heartbeat.stop();
    monitor.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    heartbeat.stop();
    monitor.stop();
    process.exit(0);
  });
}

// Lab Monitor - Watches logs for task completion
// Refactored to use Event Hub with adapter pattern for multi-lab support
// Maintains backward compatibility with existing Linux CLI labs

import { dirname, join } from "path";
import type { LabType } from "./telemetry/types";
import { createEventHubForLab, type CreateEventHubForLabOptions } from "./event-hub/factory";
import type { EventHub } from "./event-hub/hub";
import type { EventLogger } from "./telemetry/event-logger";

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
  const checksLogPath = options.checksLogPath ?? join(dirname(logPath), "checks.log");

  // Create event hub with appropriate adapter
  const hub = createEventHubForLab({
    labType,
    moduleId,
    logPath,
    logDir: dirname(logPath),
    socketPath,
    studentId,
    checksLogPath,
    onTaskCompleted: (stepId, source) => {
      onTaskCompleted?.(stepId, `task-0`, source);
    },
    onError,
    onLog,
  });

  return {
    async start() {
      await hub.start();
    },

    stop() {
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

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    monitor.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    monitor.stop();
    process.exit(0);
  });
}

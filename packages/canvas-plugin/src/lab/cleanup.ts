// Lab environment cleanup utilities
// Handles graceful shutdown of background processes and Docker containers

import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { basename } from "path";

/**
 * Kill a process by PID if it exists
 */
function killProcess(pid: number): void {
  try {
    process.kill(pid, 0); // Check if process exists
    // Send SIGTERM for graceful shutdown (allows cleanup handlers to run)
    process.kill(pid, "SIGTERM");
  } catch {
    // Process doesn't exist, that's fine
  }
}

/**
 * Kill Docker container by ID
 */
function killDockerContainer(containerId: string | undefined): void {
  if (!containerId) return;

  try {
    spawnSync("docker", ["kill", containerId], { stdio: "pipe" });
  } catch {
    // Container might already be stopped
  }
}

/**
 * Perform graceful shutdown of a lab session
 * Kills background processes (monitor, progress-updater, tutor-watcher)
 * and Docker container
 */
export function cleanupLabSession(
  logDir: string,
  containerId?: string
): void {
  // Kill monitor process
  const monitorPidFile = `${logDir}/monitor.pid`;
  if (existsSync(monitorPidFile)) {
    try {
      const pid = parseInt(readFileSync(monitorPidFile, "utf-8").trim(), 10);
      if (!isNaN(pid)) killProcess(pid);
    } catch {
      // Ignore errors reading PID file
    }
  }

  // Kill progress updater process
  const progressUpdaterPidFile = `${logDir}/progress-updater.pid`;
  if (existsSync(progressUpdaterPidFile)) {
    try {
      const pid = parseInt(readFileSync(progressUpdaterPidFile, "utf-8").trim(), 10);
      if (!isNaN(pid)) killProcess(pid);
    } catch {
      // Ignore errors reading PID file
    }
  }

  // Kill tutor watcher process
  const tutorWatcherPidFile = `${logDir}/tutor-watcher.pid`;
  if (existsSync(tutorWatcherPidFile)) {
    try {
      const pid = parseInt(readFileSync(tutorWatcherPidFile, "utf-8").trim(), 10);
      if (!isNaN(pid)) killProcess(pid);
    } catch {
      // Ignore errors reading PID file
    }
  }

  // Kill Docker container
  killDockerContainer(containerId);
}

/**
 * Derive log directory from socket path
 * Socket: /tmp/lab-{moduleId}-{timestamp}.sock -> Log dir: /tmp/lab-logs-{moduleId}-{timestamp}/
 */
export function deriveLogDir(socketPath: string): string {
  const filename = basename(socketPath, ".sock"); // e.g., "lab-shell-file-operations-1234567890"
  const id = filename.replace(/^lab-/, ""); // e.g., "shell-file-operations-1234567890"
  return `/tmp/lab-logs-${id}`;
}

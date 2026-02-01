// packages/canvas-plugin/src/lab/heartbeat.ts
import { existsSync } from "fs";

export interface HeartbeatOptions {
  /** Path to the socket file to monitor */
  socketPath: string;
  /** How often to check (ms). Default: 30000 (30s) */
  checkIntervalMs?: number;
  /** How many consecutive missed checks before calling onOrphaned. Default: 3 */
  missedChecksBeforeExit?: number;
  /** Called when process appears orphaned */
  onOrphaned: () => void;
  /** Optional logging function */
  onLog?: (message: string) => void;
}

export interface Heartbeat {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

/**
 * Creates a heartbeat monitor that checks if the parent session is still alive.
 * If the socket file disappears for multiple consecutive checks, calls onOrphaned.
 */
export function createHeartbeat(options: HeartbeatOptions): Heartbeat {
  const {
    socketPath,
    checkIntervalMs = 30_000,
    missedChecksBeforeExit = 3,
    onOrphaned,
    onLog,
  } = options;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let missedChecks = 0;
  let running = false;

  function log(message: string): void {
    onLog?.(`[heartbeat] ${message}`);
  }

  function check(): void {
    const socketExists = existsSync(socketPath);

    if (socketExists) {
      // Reset counter when socket is found
      if (missedChecks > 0) {
        log(`Socket found again, resetting missed count`);
      }
      missedChecks = 0;
    } else {
      missedChecks++;
      log(`Socket not found (${missedChecks}/${missedChecksBeforeExit})`);

      if (missedChecks >= missedChecksBeforeExit) {
        log(`Session appears orphaned, triggering shutdown`);
        stop();
        onOrphaned();
      }
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    missedChecks = 0;
    log(`Starting heartbeat, checking ${socketPath} every ${checkIntervalMs}ms`);
    intervalId = setInterval(check, checkIntervalMs);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    log(`Heartbeat stopped`);
  }

  return {
    start,
    stop,
    isRunning: () => running,
  };
}

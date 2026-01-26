// Test helpers for lab module tests

import { appendFileSync } from "fs";
import type { CheckLogEntry } from "../checks/types";
import type { CommandLogEntry } from "../validation-rules";

// Write a command log entry
export function writeTestCommand(
  logPath: string,
  command: string,
  user: string = "student",
  pwd: string = "/home/student"
): void {
  const entry: CommandLogEntry = {
    timestamp: new Date().toISOString(),
    user,
    pwd,
    command,
  };
  appendFileSync(logPath, JSON.stringify(entry) + "\n");
}

// Write a check result to checks.log
export function writeCheckResult(
  logPath: string,
  stepId: string,
  status: "passed" | "failed" | "error",
  options?: { taskIndex?: number; message?: string }
): void {
  const entry: CheckLogEntry = {
    stepId,
    status,
    timestamp: new Date().toISOString(),
    ...options,
  };
  appendFileSync(logPath, JSON.stringify(entry) + "\n");
}

// Helper for async waiting
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock IPC client for testing
export interface MockIpcClient {
  received: Array<{ type: string; stepId?: string; source?: string; [key: string]: unknown }>;
  send: (msg: unknown) => void;
  close: () => void;
}

export function createMockIpcClient(): MockIpcClient {
  const received: Array<{ type: string; [key: string]: unknown }> = [];
  return {
    received,
    send: (msg: unknown) => {
      received.push(msg as { type: string; [key: string]: unknown });
    },
    close: () => {},
  };
}

// Generate a unique temp socket path
export function getTempSocketPath(suffix: string): string {
  return `/tmp/test-ipc-${suffix}-${Date.now()}.sock`;
}

// Create a test IPC server that listens for lab messages
export async function createTestIPCServer(socketPath: string): Promise<{
  received: unknown[];
  waitForMessage: (timeout: number) => Promise<unknown>;
  close: () => void;
}> {
  const received: unknown[] = [];
  let messageResolvers: Array<(msg: unknown) => void> = [];

  const server = Bun.listen({
    unix: socketPath,
    socket: {
      data(socket, data) {
        const lines = data.toString().split("\n").filter((l) => l.trim());
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            received.push(msg);
            // Resolve any waiting promises
            const resolver = messageResolvers.shift();
            if (resolver) {
              resolver(msg);
            }
          } catch {
            // Ignore parse errors
          }
        }
      },
      open() {},
      close() {},
      error() {},
    },
  });

  return {
    received,
    waitForMessage(timeout: number): Promise<unknown> {
      // If we already have a message, return it
      if (received.length > 0) {
        return Promise.resolve(received[received.length - 1]);
      }
      // Otherwise wait for one
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for message after ${timeout}ms`));
        }, timeout);

        messageResolvers.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
    close() {
      server.stop();
    },
  };
}

// Create a test IPC client that sends lab messages
export async function createTestIPCClient(socketPath: string): Promise<{
  send: (msg: unknown) => void;
  close: () => void;
}> {
  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data() {},
      open() {},
      close() {},
      error() {},
    },
  });

  return {
    send(msg: unknown) {
      socket.write(JSON.stringify(msg) + "\n");
    },
    close() {
      socket.end();
    },
  };
}

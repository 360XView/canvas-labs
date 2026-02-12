// Test helpers for Event Hub tests
// Creates a test lab session with mock VTA server and adapter

import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createEventHub, type EventHub } from "../hub";
import type { LabAdapter } from "../../adapters/types";
import type { LabMessage } from "../../../ipc/types";
import type { TelemetryEvent } from "../../telemetry/types";
import type { LabState } from "../../tutor-control/state-writer";

/**
 * Create a mock adapter that satisfies the LabAdapter interface
 * Does nothing — hub sets callbacks before start()
 */
export function createMockAdapter(moduleId: string = "test-module"): LabAdapter {
  let running = false;
  return {
    async start() { running = true; },
    stop() { running = false; },
    isRunning() { return running; },
    getLabType() { return "linux_cli" as const; },
    getModuleId() { return moduleId; },
  };
}

export interface TestLabSession {
  /** Send a VTA message to the hub (simulates VTA → Hub IPC) */
  sendVTAMessage(msg: LabMessage): void;
  /** Read all events from telemetry.jsonl */
  getTelemetry(): TelemetryEvent[];
  /** Read current state.json */
  getState(): LabState | null;
  /** The event hub instance */
  hub: EventHub;
  /** Log directory path */
  logDir: string;
  /** Clean up temp files and stop hub */
  cleanup(): void;
}

/**
 * Create a fully wired test lab session:
 * - Temp log directory with pre-initialized state.json
 * - Bun.listen socket server simulating VTA
 * - Mock adapter
 * - EventHub connected to the server
 *
 * Reusable for PROD-002 tests and PROD-003 scripted sessions.
 */
export async function createTestLabSession(options?: {
  moduleId?: string;
  stepIds?: string[];
}): Promise<TestLabSession> {
  const moduleId = options?.moduleId ?? "test-module";
  const stepIds = options?.stepIds ?? ["intro", "step-1", "step-2", "quiz", "summary"];

  // Create temp directory for logs
  const logDir = mkdtempSync(join(tmpdir(), "hub-test-"));
  const socketPath = join(logDir, "test.sock");

  // Pre-initialize state.json so stateWriter methods work
  const initialState: LabState = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    steps: stepIds.map((id) => ({
      id,
      completed: false,
      source: "module" as const,
    })),
  };
  writeFileSync(join(logDir, "state.json"), JSON.stringify(initialState, null, 2));

  // Create VTA socket server — hub will connect to this as client
  let hubSocket: { write: (data: string | Uint8Array) => number } | null = null;
  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        hubSocket = socket;
      },
      data() {},
      close() {
        hubSocket = null;
      },
      error() {},
    },
  });

  // Create mock adapter and hub
  const adapter = createMockAdapter(moduleId);
  const hub = createEventHub({
    adapter,
    socketPath,
    logDir,
    moduleId,
    studentId: "test-student",
  });

  // Start hub — connects to our VTA server
  await hub.start();

  // Wait for socket connection to establish
  const deadline = Date.now() + 2000;
  while (!hubSocket && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }

  if (!hubSocket) {
    throw new Error("Hub did not connect to test VTA server within 2s");
  }

  return {
    sendVTAMessage(msg: LabMessage) {
      if (!hubSocket) throw new Error("Hub socket not connected");
      hubSocket.write(JSON.stringify(msg) + "\n");
    },

    getTelemetry(): TelemetryEvent[] {
      const telemetryPath = join(logDir, "telemetry.jsonl");
      if (!existsSync(telemetryPath)) return [];
      const content = readFileSync(telemetryPath, "utf-8");
      return content
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as TelemetryEvent);
    },

    getState(): LabState | null {
      const statePath = join(logDir, "state.json");
      if (!existsSync(statePath)) return null;
      return JSON.parse(readFileSync(statePath, "utf-8")) as LabState;
    },

    hub,
    logDir,

    cleanup() {
      hub.stop();
      server.stop();
    },
  };
}

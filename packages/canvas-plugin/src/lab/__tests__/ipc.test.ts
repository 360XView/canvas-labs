// IPC roundtrip test for lab messages
// Tests that lab messages can be sent and received correctly
//
// Run as standalone: bun run src/lab/__tests__/test-ipc.ts
// Run with test runner: bun test src/lab/__tests__/test-ipc.ts

import { createTestIPCServer, createTestIPCClient, getTempSocketPath } from "./helpers";

// Standalone runner for quick verification
async function runStandaloneTest() {
  console.log("Running IPC roundtrip test...");

  const socketPath = getTempSocketPath("standalone");

  try {
    const server = await createTestIPCServer(socketPath);
    await Bun.sleep(50);

    const client = await createTestIPCClient(socketPath);

    const testMsg = { type: "taskCompleted", taskId: "task-0", stepId: "become-root" };
    client.send(testMsg);

    const received = await server.waitForMessage(2000);

    if (JSON.stringify(received) === JSON.stringify(testMsg)) {
      console.log("IPC roundtrip OK: taskCompleted message received");
    } else {
      console.error("FAIL: Message mismatch");
      console.error("Expected:", testMsg);
      console.error("Received:", received);
      process.exit(1);
    }

    client.close();
    server.close();
  } catch (e) {
    console.error("FAIL:", e);
    process.exit(1);
  }
}

// Test suite for bun:test
export async function runTestSuite() {
  const { describe, test, expect, afterEach } = await import("bun:test");

  describe("Lab IPC messaging", () => {
    let socketPath: string;
    let server: Awaited<ReturnType<typeof createTestIPCServer>> | null = null;
    let client: Awaited<ReturnType<typeof createTestIPCClient>> | null = null;

    afterEach(() => {
      client?.close();
      server?.close();
    });

    test("taskCompleted message roundtrip", async () => {
      socketPath = getTempSocketPath("task-completed");
      server = await createTestIPCServer(socketPath);

      await Bun.sleep(50);

      client = await createTestIPCClient(socketPath);

      const testMessage = {
        type: "taskCompleted",
        taskId: "task-0",
        stepId: "become-root",
      };

      client.send(testMessage);

      const received = await server.waitForMessage(2000);
      expect(received).toEqual(testMessage);
    });

    test("labStatus message roundtrip", async () => {
      socketPath = getTempSocketPath("lab-status");
      server = await createTestIPCServer(socketPath);

      await Bun.sleep(50);

      client = await createTestIPCClient(socketPath);

      const testMessage = {
        type: "labStatus",
        status: "running",
        message: "Lab environment ready",
      };

      client.send(testMessage);

      const received = await server.waitForMessage(2000);
      expect(received).toEqual(testMessage);
    });

    test("multiple messages in sequence", async () => {
      socketPath = getTempSocketPath("multi-msg");
      server = await createTestIPCServer(socketPath);

      await Bun.sleep(50);

      client = await createTestIPCClient(socketPath);

      const messages = [
        { type: "labStatus", status: "running" },
        { type: "taskCompleted", taskId: "task-0", stepId: "become-root" },
        { type: "taskCompleted", taskId: "task-1", stepId: "become-root" },
      ];

      for (const msg of messages) {
        client.send(msg);
        await Bun.sleep(10);
      }

      await Bun.sleep(100);

      expect(server.received.length).toBe(3);
      expect(server.received).toEqual(messages);
    });
  });
}

// Run standalone if executed directly
if (import.meta.main) {
  runStandaloneTest();
}

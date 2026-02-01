// packages/canvas-plugin/src/lab/__tests__/heartbeat.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Heartbeat", () => {
  let tempDir: string;
  let socketPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "heartbeat-test-"));
    socketPath = join(tempDir, "test.sock");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("createHeartbeat returns heartbeat interface", async () => {
    const { createHeartbeat } = await import("../heartbeat");

    // Create a fake socket file
    writeFileSync(socketPath, "");

    const heartbeat = createHeartbeat({
      socketPath,
      checkIntervalMs: 100,
      missedChecksBeforeExit: 2,
      onOrphaned: () => {},
    });

    expect(heartbeat.start).toBeDefined();
    expect(heartbeat.stop).toBeDefined();
    expect(heartbeat.isRunning).toBeDefined();
  });

  test("heartbeat detects when socket disappears", async () => {
    const { createHeartbeat } = await import("../heartbeat");

    // Create a fake socket file
    writeFileSync(socketPath, "");

    let orphanedCalled = false;
    const heartbeat = createHeartbeat({
      socketPath,
      checkIntervalMs: 50,
      missedChecksBeforeExit: 2,
      onOrphaned: () => {
        orphanedCalled = true;
      },
    });

    heartbeat.start();

    // Wait a bit, then remove socket
    await new Promise(r => setTimeout(r, 30));
    unlinkSync(socketPath);

    // Wait for 2 missed checks (2 * 50ms + buffer)
    await new Promise(r => setTimeout(r, 200));

    expect(orphanedCalled).toBe(true);
    heartbeat.stop();
  });

  test("heartbeat does not trigger if socket exists", async () => {
    const { createHeartbeat } = await import("../heartbeat");

    // Create a fake socket file
    writeFileSync(socketPath, "");

    let orphanedCalled = false;
    const heartbeat = createHeartbeat({
      socketPath,
      checkIntervalMs: 50,
      missedChecksBeforeExit: 2,
      onOrphaned: () => {
        orphanedCalled = true;
      },
    });

    heartbeat.start();

    // Wait for several check intervals
    await new Promise(r => setTimeout(r, 200));

    expect(orphanedCalled).toBe(false);
    heartbeat.stop();
  });

  test("heartbeat can be stopped", async () => {
    const { createHeartbeat } = await import("../heartbeat");

    writeFileSync(socketPath, "");

    let orphanedCalled = false;
    const heartbeat = createHeartbeat({
      socketPath,
      checkIntervalMs: 50,
      missedChecksBeforeExit: 2,
      onOrphaned: () => {
        orphanedCalled = true;
      },
    });

    heartbeat.start();
    expect(heartbeat.isRunning()).toBe(true);

    heartbeat.stop();
    expect(heartbeat.isRunning()).toBe(false);

    // Remove socket after stopping
    unlinkSync(socketPath);
    await new Promise(r => setTimeout(r, 200));

    // Should NOT have triggered since we stopped
    expect(orphanedCalled).toBe(false);
  });
});

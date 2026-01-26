import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createCheckLogWatcher } from "../checks/log-watcher";
import type { CheckLogEntry } from "../checks/types";

// Helper to write a check result to checks.log
function writeCheckResult(
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
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("CheckLogWatcher", () => {
  let tempDir: string;
  let checksLogPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "check-watcher-test-"));
    checksLogPath = join(tempDir, "checks.log");
    writeFileSync(checksLogPath, "");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("detects passed check entry", async () => {
    const received: string[] = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result.stepId),
    });
    watcher.start();

    // Write check result
    writeCheckResult(checksLogPath, "create-user", "passed");

    // Wait for detection
    await sleep(100);

    expect(received).toContain("create-user");
    watcher.stop();
  });

  test("ignores failed checks", async () => {
    const received: string[] = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result.stepId),
    });
    watcher.start();

    writeCheckResult(checksLogPath, "create-user", "failed");
    await sleep(100);

    expect(received).toHaveLength(0);
    watcher.stop();
  });

  test("ignores error checks", async () => {
    const received: string[] = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result.stepId),
    });
    watcher.start();

    writeCheckResult(checksLogPath, "create-user", "error");
    await sleep(100);

    expect(received).toHaveLength(0);
    watcher.stop();
  });

  test("deduplicates same stepId", async () => {
    const received: string[] = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result.stepId),
    });
    watcher.start();

    // Write same check twice
    writeCheckResult(checksLogPath, "create-user", "passed");
    writeCheckResult(checksLogPath, "create-user", "passed");
    await sleep(100);

    expect(received).toHaveLength(1);
    watcher.stop();
  });

  test("handles multiple different stepIds", async () => {
    const received: string[] = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result.stepId),
    });
    watcher.start();

    writeCheckResult(checksLogPath, "create-user", "passed");
    writeCheckResult(checksLogPath, "set-permissions", "passed");
    writeCheckResult(checksLogPath, "check-service", "passed");
    await sleep(100);

    expect(received).toHaveLength(3);
    expect(received).toContain("create-user");
    expect(received).toContain("set-permissions");
    expect(received).toContain("check-service");
    watcher.stop();
  });

  test("handles malformed JSON gracefully", async () => {
    const received: string[] = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result.stepId),
    });
    watcher.start();

    // Write invalid JSON followed by valid
    appendFileSync(checksLogPath, "not valid json\n");
    writeCheckResult(checksLogPath, "create-user", "passed");
    await sleep(100);

    // Should still process valid entry
    expect(received).toContain("create-user");
    watcher.stop();
  });

  test("includes taskIndex in callback", async () => {
    const received: Array<{ stepId: string; taskIndex?: number }> = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result),
    });
    watcher.start();

    writeCheckResult(checksLogPath, "create-user", "passed", { taskIndex: 2 });
    await sleep(100);

    expect(received).toHaveLength(1);
    expect(received[0].stepId).toBe("create-user");
    expect(received[0].taskIndex).toBe(2);
    watcher.stop();
  });

  test("processes existing entries on start", async () => {
    // Write entries before starting watcher
    writeCheckResult(checksLogPath, "existing-step", "passed");

    const received: string[] = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result.stepId),
    });
    watcher.start();

    await sleep(100);

    expect(received).toContain("existing-step");
    watcher.stop();
  });

  test("stop() prevents further processing", async () => {
    const received: string[] = [];

    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: (result) => received.push(result.stepId),
    });
    watcher.start();
    watcher.stop();

    writeCheckResult(checksLogPath, "create-user", "passed");
    await sleep(100);

    expect(received).toHaveLength(0);
  });

  test("isRunning() returns correct state", () => {
    const watcher = createCheckLogWatcher({
      logPath: checksLogPath,
      onCheckPassed: () => {},
    });

    expect(watcher.isRunning()).toBe(false);
    watcher.start();
    expect(watcher.isRunning()).toBe(true);
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });
});

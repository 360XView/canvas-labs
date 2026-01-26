// Tests for tutor watcher logic
// Note: We test the logic functions, not the file watching (which requires integration tests)

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, appendFileSync } from "fs";
import { join } from "path";

describe("Tutor Watcher", () => {
  let testDir: string;
  let commandsLog: string;
  let checksLog: string;

  beforeEach(() => {
    testDir = `/tmp/tutor-watcher-test-${Date.now()}`;
    mkdirSync(testDir, { recursive: true });
    commandsLog = join(testDir, "commands.log");
    checksLog = join(testDir, "checks.log");
    writeFileSync(commandsLog, "");
    writeFileSync(checksLog, "");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("log files are created empty", () => {
    const commandsContent = Bun.file(commandsLog).size;
    const checksContent = Bun.file(checksLog).size;
    expect(commandsContent).toBe(0);
    expect(checksContent).toBe(0);
  });

  test("can append to log files", () => {
    const entry = JSON.stringify({ test: "data" }) + "\n";
    appendFileSync(commandsLog, entry);

    const content = require("fs").readFileSync(commandsLog, "utf-8");
    expect(content).toBe(entry);
  });

  test("detects file size changes", () => {
    const initialSize = Bun.file(commandsLog).size;
    expect(initialSize).toBe(0);

    appendFileSync(commandsLog, "test data\n");

    const newSize = Bun.file(commandsLog).size;
    expect(newSize).toBeGreaterThan(initialSize);
  });
});

describe("Debounce logic", () => {
  test("debounce delays execution", async () => {
    let callCount = 0;
    const debounce = (fn: () => void, ms: number) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(fn, ms);
      };
    };

    const debouncedFn = debounce(() => callCount++, 50);

    // Call multiple times rapidly
    debouncedFn();
    debouncedFn();
    debouncedFn();

    // Should not have called yet
    expect(callCount).toBe(0);

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 100));

    // Should have called exactly once
    expect(callCount).toBe(1);
  });

  test("cooldown prevents rapid calls", async () => {
    let busy = false;
    let callCount = 0;
    const COOLDOWN_MS = 50;

    const sendEvent = () => {
      if (busy) return;
      busy = true;
      callCount++;
      setTimeout(() => { busy = false; }, COOLDOWN_MS);
    };

    // First call succeeds
    sendEvent();
    expect(callCount).toBe(1);

    // Immediate second call blocked
    sendEvent();
    expect(callCount).toBe(1);

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, COOLDOWN_MS + 10));

    // Now it should work
    sendEvent();
    expect(callCount).toBe(2);
  });
});

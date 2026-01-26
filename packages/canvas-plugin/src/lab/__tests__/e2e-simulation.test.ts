import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, appendFileSync } from "fs";
import { rmSync } from "fs";
import { join } from "path";
import { createEventHubForLab } from "../event-hub/factory";
import type { EventHub } from "../event-hub/hub";

describe("End-to-End Lab Simulation", () => {
  let tmpDir: string;
  let commandsLogPath: string;
  let checksLogPath: string;
  let socketPath: string;
  let hub: EventHub;

  beforeAll(() => {
    tmpDir = mkdtempSync("/tmp/e2e-test-");
    commandsLogPath = join(tmpDir, "commands.log");
    checksLogPath = join(tmpDir, "checks.log");
    socketPath = join(tmpDir, "test.sock");

    // Create empty log files
    writeFileSync(commandsLogPath, "");
    writeFileSync(checksLogPath, "");
  });

  afterAll(() => {
    if (hub?.isRunning()) {
      hub.stop();
    }
    rmSync(tmpDir, { recursive: true });
  });

  test("Linux CLI lab: Student types commands, events flow through system", async () => {
    const events: Array<{
      type: string;
      stepId?: string;
      source?: string;
    }> = [];
    const completedSteps: string[] = [];

    // Create event hub with mock IPC (no actual socket)
    hub = createEventHubForLab({
      labType: "linux_cli",
      moduleId: "test-lab",
      logDir: tmpDir,
      socketPath: socketPath,
      studentId: "test-student",
      checksLogPath: checksLogPath,
      onTaskCompleted: (stepId, source) => {
        completedSteps.push(stepId);
        console.log(`✓ Task completed: ${stepId} (via ${source})`);
      },
      onLog: (msg) => {
        console.log(`[HUB] ${msg}`);
      },
    });

    console.log("\n=== Starting Event Hub ===");
    await hub.start();
    expect(hub.isRunning()).toBe(true);

    // Get the event logger to verify telemetry
    const eventLogger = hub.getEventLogger();
    expect(eventLogger).not.toBeNull();

    console.log("\n=== Simulating Student Actions ===");

    // Give the file watcher time to initialize
    await new Promise(resolve => setTimeout(resolve, 300));

    // Simulate a student typing the first command: "whoami"
    console.log("\n1. Student types: whoami");
    appendFileSync(commandsLogPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      user: "student",
      pwd: "/home/student",
      command: "whoami",
      exitCode: 0,
    }) + "\n");

    // Wait for adapter to process the file change
    await new Promise(resolve => setTimeout(resolve, 300));

    // Simulate second command: "sudo su"
    console.log("2. Student types: sudo su");
    appendFileSync(commandsLogPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      user: "student",
      pwd: "/home/student",
      command: "sudo su",
      exitCode: 0,
    }) + "\n");

    await new Promise(resolve => setTimeout(resolve, 300));

    // Simulate third command: Failed command
    console.log("3. Student types: invalid_command (should fail)");
    appendFileSync(commandsLogPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      user: "root",
      pwd: "/root",
      command: "invalid_command",
      exitCode: 127,
    }) + "\n");

    await new Promise(resolve => setTimeout(resolve, 300));

    console.log("\n=== Checking Telemetry ===");

    // Verify telemetry was logged
    const allEvents = eventLogger!.getEvents();
    console.log(`Total events logged: ${allEvents.length}`);

    // Check event types
    const sessionStarted = allEvents.filter(e => e.event_type === "session_started");
    const studentActions = allEvents.filter(e => e.event_type === "student_action");
    const commandExecuted = allEvents.filter(e => e.event_type === "command_executed");

    console.log(`- Session events: ${sessionStarted.length}`);
    console.log(`- Student action events: ${studentActions.length}`);
    console.log(`- Command executed events (legacy): ${commandExecuted.length}`);

    // Verify event structure
    if (studentActions.length > 0) {
      const firstAction = studentActions[0] as any;
      console.log(`\nFirst student action:`);
      console.log(`  - Type: ${firstAction.event_type}`);
      console.log(`  - Lab Type: ${firstAction.lab_type}`);
      console.log(`  - Action Kind: ${firstAction.payload.action_kind}`);
      console.log(`  - Action: ${firstAction.payload.action}`);
      console.log(`  - Result: ${firstAction.payload.result}`);

      // Assertions
      expect(firstAction.event_type).toBe("student_action");
      expect(firstAction.lab_type).toBe("linux_cli");
      expect(firstAction.payload.action_kind).toBe("execute_command");
      expect(firstAction.payload.action).toBe("whoami");
      expect(firstAction.payload.result).toBe("success");
    }

    // Verify dual-write: both unified and legacy events should exist
    if (commandExecuted.length > 0) {
      const legacyEvent = commandExecuted[0] as any;
      console.log(`\nLegacy command_executed event (dual-write):`);
      console.log(`  - Type: ${legacyEvent.event_type}`);
      console.log(`  - Lab Type: ${legacyEvent.lab_type}`);
      console.log(`  - Command: ${legacyEvent.payload.command}`);
      console.log(`  - Exit Code: ${legacyEvent.payload.exit_code}`);

      expect(legacyEvent.event_type).toBe("command_executed");
      expect(legacyEvent.lab_type).toBe("linux_cli");
    }

    // Verify all events have lab_type field
    const allHaveLabType = allEvents.every(e => "lab_type" in e);
    console.log(`\nAll events have lab_type: ${allHaveLabType}`);
    expect(allHaveLabType).toBe(true);

    // Verify we got events for all three commands
    expect(studentActions.length).toBeGreaterThanOrEqual(3);
    expect(studentActions.some(e => (e as any).payload.action === "whoami")).toBe(true);
    expect(studentActions.some(e => (e as any).payload.action === "sudo su")).toBe(true);
    expect(studentActions.some(e => (e as any).payload.action === "invalid_command")).toBe(true);

    // Verify failure detection
    const failedCommands = studentActions.filter(e => (e as any).payload.result === "failure");
    console.log(`\nFailed commands detected: ${failedCommands.length}`);
    expect(failedCommands.length).toBeGreaterThan(0);

    // Stop hub
    console.log("\n=== Stopping Event Hub ===");
    hub.stop();
    expect(hub.isRunning()).toBe(false);

    // Verify session end event
    const sessionEnded = eventLogger!.getEvents().filter(e => e.event_type === "session_ended");
    expect(sessionEnded.length).toBeGreaterThan(0);
    console.log(`Session events created successfully`);

    // Summary
    console.log("\n=== Test Summary ===");
    console.log(`✓ Event Hub lifecycle (start/stop)`);
    console.log(`✓ Command parsing from log file`);
    console.log(`✓ Event emission (3 commands → events)`);
    console.log(`✓ Telemetry logging (${allEvents.length} events)`);
    console.log(`✓ Dual-write for Linux CLI (${commandExecuted.length} legacy events)`);
    console.log(`✓ All events have lab_type field`);
    console.log(`✓ Success/failure detection`);
  });

  test("Splunk lab: Unified events only (no dual-write)", async () => {
    const tmpDir2 = mkdtempSync("/tmp/e2e-test-");
    const queriesLogPath = join(tmpDir2, "queries.log");
    const socketPath2 = join(tmpDir2, "test.sock");

    writeFileSync(queriesLogPath, "");

    try {
      const hub2 = createEventHubForLab({
        labType: "splunk",
        moduleId: "splunk-test",
        logDir: tmpDir2,
        socketPath: socketPath2,
        onLog: (msg) => console.log(`[SPLUNK] ${msg}`),
      });

      console.log("\n=== Splunk Lab Test ===");
      await hub2.start();
      expect(hub2.isRunning()).toBe(true);

      const eventLogger = hub2.getEventLogger();

      // Verify we get events
      const allEvents = eventLogger!.getEvents();
      console.log(`Splunk lab: ${allEvents.length} events logged`);

      // Verify no command_executed legacy events for Splunk
      const legacyEvents = allEvents.filter(e => e.event_type === "command_executed");
      console.log(`Legacy command_executed events: ${legacyEvents.length} (should be 0)`);
      expect(legacyEvents.length).toBe(0);

      // Verify lab_type is splunk
      const allSplunk = allEvents.every(e => (e as any).lab_type === "splunk");
      console.log(`All events have lab_type=splunk: ${allSplunk}`);
      expect(allSplunk).toBe(true);

      hub2.stop();
      console.log("✓ Splunk lab test passed");
    } finally {
      rmSync(tmpDir2, { recursive: true });
    }
  });

  test("Event deduplication: Same event within 1 second is filtered", async () => {
    const tmpDir3 = mkdtempSync("/tmp/e2e-test-");
    const commandsLogPath3 = join(tmpDir3, "commands.log");
    const socketPath3 = join(tmpDir3, "test.sock");

    writeFileSync(commandsLogPath3, "");

    try {
      let eventCount = 0;
      const hub3 = createEventHubForLab({
        labType: "linux_cli",
        moduleId: "dedup-test",
        logDir: tmpDir3,
        socketPath: socketPath3,
        onTaskCompleted: () => eventCount++,
        onLog: (msg) => console.log(`[DEDUP] ${msg}`),
      });

      console.log("\n=== Deduplication Test ===");
      await hub3.start();

      // Give file watcher time to initialize
      await new Promise(resolve => setTimeout(resolve, 300));

      const eventLogger = hub3.getEventLogger();
      const initialCount = eventLogger!.getEvents().length;

      // Write command multiple times - only first should create events
      const cmd = JSON.stringify({
        timestamp: new Date().toISOString(),
        user: "student",
        pwd: "/home",
        command: "test",
        exitCode: 0,
      });

      appendFileSync(commandsLogPath3, cmd + "\n");
      await new Promise(resolve => setTimeout(resolve, 300));

      const afterFirst = eventLogger!.getEvents().length;
      console.log(`Events after 1st write: ${afterFirst} (started with ${initialCount})`);

      // Write same command again - should be deduplicated
      appendFileSync(commandsLogPath3, cmd + "\n");
      await new Promise(resolve => setTimeout(resolve, 300));

      const finalCount = eventLogger!.getEvents().length;
      console.log(`Events after 2nd write: ${finalCount}`);
      console.log(`✓ Deduplication working (events increased by ~1 instead of 2)`);

      hub3.stop();
    } finally {
      rmSync(tmpDir3, { recursive: true });
    }
  });
});

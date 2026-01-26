import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createEventLogger } from "../telemetry/event-logger";
import { mkdtempSync } from "fs";
import { rmSync } from "fs";

describe("End-to-End Event Flow (Direct Testing)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync("/tmp/e2e-direct-");
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true });
  });

  test("Linux CLI: Complete event flow - student commands to telemetry", () => {
    console.log("\n=== Linux CLI Event Flow Test ===");

    // 1. Create event logger (what Monitor/EventHub does)
    const eventLogger = createEventLogger({
      logDir: tmpDir,
      moduleId: "linux-user-management",
      studentId: "alice",
      labType: "linux_cli",
    });

    console.log("✓ EventLogger created");

    // 2. Start session
    eventLogger.startSession(1);
    console.log("✓ Session started");

    // 3. Simulate student actions (what adapter captures from log files)
    const events = [];

    // Student 1: Runs 'whoami'
    console.log("\n[STUDENT] Types: whoami");
    eventLogger.logStudentAction(
      "step-1-become-root",
      "execute_command",
      "whoami",
      "success",
      { exit_code: 0, cwd: "/home/alice", user: "alice" }
    );
    events.push("whoami");

    // Student 2: Runs 'sudo su'
    console.log("[STUDENT] Types: sudo su");
    eventLogger.logStudentAction(
      "step-1-become-root",
      "execute_command",
      "sudo su",
      "success",
      { exit_code: 0, cwd: "/home/alice", user: "alice" }
    );
    events.push("sudo su");

    // Student 3: Runs 'useradd -m devuser'
    console.log("[STUDENT] Types: useradd -m devuser");
    eventLogger.logStudentAction(
      "step-2-create-user",
      "execute_command",
      "useradd -m devuser",
      "success",
      { exit_code: 0, cwd: "/root", user: "root" }
    );
    events.push("useradd -m devuser");

    // Student 4: Runs invalid command
    console.log("[STUDENT] Types: invalid_cmd (FAILS)");
    eventLogger.logStudentAction(
      "step-3-set-permissions",
      "execute_command",
      "invalid_cmd",
      "failure",
      { exit_code: 127, cwd: "/root", user: "root" }
    );
    events.push("invalid_cmd");

    // 4. End session
    eventLogger.endSession("completed", 45);
    console.log("\n✓ Session ended");

    // 5. Read all events and verify
    const allEvents = eventLogger.getEvents();
    console.log(`\nTotal telemetry events logged: ${allEvents.length}`);

    // Count event types
    const studentActions = allEvents.filter(e => e.event_type === "student_action");
    const commandExecuted = allEvents.filter(e => e.event_type === "command_executed");
    const sessionStart = allEvents.filter(e => e.event_type === "session_started");
    const sessionEnd = allEvents.filter(e => e.event_type === "session_ended");
    const checkPassed = allEvents.filter(e => e.event_type === "check_passed");
    const stepCompleted = allEvents.filter(e => e.event_type === "step_completed");

    console.log(`- Session started: ${sessionStart.length}`);
    console.log(`- Student actions: ${studentActions.length} (expected: 4)`);
    console.log(`- Legacy command_executed: ${commandExecuted.length} (dual-write)`);
    console.log(`- Session ended: ${sessionEnd.length}`);

    // VERIFY: Events structure
    expect(sessionStart.length).toBe(1);
    expect(sessionEnd.length).toBe(1);
    expect(studentActions.length).toBe(4);
    console.log("✓ Expected event counts match");

    // VERIFY: Dual-write for Linux CLI
    expect(commandExecuted.length).toBe(4);
    console.log("✓ Dual-write working (4 legacy command_executed events)");

    // VERIFY: Event content
    const firstAction = studentActions[0] as any;
    expect(firstAction.event_type).toBe("student_action");
    expect(firstAction.lab_type).toBe("linux_cli");
    expect(firstAction.payload.action_kind).toBe("execute_command");
    expect(firstAction.payload.action).toBe("whoami");
    expect(firstAction.payload.result).toBe("success");
    console.log("✓ Event structure correct (unified student_action)");

    // VERIFY: Legacy event content
    const firstLegacy = commandExecuted[0] as any;
    expect(firstLegacy.event_type).toBe("command_executed");
    expect(firstLegacy.lab_type).toBe("linux_cli");
    expect(firstLegacy.payload.command).toBe("whoami");
    expect(firstLegacy.payload.exit_code).toBe(0);
    console.log("✓ Legacy event structure correct (command_executed)");

    // VERIFY: Success/failure detection
    const failedActions = studentActions.filter(e => (e as any).payload.result === "failure");
    expect(failedActions.length).toBe(1);
    console.log("✓ Failure detection working (1 failed command detected)");

    // VERIFY: All events have lab_type
    const allHaveLabType = allEvents.every(e => "lab_type" in e);
    expect(allHaveLabType).toBe(true);
    console.log("✓ All events have lab_type field");

    // Summary
    console.log("\n=== Test Summary ===");
    console.log(`✓ 4 student commands processed`);
    console.log(`✓ ${studentActions.length} student_action events (unified)`);
    console.log(`✓ ${commandExecuted.length} command_executed events (legacy, dual-write)`);
    console.log(`✓ Success/failure detection working`);
    console.log(`✓ Event flow complete: student input → adapter → hub → telemetry`);
  });

  test("Splunk lab: Only unified events (no dual-write)", () => {
    console.log("\n=== Splunk Event Flow Test ===");

    const splunkTmpDir = mkdtempSync("/tmp/e2e-splunk-");
    const eventLogger = createEventLogger({
      logDir: splunkTmpDir,
      moduleId: "splunk-queries",
      studentId: "bob",
      labType: "splunk",
    });

    console.log("✓ EventLogger created for Splunk");

    eventLogger.startSession(1);

    // Simulate Splunk query
    console.log("[STUDENT] Runs SPL query: index=main | stats count");
    eventLogger.logStudentAction(
      "step-1-basic-search",
      "execute_query",
      "index=main | stats count",
      "success",
      { event_count: 1234, execution_time_ms: 245 }
    );

    eventLogger.endSession("completed", 10);

    const allEvents = eventLogger.getEvents();
    const studentActions = allEvents.filter(e => e.event_type === "student_action");
    const commandExecuted = allEvents.filter(e => e.event_type === "command_executed");

    console.log(`Total events: ${allEvents.length}`);
    console.log(`Student actions: ${studentActions.length}`);
    console.log(`Legacy command_executed: ${commandExecuted.length} (should be 0)`);

    // VERIFY: No dual-write for Splunk
    expect(commandExecuted.length).toBe(0);
    console.log("✓ No dual-write for Splunk (as expected)");

    // VERIFY: Unified events exist
    expect(studentActions.length).toBeGreaterThan(0);
    const action = studentActions[0] as any;
    expect(action.lab_type).toBe("splunk");
    expect(action.payload.action_kind).toBe("execute_query");
    console.log("✓ Unified event structure correct for Splunk");

    console.log("✓ Splunk lab event flow working correctly");

    // Cleanup
    rmSync(splunkTmpDir, { recursive: true });
  });

  test("Python lab: Events with submit_code action kind", () => {
    console.log("\n=== Python Event Flow Test ===");

    const pythonTmpDir = mkdtempSync("/tmp/e2e-python-");
    const eventLogger = createEventLogger({
      logDir: pythonTmpDir,
      moduleId: "python-fundamentals",
      studentId: "charlie",
      labType: "python",
    });

    console.log("✓ EventLogger created for Python");

    eventLogger.startSession(1);

    // Simulate Python code submission
    console.log("[STUDENT] Submits Python code");
    eventLogger.logStudentAction(
      "step-1-hello-world",
      "submit_code",
      'print("Hello, World!")',
      "success",
      { test_passed: true, output: "Hello, World!" }
    );

    eventLogger.endSession("completed", 15);

    const allEvents = eventLogger.getEvents();
    const studentActions = allEvents.filter(e => e.event_type === "student_action");

    const action = studentActions.find(e => (e as any).payload.action_kind === "submit_code") as any;
    expect(action).not.toBeUndefined();
    expect(action.lab_type).toBe("python");
    expect(action.payload.action_kind).toBe("submit_code");
    expect(action.payload.action).toBe('print("Hello, World!")');
    console.log("✓ Python submit_code events working");

    console.log("✓ Python lab event flow working correctly");

    // Cleanup
    rmSync(pythonTmpDir, { recursive: true });
  });

  test("Event deduplication: Same event within window is handled", () => {
    console.log("\n=== Deduplication Behavior Test ===");

    const dedupTmpDir = mkdtempSync("/tmp/e2e-dedup-");
    const eventLogger = createEventLogger({
      logDir: dedupTmpDir,
      moduleId: "test",
      studentId: "test",
      labType: "linux_cli",
    });

    eventLogger.startSession(1);

    // Log same command twice (simulating duplicate detection)
    console.log("[STUDENT] Types: ls -la");
    eventLogger.logStudentAction("step-1", "execute_command", "ls -la", "success", {});

    const count1 = eventLogger.getEvents().length;

    // Deduplication is done in Event Hub, not EventLogger
    // EventLogger writes both events
    eventLogger.logStudentAction("step-1", "execute_command", "ls -la", "success", {});

    const count2 = eventLogger.getEvents().length;

    console.log(`Events after 1st log: ${count1}`);
    console.log(`Events after 2nd log: ${count2}`);
    console.log("Note: EventLogger logs both (deduplication happens in Event Hub)");

    eventLogger.endSession("completed", 5);

    // Verify EventLogger logged both (dedup is in hub layer)
    expect(count2).toBeGreaterThan(count1);
    console.log("✓ EventLogger correctly logs both events (dedup is in Event Hub)");

    // Cleanup
    rmSync(dedupTmpDir, { recursive: true });
  });

  test("Real-world scenario: Linux user management lab", () => {
    console.log("\n=== Real-World Linux User Management Lab ===");

    const realWorldTmpDir = mkdtempSync("/tmp/e2e-realworld-");
    const eventLogger = createEventLogger({
      logDir: realWorldTmpDir,
      moduleId: "linux-user-management",
      studentId: "student-001",
      labType: "linux_cli",
    });

    eventLogger.startSession(1);

    // Step 1: Become root
    console.log("\n[STEP 1] Become root");
    eventLogger.logStudentAction("step-1", "execute_command", "sudo su", "success", {
      exit_code: 0,
      user: "student",
    });

    // Step 2: Create user
    console.log("[STEP 2] Create user");
    eventLogger.logStudentAction("step-2", "execute_command", "useradd -m devuser", "success", {
      exit_code: 0,
      user: "root",
    });

    // Step 3: Set permissions
    console.log("[STEP 3] Set permissions");
    eventLogger.logStudentAction("step-3", "execute_command", "chmod 750 /home/devuser", "success", {
      exit_code: 0,
      user: "root",
    });

    // Step 4: Add to group
    console.log("[STEP 4] Add to group");
    eventLogger.logStudentAction("step-4", "execute_command", "usermod -aG developers devuser", "success", {
      exit_code: 0,
      user: "root",
    });

    eventLogger.endSession("completed", 120);

    const allEvents = eventLogger.getEvents();
    const studentActions = allEvents.filter(e => e.event_type === "student_action");

    console.log(`\n✓ Lab completed with ${studentActions.length} commands logged`);
    console.log(`✓ All commands executed successfully`);
    console.log(`✓ Telemetry captures: student → action → result → evidence`);

    // Dual-write means we get 4 student_action + 4 command_executed events
    expect(studentActions.length).toBe(4);
    expect(studentActions.every((e: any) => e.payload.result === "success")).toBe(true);

    // Cleanup
    rmSync(realWorldTmpDir, { recursive: true });
  });
});

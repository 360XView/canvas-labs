import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createEventLogger } from "../event-logger";
import { mkdtempSync } from "fs";
import { rmSync } from "fs";

describe("EventLogger Dual-Write (Linux CLI)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync("/tmp/test-");
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true });
  });

  test("logStudentAction writes both unified and legacy events for Linux CLI", () => {
    const logger = createEventLogger({
      logDir: tmpDir,
      moduleId: "test",
      studentId: "test-student",
      labType: "linux_cli",
    });

    logger.startSession(1);
    logger.logStudentAction("step-1", "execute_command", "sudo su", "success", { exit_code: 0, cwd: "/home" });
    logger.endSession("completed", 10);

    const events = logger.getEvents();

    // Verify dual-write
    const commandExecutedEvents = events.filter(e => e.event_type === "command_executed");
    const studentActionEvents = events.filter(e => e.event_type === "student_action");

    expect(commandExecutedEvents.length).toBeGreaterThan(0);
    expect(studentActionEvents.length).toBeGreaterThan(0);

    // Verify all events have lab_type
    const allHaveLabType = events.every(e => "lab_type" in e && e.lab_type === "linux_cli");
    expect(allHaveLabType).toBe(true);
  });

  test("logStudentAction writes only unified events for non-Linux CLI labs", () => {
    const splunkTmpDir = mkdtempSync("/tmp/test-");
    try {
      const logger = createEventLogger({
        logDir: splunkTmpDir,
        moduleId: "test",
        studentId: "test-student",
        labType: "splunk",
      });

      logger.startSession(1);
      logger.logStudentAction("step-1", "execute_query", "index=main | stats count", "success", {});
      logger.endSession("completed", 10);

      const events = logger.getEvents();

      // No legacy command_executed events for Splunk
      const commandExecutedEvents = events.filter(e => e.event_type === "command_executed");
      const studentActionEvents = events.filter(e => e.event_type === "student_action");

      expect(commandExecutedEvents.length).toBe(0);
      expect(studentActionEvents.length).toBeGreaterThan(0);

      // Verify lab_type is splunk
      const allSplunk = events.every(e => "lab_type" in e && e.lab_type === "splunk");
      expect(allSplunk).toBe(true);
    } finally {
      rmSync(splunkTmpDir, { recursive: true });
    }
  });
});

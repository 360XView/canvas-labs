// Event Logger Tests
// Tests for telemetry event logging, session management, and event retrieval

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createEventLogger,
  readTelemetryFile,
  filterEventsBySession,
  getLatestSessionId,
  type EventLogger,
} from "../event-logger";
import type { TelemetryEvent } from "../types";

describe("EventLogger", () => {
  let tempDir: string;
  let logger: EventLogger;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "telemetry-test-"));
    logger = createEventLogger({
      logDir: tempDir,
      moduleId: "test-module",
      studentId: "test-student",
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("Event Logging", () => {
    test("creates valid telemetry.jsonl file", () => {
      logger.startSession(1);
      expect(existsSync(logger.getLogPath())).toBe(true);
    });

    test("appends events without corrupting file", () => {
      logger.startSession(1);
      logger.logCommand("ls");
      logger.logCommand("pwd");
      logger.logCommand("cd /tmp");

      const events = logger.getEvents();
      expect(events.length).toBe(4); // session_started + 3 commands
    });

    test("logs session_started with required fields", () => {
      logger.startSession(1);
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("session_started");
      expect(event.event_id).toMatch(/^evt-[a-f0-9]{8}$/);
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(event.session_id).toMatch(/^sess-[a-f0-9]{8}$/);
      expect(event.module_id).toBe("test-module");
      expect(event.student_id).toBe("test-student");

      if (event.event_type === "session_started") {
        expect(event.payload.attempt_number).toBe(1);
      }
    });

    test("logs session_ended with duration", () => {
      logger.startSession(1);
      logger.endSession("completed", 300);
      const events = logger.getEvents();

      const endEvent = events.find((e) => e.event_type === "session_ended");
      expect(endEvent).toBeDefined();
      if (endEvent?.event_type === "session_ended") {
        expect(endEvent.payload.reason).toBe("completed");
        expect(endEvent.payload.total_time_seconds).toBe(300);
      }
    });

    test("logs command_executed with exit_code and cwd", () => {
      logger.logCommand("ls -la", 0, "/home/student");
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("command_executed");
      if (event.event_type === "command_executed") {
        expect(event.payload.command).toBe("ls -la");
        expect(event.payload.exit_code).toBe(0);
        expect(event.payload.cwd).toBe("/home/student");
      }
    });

    test("logs hint_requested with hint_index and total_hints", () => {
      logger.logHintRequested("step-1", 0, 3);
      logger.logHintRequested("step-1", 1, 3);
      const events = logger.getEvents();

      expect(events.length).toBe(2);
      const event = events[0];
      expect(event.event_type).toBe("hint_requested");
      expect(event.step_id).toBe("step-1");
      if (event.event_type === "hint_requested") {
        expect(event.payload.hint_index).toBe(0);
        expect(event.payload.total_hints).toBe(3);
      }
    });

    test("logs solution_viewed with step_id", () => {
      logger.logSolutionViewed("step-1");
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("solution_viewed");
      expect(event.step_id).toBe("step-1");
      if (event.event_type === "solution_viewed") {
        expect(event.payload.step_id).toBe("step-1");
      }
    });

    test("logs check_passed with source and check_script", () => {
      logger.logCheckPassed("step-1", "check", "check-user-exists.sh", 0);
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("check_passed");
      expect(event.step_id).toBe("step-1");
      if (event.event_type === "check_passed") {
        expect(event.payload.source).toBe("check");
        expect(event.payload.check_script).toBe("check-user-exists.sh");
        expect(event.payload.task_index).toBe(0);
      }
    });

    test("logs check_failed with attempt_number and error_message", () => {
      logger.logCheckFailed("step-1", 1, "check-user-exists.sh", "User not found");
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("check_failed");
      if (event.event_type === "check_failed") {
        expect(event.payload.attempt_number).toBe(1);
        expect(event.payload.check_script).toBe("check-user-exists.sh");
        expect(event.payload.error_message).toBe("User not found");
      }
    });

    test("logs question_answered with correct, options, and attempt_number", () => {
      logger.logQuestionAnswered(
        "step-quiz",
        true,
        ["option-a", "option-c"],
        ["option-a", "option-c"],
        1
      );
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("question_answered");
      if (event.event_type === "question_answered") {
        expect(event.payload.is_correct).toBe(true);
        expect(event.payload.selected_options).toEqual(["option-a", "option-c"]);
        expect(event.payload.correct_options).toEqual(["option-a", "option-c"]);
        expect(event.payload.attempt_number).toBe(1);
      }
    });

    test("logs step_started with step_type", () => {
      logger.logStepStarted("step-1", "task");
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("step_started");
      if (event.event_type === "step_started") {
        expect(event.payload.step_id).toBe("step-1");
        expect(event.payload.step_type).toBe("task");
      }
    });

    test("logs step_completed with source and timing", () => {
      logger.logStepCompleted("step-1", "command", 45);
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("step_completed");
      if (event.event_type === "step_completed") {
        expect(event.payload.step_id).toBe("step-1");
        expect(event.payload.source).toBe("command");
        expect(event.payload.time_spent_seconds).toBe(45);
      }
    });

    test("events written immediately (append-only, no buffering)", () => {
      logger.startSession(1);

      // Read file directly after each write
      let content = readFileSync(logger.getLogPath(), "utf-8");
      let lines = content.split("\n").filter((l) => l.trim());
      expect(lines.length).toBe(1);

      logger.logCommand("ls");
      content = readFileSync(logger.getLogPath(), "utf-8");
      lines = content.split("\n").filter((l) => l.trim());
      expect(lines.length).toBe(2);

      logger.logCommand("pwd");
      content = readFileSync(logger.getLogPath(), "utf-8");
      lines = content.split("\n").filter((l) => l.trim());
      expect(lines.length).toBe(3);
    });

    test("each event has required base fields", () => {
      logger.startSession(1);
      logger.logCommand("test");
      logger.logHintRequested("step-1", 0, 1);
      logger.logSolutionViewed("step-1");
      logger.logCheckPassed("step-1", "check");
      logger.logCheckFailed("step-1", 1);
      logger.logQuestionAnswered("step-1", true, [], [], 1);
      logger.logStepStarted("step-1", "task");
      logger.logStepCompleted("step-1", "check");
      logger.endSession("completed", 100);

      const events = logger.getEvents();
      expect(events.length).toBe(10);

      for (const event of events) {
        expect(event.event_id).toMatch(/^evt-[a-f0-9]{8}$/);
        expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(event.session_id).toMatch(/^sess-[a-f0-9]{8}$/);
        expect(event.module_id).toBe("test-module");
        expect(event.student_id).toBe("test-student");
      }
    });
  });

  describe("Reading Events", () => {
    test("getEvents() returns all events in order", () => {
      logger.startSession(1);
      logger.logStepStarted("step-1", "task");
      logger.logCommand("ls");
      logger.logStepCompleted("step-1", "command");

      const events = logger.getEvents();
      expect(events.length).toBe(4);
      expect(events[0].event_type).toBe("session_started");
      expect(events[1].event_type).toBe("step_started");
      expect(events[2].event_type).toBe("command_executed");
      expect(events[3].event_type).toBe("step_completed");
    });

    test("getEventsByType() filters correctly", () => {
      logger.startSession(1);
      logger.logCommand("ls");
      logger.logCommand("pwd");
      logger.logHintRequested("step-1", 0, 1);

      const commandEvents = logger.getEventsByType("command_executed");
      expect(commandEvents.length).toBe(2);

      const hintEvents = logger.getEventsByType("hint_requested");
      expect(hintEvents.length).toBe(1);

      const sessionEvents = logger.getEventsByType("session_started");
      expect(sessionEvents.length).toBe(1);
    });

    test("getEventsByStep() filters by step_id", () => {
      logger.logStepStarted("step-1", "task");
      logger.logHintRequested("step-1", 0, 2);
      logger.logStepCompleted("step-1", "check");
      logger.logStepStarted("step-2", "task");
      logger.logHintRequested("step-2", 0, 1);

      const step1Events = logger.getEventsByStep("step-1");
      expect(step1Events.length).toBe(3);

      const step2Events = logger.getEventsByStep("step-2");
      expect(step2Events.length).toBe(2);
    });

    test("returns empty array for non-existent file", () => {
      const newLogger = createEventLogger({
        logDir: join(tempDir, "nonexistent"),
        moduleId: "test",
        studentId: "test",
      });
      const events = newLogger.getEvents();
      expect(events).toEqual([]);
    });
  });

  describe("Session Management", () => {
    test("getSessionId() returns consistent session ID", () => {
      const sessionId = logger.getSessionId();
      expect(sessionId).toMatch(/^sess-[a-f0-9]{8}$/);
      expect(logger.getSessionId()).toBe(sessionId);
    });

    test("startSession() creates session_started event", () => {
      logger.startSession(2);
      const events = logger.getEvents();

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.event_type).toBe("session_started");
      if (event.event_type === "session_started") {
        expect(event.payload.attempt_number).toBe(2);
      }
    });

    test("endSession() creates session_ended with duration", () => {
      logger.startSession(1);
      logger.endSession("abandoned", 150);
      const events = logger.getEvents();

      const endEvent = events.find((e) => e.event_type === "session_ended");
      expect(endEvent).toBeDefined();
      if (endEvent?.event_type === "session_ended") {
        expect(endEvent.payload.reason).toBe("abandoned");
        expect(endEvent.payload.total_time_seconds).toBe(150);
      }
    });

    test("endSession() supports timeout reason", () => {
      logger.startSession(1);
      logger.endSession("timeout", 600);
      const events = logger.getEvents();

      const endEvent = events.find((e) => e.event_type === "session_ended");
      if (endEvent?.event_type === "session_ended") {
        expect(endEvent.payload.reason).toBe("timeout");
      }
    });

    test("custom session ID can be provided", () => {
      const customLogger = createEventLogger({
        logDir: tempDir,
        moduleId: "test",
        studentId: "test",
        sessionId: "sess-custom01",
      });
      expect(customLogger.getSessionId()).toBe("sess-custom01");
    });
  });

  describe("getLogPath()", () => {
    test("returns correct path", () => {
      expect(logger.getLogPath()).toBe(join(tempDir, "telemetry.jsonl"));
    });
  });
});

describe("Utility Functions", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "telemetry-util-test-"));
    logPath = join(tempDir, "telemetry.jsonl");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("readTelemetryFile()", () => {
    test("reads events from file", () => {
      const logger = createEventLogger({
        logDir: tempDir,
        moduleId: "test",
        studentId: "test",
      });
      logger.startSession(1);
      logger.logCommand("ls");

      const events = readTelemetryFile(logPath);
      expect(events.length).toBe(2);
    });

    test("returns empty array for missing file", () => {
      const events = readTelemetryFile("/nonexistent/path/telemetry.jsonl");
      expect(events).toEqual([]);
    });
  });

  describe("filterEventsBySession()", () => {
    test("filters events by session ID", () => {
      // Create two loggers with different sessions
      const logger1 = createEventLogger({
        logDir: tempDir,
        moduleId: "test",
        studentId: "test",
        sessionId: "sess-aaaaaaaa",
      });
      const logger2 = createEventLogger({
        logDir: tempDir,
        moduleId: "test",
        studentId: "test",
        sessionId: "sess-bbbbbbbb",
      });

      logger1.startSession(1);
      logger1.logCommand("ls");
      logger2.startSession(2);
      logger2.logCommand("pwd");
      logger2.logCommand("cd /tmp");

      const allEvents = readTelemetryFile(logPath);
      expect(allEvents.length).toBe(5);

      const session1Events = filterEventsBySession(allEvents, "sess-aaaaaaaa");
      expect(session1Events.length).toBe(2);

      const session2Events = filterEventsBySession(allEvents, "sess-bbbbbbbb");
      expect(session2Events.length).toBe(3);
    });
  });

  describe("getLatestSessionId()", () => {
    test("returns the most recent session ID", () => {
      const logger1 = createEventLogger({
        logDir: tempDir,
        moduleId: "test",
        studentId: "test",
        sessionId: "sess-aaaaaaaa",
      });
      logger1.startSession(1);

      const logger2 = createEventLogger({
        logDir: tempDir,
        moduleId: "test",
        studentId: "test",
        sessionId: "sess-bbbbbbbb",
      });
      logger2.startSession(2);

      const events = readTelemetryFile(logPath);
      const latestSession = getLatestSessionId(events);
      expect(latestSession).toBe("sess-bbbbbbbb");
    });

    test("returns null for empty events", () => {
      const latestSession = getLatestSessionId([]);
      expect(latestSession).toBeNull();
    });

    test("returns null for events without session_started", () => {
      const logger = createEventLogger({
        logDir: tempDir,
        moduleId: "test",
        studentId: "test",
      });
      // Log command without starting session
      logger.logCommand("ls");

      const events = readTelemetryFile(logPath);
      const latestSession = getLatestSessionId(events);
      expect(latestSession).toBeNull();
    });
  });
});

describe("Error Handling", () => {
  test("handles directory creation failure gracefully", () => {
    let errorCaptured: Error | null = null;

    // This should fail because /root is not writable
    const logger = createEventLogger({
      logDir: "/root/test-telemetry",
      moduleId: "test",
      studentId: "test",
      onError: (err) => {
        errorCaptured = err;
      },
    });

    // Should not throw, error handled by callback
    expect(logger.getSessionId()).toMatch(/^sess-/);
  });

  test("handles write failure gracefully", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "telemetry-error-test-"));
    let errorCaptured: Error | null = null;

    const logger = createEventLogger({
      logDir: tempDir,
      moduleId: "test",
      studentId: "test",
      onError: (err) => {
        errorCaptured = err;
      },
    });

    logger.startSession(1);

    // Clean up
    rmSync(tempDir, { recursive: true });
  });

  test("onLog callback receives log messages", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "telemetry-log-test-"));
    const logMessages: string[] = [];

    const logger = createEventLogger({
      logDir: tempDir,
      moduleId: "test",
      studentId: "test",
      onLog: (msg) => {
        logMessages.push(msg);
      },
    });

    logger.startSession(1);
    logger.logCommand("ls");

    expect(logMessages.length).toBe(2);
    expect(logMessages[0]).toContain("session_started");
    expect(logMessages[1]).toContain("command_executed");

    // Clean up
    rmSync(tempDir, { recursive: true });
  });
});

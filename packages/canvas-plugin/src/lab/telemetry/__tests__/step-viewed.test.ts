import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createEventLogger } from "../event-logger";

describe("step_started telemetry", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("logStepStarted emits step_started event with correct payload", () => {
    const logger = createEventLogger({
      logDir: tempDir,
      moduleId: "test-module",
      studentId: "test-student",
    });

    logger.startSession(1);
    logger.logStepStarted("step-1", "task");

    const events = logger.getEvents();
    const stepStartedEvent = events.find((e) => e.event_type === "step_started");

    expect(stepStartedEvent).toBeDefined();
    expect(stepStartedEvent?.event_type).toBe("step_started");
    if (stepStartedEvent?.event_type === "step_started") {
      expect(stepStartedEvent.payload.step_id).toBe("step-1");
      expect(stepStartedEvent.payload.step_type).toBe("task");
    }
  });

  test("step_started events are written to telemetry.jsonl", () => {
    const logger = createEventLogger({
      logDir: tempDir,
      moduleId: "test-module",
      studentId: "test-student",
    });

    logger.startSession(1);
    logger.logStepStarted("intro", "introduction");
    logger.logStepStarted("task-1", "task");
    logger.logStepStarted("quiz", "question");

    const content = readFileSync(join(tempDir, "telemetry.jsonl"), "utf-8");
    const lines = content.trim().split("\n");
    const events = lines.map((l) => JSON.parse(l));

    const stepStartedEvents = events.filter((e) => e.event_type === "step_started");
    expect(stepStartedEvents).toHaveLength(3);
    expect(stepStartedEvents[0].payload.step_type).toBe("introduction");
    expect(stepStartedEvents[1].payload.step_type).toBe("task");
    expect(stepStartedEvents[2].payload.step_type).toBe("question");
  });
});

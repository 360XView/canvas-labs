import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { generateSummary } from "../summary-generator";

describe("summary generator", () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "summary-test-"));
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  test("counts events by type", () => {
    const events = [
      { event_type: "session_started", timestamp: "2026-02-12T10:00:00Z" },
      { event_type: "step_started", timestamp: "2026-02-12T10:00:01Z" },
      { event_type: "student_action", timestamp: "2026-02-12T10:00:02Z" },
      { event_type: "check_passed", timestamp: "2026-02-12T10:00:03Z" },
      { event_type: "hint_requested", timestamp: "2026-02-12T10:00:04Z" },
      { event_type: "session_ended", timestamp: "2026-02-12T10:00:10Z" },
    ];
    writeFileSync(join(logDir, "telemetry.jsonl"), events.map(e => JSON.stringify(e)).join("\n") + "\n");
    writeFileSync(join(logDir, "state.json"), JSON.stringify({ version: 1, steps: [] }));

    const summary = generateSummary(logDir, "test-scenario");
    expect(summary.totalEvents).toBe(6);
    expect(summary.eventCounts.session_started).toBe(1);
    expect(summary.eventCounts.hint_requested).toBe(1);
    expect(summary.eventCounts.student_action).toBe(1);
  });

  test("calculates step completion from state.json", () => {
    writeFileSync(join(logDir, "telemetry.jsonl"), '{"event_type":"session_started"}\n');
    writeFileSync(join(logDir, "state.json"), JSON.stringify({
      version: 1,
      steps: [
        { id: "intro", completed: false },
        { id: "step-1", completed: true, source: "check" },
        { id: "step-2", completed: true, source: "command" },
        { id: "step-3", completed: false },
      ],
    }));

    const summary = generateSummary(logDir, "test-scenario");
    expect(summary.stepsCompleted).toBe(2);
    expect(summary.stepsTotal).toBe(4);
  });

  test("counts tutor utterances", () => {
    writeFileSync(join(logDir, "telemetry.jsonl"), '{"event_type":"session_started"}\n');
    writeFileSync(join(logDir, "state.json"), '{"version":1,"steps":[]}');
    writeFileSync(join(logDir, "tutor-speech.jsonl"),
      '{"event_type":"tutor_utterance","content":"Hello!"}\n' +
      '{"event_type":"tutor_utterance","content":"Try sudo su"}\n'
    );

    const summary = generateSummary(logDir, "test-scenario");
    expect(summary.tutorUtteranceCount).toBe(2);
  });

  test("generates markdown summary", () => {
    const events = [
      { event_type: "session_started" },
      { event_type: "student_action" },
      { event_type: "hint_requested" },
    ];
    writeFileSync(join(logDir, "telemetry.jsonl"), events.map(e => JSON.stringify(e)).join("\n") + "\n");
    writeFileSync(join(logDir, "state.json"), JSON.stringify({
      version: 1,
      steps: [
        { id: "intro", completed: false },
        { id: "step-1", completed: true, source: "check" },
      ],
    }));

    const summary = generateSummary(logDir, "test-scenario");
    const md = summary.toMarkdown();
    expect(md).toContain("# Evaluation Baseline Summary");
    expect(md).toContain("test-scenario");
    expect(md).toContain("Total events: 3");
    expect(md).toContain("Steps completed: 1/2");
    expect(md).toContain("step-1");
  });

  test("handles missing files gracefully", () => {
    const summary = generateSummary(logDir, "empty-scenario");
    expect(summary.totalEvents).toBe(0);
    expect(summary.stepsCompleted).toBe(0);
    expect(summary.tutorUtteranceCount).toBe(0);
  });
});

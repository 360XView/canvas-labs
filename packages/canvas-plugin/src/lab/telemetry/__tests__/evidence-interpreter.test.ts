// Evidence Interpreter Tests
// Tests for event aggregation, evidence generation, and lab progress calculation

import { describe, test, expect, beforeEach } from "bun:test";
import {
  aggregateEventsByStep,
  generateStepEvidence,
  interpretLabProgress,
  generateScoreTrace,
  getAllScoreTraces,
  recomputeWithPreset,
} from "../evidence-interpreter";
import { SCORING_PRESETS } from "../scoring-presets";
import type {
  TelemetryEvent,
  HintRequestedEvent,
  SolutionViewedEvent,
  CheckPassedEvent,
  CheckFailedEvent,
  StepStartedEvent,
  StepCompletedEvent,
  QuestionAnsweredEvent,
  SessionStartedEvent,
  CommandExecutedEvent,
} from "../types";

// Helper to create events with consistent fields
function createEvent<T extends TelemetryEvent["event_type"]>(
  eventType: T,
  payload: Record<string, unknown>,
  stepId?: string,
  sessionId: string = "sess-test0001"
): TelemetryEvent {
  return {
    event_id: `evt-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    module_id: "test-module",
    student_id: "test-student",
    step_id: stepId,
    event_type: eventType,
    payload,
  } as TelemetryEvent;
}

describe("aggregateEventsByStep", () => {
  describe("StepMetrics Aggregation", () => {
    test("counts events per step", () => {
      const events: TelemetryEvent[] = [
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
        createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 3 }, "step-1"),
        createEvent("hint_requested", { step_id: "step-1", hint_index: 1, total_hints: 3 }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        createEvent("step_completed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      expect(metrics.size).toBe(1);

      const step1 = metrics.get("step-1");
      expect(step1).toBeDefined();
      expect(step1?.hintsRevealed).toBe(2); // hint_index 0 and 1
      expect(step1?.checkPassed).toBe(true);
      expect(step1?.eventIds.length).toBe(5);
    });

    test("tracks hints_used correctly", () => {
      const events: TelemetryEvent[] = [
        createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 3 }, "step-1"),
        createEvent("hint_requested", { step_id: "step-1", hint_index: 1, total_hints: 3 }, "step-1"),
        createEvent("hint_requested", { step_id: "step-1", hint_index: 2, total_hints: 3 }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const step1 = metrics.get("step-1");
      expect(step1?.hintsRevealed).toBe(3);
    });

    test("tracks solution_viewed", () => {
      const events: TelemetryEvent[] = [
        createEvent("solution_viewed", { step_id: "step-1" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const step1 = metrics.get("step-1");
      expect(step1?.solutionViewed).toBe(true);
    });

    test("tracks retry_attempts from check_failed events", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_failed", { step_id: "step-1", attempt_number: 1 }, "step-1"),
        createEvent("check_failed", { step_id: "step-1", attempt_number: 2 }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const step1 = metrics.get("step-1");
      expect(step1?.checkAttempts).toBe(3); // 2 failures + 1 success
      expect(step1?.checkPassed).toBe(true);
    });

    test("identifies first_try success", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_passed", { step_id: "step-1", source: "command" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const step1 = metrics.get("step-1");
      expect(step1?.checkAttempts).toBe(1);
      expect(step1?.checkPassed).toBe(true);
    });

    test("calculates time_spent from start/complete events", () => {
      const startTime = new Date("2024-01-01T10:00:00Z");
      const endTime = new Date("2024-01-01T10:05:30Z");

      const events: TelemetryEvent[] = [
        {
          ...createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
          timestamp: startTime.toISOString(),
        },
        {
          ...createEvent("step_completed", { step_id: "step-1", source: "check" }, "step-1"),
          timestamp: endTime.toISOString(),
        },
      ];

      const metrics = aggregateEventsByStep(events);
      const step1 = metrics.get("step-1");
      expect(step1?.startedAt).toBe(startTime.toISOString());
      expect(step1?.completedAt).toBe(endTime.toISOString());
    });

    test("handles incomplete steps (no completion event)", () => {
      const events: TelemetryEvent[] = [
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
        createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 2 }, "step-1"),
        // No step_completed event
      ];

      const metrics = aggregateEventsByStep(events);
      const step1 = metrics.get("step-1");
      expect(step1?.startedAt).toBeDefined();
      expect(step1?.completedAt).toBeUndefined();
      expect(step1?.checkPassed).toBe(false);
    });

    test("tracks question_answered events", () => {
      const events: TelemetryEvent[] = [
        createEvent(
          "question_answered",
          { step_id: "step-quiz", is_correct: false, selected_options: ["a"], correct_options: ["b"], attempt_number: 1 },
          "step-quiz"
        ),
        createEvent(
          "question_answered",
          { step_id: "step-quiz", is_correct: true, selected_options: ["b"], correct_options: ["b"], attempt_number: 2 },
          "step-quiz"
        ),
      ];

      const metrics = aggregateEventsByStep(events);
      const stepQuiz = metrics.get("step-quiz");
      expect(stepQuiz?.questionAttempts).toBe(2);
      expect(stepQuiz?.questionCorrect).toBe(true);
      expect(stepQuiz?.checkPassed).toBe(true);
      expect(stepQuiz?.checkSource).toBe("question");
    });

    test("filters by session ID when provided", () => {
      const events: TelemetryEvent[] = [
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1", "sess-aaaaaaaa"),
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1", "sess-bbbbbbbb"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1", "sess-bbbbbbbb"),
      ];

      const metricsAll = aggregateEventsByStep(events);
      expect(metricsAll.get("step-1")?.eventIds.length).toBe(3);

      const metricsFiltered = aggregateEventsByStep(events, "sess-bbbbbbbb");
      expect(metricsFiltered.get("step-1")?.eventIds.length).toBe(2);
      expect(metricsFiltered.get("step-1")?.checkPassed).toBe(true);
    });
  });
});

describe("generateStepEvidence", () => {
  const preset = SCORING_PRESETS.partial_credit;
  const studentId = "test-student";
  const sessionId = "sess-test0001";

  describe("TaskEvidence Generation", () => {
    test("generates evidence from metrics", () => {
      const events: TelemetryEvent[] = [
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        createEvent("step_completed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const step1Metrics = metrics.get("step-1")!;
      const evidence = generateStepEvidence(step1Metrics, preset, studentId, sessionId);

      expect(evidence.evidence_id).toMatch(/^ev-/);
      expect(evidence.task_id).toBe("step-1");
      expect(evidence.step_id).toBe("step-1");
      expect(evidence.student_id).toBe(studentId);
      expect(evidence.session_id).toBe(sessionId);
      expect(evidence.status).toBe("completed");
      expect(evidence.confidence).toBe(1.0); // First try, no hints
      expect(evidence.source_event_ids.length).toBe(3);
    });

    test("applies scoring preset correctly", () => {
      const events: TelemetryEvent[] = [
        createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 2 }, "step-1"),
        createEvent("hint_requested", { step_id: "step-1", hint_index: 1, total_hints: 2 }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const step1Metrics = metrics.get("step-1")!;
      const evidence = generateStepEvidence(step1Metrics, preset, studentId, sessionId);

      // 2 hints = -30%, but checkAttempts=1 so first-try bonus +10% = 0.80
      expect(evidence.confidence).toBeCloseTo(0.8, 5);
      expect(evidence.modifiers.some((m) => m.kind === "hint_used")).toBe(true);
    });

    test("includes source_event_ids for traceability", () => {
      const events: TelemetryEvent[] = [
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const step1Metrics = metrics.get("step-1")!;
      const evidence = generateStepEvidence(step1Metrics, preset, studentId, sessionId);

      expect(evidence.source_event_ids.length).toBe(2);
      for (const eventId of evidence.source_event_ids) {
        expect(eventId).toMatch(/^evt-/);
      }
    });

    test("status: completed for passed checks", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const evidence = generateStepEvidence(metrics.get("step-1")!, preset, studentId, sessionId);

      expect(evidence.status).toBe("completed");
    });

    test("status: partial for failed attempts", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_failed", { step_id: "step-1", attempt_number: 1 }, "step-1"),
        createEvent("check_failed", { step_id: "step-1", attempt_number: 2 }, "step-1"),
        // No pass event
      ];

      const metrics = aggregateEventsByStep(events);
      const evidence = generateStepEvidence(metrics.get("step-1")!, preset, studentId, sessionId);

      expect(evidence.status).toBe("partial");
    });

    test("status: in_progress for started but no attempts", () => {
      const events: TelemetryEvent[] = [
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const evidence = generateStepEvidence(metrics.get("step-1")!, preset, studentId, sessionId);

      expect(evidence.status).toBe("in_progress");
    });

    test("status: failed based on confidence in strict mode", () => {
      const strictPreset = SCORING_PRESETS.strict;
      const events: TelemetryEvent[] = [
        createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 1 }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const metrics = aggregateEventsByStep(events);
      const evidence = generateStepEvidence(metrics.get("step-1")!, strictPreset, studentId, sessionId);

      expect(evidence.confidence).toBe(0.0); // Strict mode: hint = 0
      expect(evidence.status).toBe("completed"); // Still completed, just 0 confidence
    });
  });
});

describe("interpretLabProgress", () => {
  describe("LabProgress Calculation", () => {
    test("aggregates all tasks", () => {
      const events: TelemetryEvent[] = [
        createEvent("session_started", { attempt_number: 1 }),
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        createEvent("step_completed", { step_id: "step-1", source: "check" }, "step-1"),
        createEvent("step_started", { step_id: "step-2", step_type: "task" }, "step-2"),
        createEvent("check_passed", { step_id: "step-2", source: "check" }, "step-2"),
        createEvent("step_completed", { step_id: "step-2", source: "check" }, "step-2"),
      ];

      const progress = interpretLabProgress({
        events,
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1", "step-2"],
      });

      expect(Object.keys(progress.tasks).length).toBe(2);
      expect(progress.tasks["step-1"]).toBeDefined();
      expect(progress.tasks["step-2"]).toBeDefined();
    });

    test("computes weighted overall_score", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"), // First try = 1.0
        createEvent("hint_requested", { step_id: "step-2", hint_index: 0, total_hints: 2 }, "step-2"),
        createEvent("hint_requested", { step_id: "step-2", hint_index: 1, total_hints: 2 }, "step-2"),
        createEvent("check_passed", { step_id: "step-2", source: "check" }, "step-2"), // 2 hints = 0.7
      ];

      const progress = interpretLabProgress({
        events,
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1", "step-2"],
        stepWeights: { "step-1": 2, "step-2": 1 },
        presetId: "partial_credit",
      });

      // step-1: confidence 1.0 (first try bonus applied), weight 2
      // step-2: confidence 0.7 (2 hints), weight 1
      // Weighted: (2*1.0 + 1*0.7) / 3 = 2.7/3 = 0.9
      expect(progress.overall_score).toBeCloseTo(0.9, 1);
    });

    test("calculates completion_pct (completed / total)", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        // step-2 not completed
      ];

      const progress = interpretLabProgress({
        events,
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1", "step-2", "step-3", "step-4"],
      });

      expect(progress.completion_pct).toBe(25); // 1/4 = 25%
    });

    test("determines passed status (overall_score >= threshold)", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        createEvent("check_passed", { step_id: "step-2", source: "check" }, "step-2"),
      ];

      const progress = interpretLabProgress({
        events,
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1", "step-2"],
        presetId: "partial_credit",
      });

      expect(progress.passed).toBe(true);
      expect(progress.overall_score).toBeGreaterThanOrEqual(0.7);
    });

    test("tracks telemetry_event_count", () => {
      const events: TelemetryEvent[] = [
        createEvent("session_started", { attempt_number: 1 }),
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
        createEvent("command_executed", { command: "ls" }),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        createEvent("step_completed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const progress = interpretLabProgress({
        events,
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1"],
      });

      expect(progress.telemetry_event_count).toBe(5);
    });

    test("uses default preset (partial_credit)", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const progress = interpretLabProgress({
        events,
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1"],
      });

      expect(progress.scoring_preset_id).toBe("partial_credit");
    });

    test("includes timing information", () => {
      const startTime = "2024-01-01T10:00:00Z";
      const endTime = "2024-01-01T10:30:00Z";

      const events: TelemetryEvent[] = [
        { ...createEvent("session_started", { attempt_number: 1 }), timestamp: startTime },
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        { ...createEvent("session_ended", { reason: "completed", total_time_seconds: 1800 }), timestamp: endTime },
      ];

      const progress = interpretLabProgress({
        events,
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1"],
      });

      expect(progress.started_at).toBe(startTime);
      expect(progress.last_activity).toBe(endTime);
      expect(progress.completed_at).toBe(endTime);
    });
  });
});

describe("Preset Replay", () => {
  test("can recompute scores with different preset", () => {
    const events: TelemetryEvent[] = [
      createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 1 }, "step-1"),
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
    ];

    const partialProgress = interpretLabProgress({
      events,
      moduleId: "test-module",
      studentId: "test-student",
      sessionId: "sess-test0001",
      stepIds: ["step-1"],
      presetId: "partial_credit",
    });

    const strictProgress = recomputeWithPreset(
      events,
      {
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1"],
      },
      "strict"
    );

    // Partial credit: 1 hint = -15%, first-try bonus +10% (checkAttempts=1) = 0.95
    expect(partialProgress.overall_score).toBeCloseTo(0.95, 5);

    // Strict: 1 hint = fail = 0.0
    expect(strictProgress.overall_score).toBe(0.0);
  });

  test("same events, different penalties = different scores", () => {
    const events: TelemetryEvent[] = [
      createEvent("solution_viewed", { step_id: "step-1" }, "step-1"),
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
    ];

    const partialProgress = recomputeWithPreset(
      events,
      {
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1"],
      },
      "partial_credit"
    );

    const practiceProgress = recomputeWithPreset(
      events,
      {
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1"],
      },
      "practice_mode"
    );

    // Partial credit: solution = -25% = 0.75
    expect(partialProgress.tasks["step-1"].confidence).toBe(0.75);

    // Practice mode: solution = -10% = 0.90
    expect(practiceProgress.tasks["step-1"].confidence).toBe(0.9);
  });

  test("strict fails, partial credit passes example", () => {
    const events: TelemetryEvent[] = [
      createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 2 }, "step-1"),
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
    ];

    const strictProgress = recomputeWithPreset(
      events,
      {
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1"],
      },
      "strict"
    );

    const partialProgress = recomputeWithPreset(
      events,
      {
        moduleId: "test-module",
        studentId: "test-student",
        sessionId: "sess-test0001",
        stepIds: ["step-1"],
      },
      "partial_credit"
    );

    expect(strictProgress.passed).toBe(false);
    expect(partialProgress.passed).toBe(true);
  });
});

describe("Score Traces", () => {
  describe("generateScoreTrace()", () => {
    test("returns full explanation", () => {
      const events: TelemetryEvent[] = [
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
        createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 2 }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        createEvent("step_completed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const trace = generateScoreTrace(events, "step-1", "sess-test0001", "test-student");

      expect(trace).not.toBeNull();
      expect(trace?.task_id).toBe("step-1");
      expect(trace?.step_id).toBe("step-1");
      expect(trace?.base_score).toBe(1.0);
      // 1 hint = -15%, first-try bonus +10% (checkAttempts=1) = 0.95
      expect(trace?.confidence).toBeCloseTo(0.95, 5);
      expect(trace?.modifiers.length).toBeGreaterThan(0);
      expect(trace?.explanation).toContain("Completed");
    });

    test("shows: base confidence -> modifiers -> final score", () => {
      const events: TelemetryEvent[] = [
        createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 2 }, "step-1"),
        createEvent("hint_requested", { step_id: "step-1", hint_index: 1, total_hints: 2 }, "step-1"),
        createEvent("solution_viewed", { step_id: "step-1" }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const trace = generateScoreTrace(events, "step-1", "sess-test0001", "test-student");

      expect(trace?.base_score).toBe(1.0);
      expect(trace?.modifiers.some((m) => m.kind === "hint_used")).toBe(true);
      expect(trace?.modifiers.some((m) => m.kind === "solution_viewed")).toBe(true);
      // Final: 1.0 - 0.30 (2 hints) - 0.25 (solution) = 0.45
      // No first-try bonus because solution was viewed (isFirstTrySuccess checks !solutionViewed)
      expect(trace?.confidence).toBeCloseTo(0.45, 5);
    });

    test("includes source events with timestamps", () => {
      const events: TelemetryEvent[] = [
        createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "command" }, "step-1"),
      ];

      const trace = generateScoreTrace(events, "step-1", "sess-test0001", "test-student");

      expect(trace?.source_events.length).toBe(2);
      for (const se of trace!.source_events) {
        expect(se.event_id).toMatch(/^evt-/);
        expect(se.event_type).toBeDefined();
        expect(se.timestamp).toBeDefined();
        expect(se.summary).toBeDefined();
      }
    });

    test("returns null for step with no events", () => {
      const events: TelemetryEvent[] = [];
      const trace = generateScoreTrace(events, "step-1", "sess-test0001", "test-student");
      expect(trace).toBeNull();
    });
  });

  describe("getAllScoreTraces()", () => {
    test("returns traces for all steps", () => {
      const events: TelemetryEvent[] = [
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
        createEvent("check_passed", { step_id: "step-2", source: "check" }, "step-2"),
        createEvent("hint_requested", { step_id: "step-3", hint_index: 0, total_hints: 1 }, "step-3"),
      ];

      const traces = getAllScoreTraces(
        events,
        ["step-1", "step-2", "step-3", "step-4"],
        "sess-test0001",
        "test-student"
      );

      // Should have traces for steps with events (step-1, step-2, step-3)
      // step-4 has no events, so no trace
      expect(traces.length).toBe(3);
      expect(traces.map((t) => t.step_id)).toContain("step-1");
      expect(traces.map((t) => t.step_id)).toContain("step-2");
      expect(traces.map((t) => t.step_id)).toContain("step-3");
    });

    test("uses specified preset", () => {
      const events: TelemetryEvent[] = [
        createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 1 }, "step-1"),
        createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      ];

      const partialTraces = getAllScoreTraces(
        events,
        ["step-1"],
        "sess-test0001",
        "test-student",
        "partial_credit"
      );

      const strictTraces = getAllScoreTraces(
        events,
        ["step-1"],
        "sess-test0001",
        "test-student",
        "strict"
      );

      // 1 hint = -15%, first-try bonus +10% = 0.95
      expect(partialTraces[0].confidence).toBeCloseTo(0.95, 5);
      expect(strictTraces[0].confidence).toBe(0.0);
    });
  });
});

describe("Edge Cases", () => {
  test("handles empty events array", () => {
    const progress = interpretLabProgress({
      events: [],
      moduleId: "test-module",
      studentId: "test-student",
      sessionId: "sess-test0001",
      stepIds: ["step-1", "step-2"],
    });

    expect(progress.overall_score).toBe(0);
    expect(progress.completion_pct).toBe(0);
    expect(progress.passed).toBe(false);
  });

  test("handles steps with no matching events", () => {
    const events: TelemetryEvent[] = [
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
    ];

    const progress = interpretLabProgress({
      events,
      moduleId: "test-module",
      studentId: "test-student",
      sessionId: "sess-test0001",
      stepIds: ["step-1", "step-2", "step-3"], // step-2 and step-3 have no events
    });

    expect(progress.tasks["step-1"].confidence).toBe(1.0);
    expect(progress.tasks["step-2"].confidence).toBe(1.0); // Default for pending
    expect(progress.tasks["step-3"].confidence).toBe(1.0); // Default for pending
    expect(progress.completion_pct).toBe(33); // 1/3
  });

  test("handles duplicate events gracefully", () => {
    const events: TelemetryEvent[] = [
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
    ];

    const metrics = aggregateEventsByStep(events);
    expect(metrics.get("step-1")?.checkAttempts).toBe(3);
    expect(metrics.get("step-1")?.checkPassed).toBe(true);
  });

  test("handles events without step_id", () => {
    const events: TelemetryEvent[] = [
      createEvent("session_started", { attempt_number: 1 }), // No step_id
      createEvent("command_executed", { command: "ls" }), // No step_id
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1"),
    ];

    const metrics = aggregateEventsByStep(events);
    // Should only have step-1, not entries for events without step_id
    expect(metrics.size).toBe(1);
    expect(metrics.has("step-1")).toBe(true);
  });

  test("handles mixed sessions in events", () => {
    const events: TelemetryEvent[] = [
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1", "sess-aaaaaaaa"),
      createEvent("hint_requested", { step_id: "step-1", hint_index: 0, total_hints: 1 }, "step-1", "sess-bbbbbbbb"),
      createEvent("check_passed", { step_id: "step-1", source: "check" }, "step-1", "sess-bbbbbbbb"),
    ];

    // Session A: no hints
    const progressA = interpretLabProgress({
      events,
      moduleId: "test-module",
      studentId: "test-student",
      sessionId: "sess-aaaaaaaa",
      stepIds: ["step-1"],
    });

    // Session B: 1 hint
    const progressB = interpretLabProgress({
      events,
      moduleId: "test-module",
      studentId: "test-student",
      sessionId: "sess-bbbbbbbb",
      stepIds: ["step-1"],
    });

    expect(progressA.tasks["step-1"].confidence).toBe(1.0); // First try
    // 1 hint = -15%, first-try bonus +10% (checkAttempts=1) = 0.95
    expect(progressB.tasks["step-1"].confidence).toBeCloseTo(0.95, 5);
  });

  test("calculates time spent correctly", () => {
    const events: TelemetryEvent[] = [
      { ...createEvent("step_started", { step_id: "step-1", step_type: "task" }, "step-1"), timestamp: "2024-01-01T10:00:00.000Z" },
      { ...createEvent("step_completed", { step_id: "step-1", source: "check" }, "step-1"), timestamp: "2024-01-01T10:02:30.000Z" },
    ];

    const metrics = aggregateEventsByStep(events);
    const evidence = generateStepEvidence(
      metrics.get("step-1")!,
      SCORING_PRESETS.partial_credit,
      "test-student",
      "sess-test0001"
    );

    expect(evidence.time_spent_seconds).toBe(150); // 2 minutes 30 seconds
  });
});

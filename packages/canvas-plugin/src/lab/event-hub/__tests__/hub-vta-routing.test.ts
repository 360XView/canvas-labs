// Event Hub VTA Routing Tests
// Verifies that VTA messages are routed to BOTH telemetry.jsonl AND state.json
// PROD-002: VTA telemetry audit

import { describe, test, expect, afterEach } from "bun:test";
import { rmSync } from "fs";
import { createTestLabSession, type TestLabSession } from "./helpers";

// Allow time for IPC message processing
const PROCESS_DELAY = 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Event Hub: VTA message → telemetry routing", () => {
  let session: TestLabSession;

  afterEach(() => {
    if (session) {
      session.cleanup();
      rmSync(session.logDir, { recursive: true, force: true });
    }
  });

  test("stepViewed → step_started telemetry event", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "stepViewed",
      stepId: "step-1",
      stepType: "task",
    });
    await sleep(PROCESS_DELAY);

    const events = session.getTelemetry();
    const stepStarted = events.find((e) => e.event_type === "step_started");
    expect(stepStarted).toBeDefined();
    if (stepStarted?.event_type === "step_started") {
      expect(stepStarted.payload.step_id).toBe("step-1");
      expect(stepStarted.payload.step_type).toBe("task");
    }
  });

  test("hintRequested → hint_requested telemetry event", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "hintRequested",
      stepId: "step-1",
      hintIndex: 0,
      totalHints: 3,
    });
    await sleep(PROCESS_DELAY);

    const events = session.getTelemetry();
    const hintEvent = events.find((e) => e.event_type === "hint_requested");
    expect(hintEvent).toBeDefined();
    if (hintEvent?.event_type === "hint_requested") {
      expect(hintEvent.payload.step_id).toBe("step-1");
      expect(hintEvent.payload.hint_index).toBe(0);
      expect(hintEvent.payload.total_hints).toBe(3);
    }
  });

  test("solutionViewed → solution_viewed telemetry event", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "solutionViewed",
      stepId: "step-1",
    });
    await sleep(PROCESS_DELAY);

    const events = session.getTelemetry();
    const solutionEvent = events.find((e) => e.event_type === "solution_viewed");
    expect(solutionEvent).toBeDefined();
    if (solutionEvent?.event_type === "solution_viewed") {
      expect(solutionEvent.payload.step_id).toBe("step-1");
    }
  });

  test("questionAnswered → question_answered telemetry event", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "questionAnswered",
      stepId: "quiz",
      isCorrect: true,
      selectedOptions: ["opt-a"],
      correctOptions: ["opt-a"],
      attempts: 1,
    });
    await sleep(PROCESS_DELAY);

    const events = session.getTelemetry();
    const questionEvent = events.find((e) => e.event_type === "question_answered");
    expect(questionEvent).toBeDefined();
    if (questionEvent?.event_type === "question_answered") {
      expect(questionEvent.payload.step_id).toBe("quiz");
      expect(questionEvent.payload.is_correct).toBe(true);
      expect(questionEvent.payload.selected_options).toEqual(["opt-a"]);
      expect(questionEvent.payload.correct_options).toEqual(["opt-a"]);
      expect(questionEvent.payload.attempt_number).toBe(1);
    }
  });
});

describe("Event Hub: VTA message → state.json routing", () => {
  let session: TestLabSession;

  afterEach(() => {
    if (session) {
      session.cleanup();
      rmSync(session.logDir, { recursive: true, force: true });
    }
  });

  test("hintRequested → state.json step hintsRevealed updated", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "hintRequested",
      stepId: "step-1",
      hintIndex: 0,
      totalHints: 3,
    });
    await sleep(PROCESS_DELAY);

    const state = session.getState();
    expect(state).not.toBeNull();
    const step = state!.steps.find((s) => s.id === "step-1");
    expect(step).toBeDefined();
    expect(step!.hintsRevealed).toBe(1);
  });

  test("second hint → state.json step hintsRevealed increments", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "hintRequested",
      stepId: "step-1",
      hintIndex: 0,
      totalHints: 3,
    });
    await sleep(PROCESS_DELAY);

    session.sendVTAMessage({
      type: "hintRequested",
      stepId: "step-1",
      hintIndex: 1,
      totalHints: 3,
    });
    await sleep(PROCESS_DELAY);

    const state = session.getState();
    const step = state!.steps.find((s) => s.id === "step-1");
    expect(step!.hintsRevealed).toBe(2);
  });

  test("solutionViewed → state.json step solutionViewed flag set", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "solutionViewed",
      stepId: "step-1",
    });
    await sleep(PROCESS_DELAY);

    const state = session.getState();
    const step = state!.steps.find((s) => s.id === "step-1");
    expect(step).toBeDefined();
    expect(step!.solutionViewed).toBe(true);
  });

  test("questionAnswered (correct) → state.json step questionResult", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "questionAnswered",
      stepId: "quiz",
      isCorrect: true,
      selectedOptions: ["opt-a", "opt-c"],
      correctOptions: ["opt-a", "opt-c"],
      attempts: 1,
    });
    await sleep(PROCESS_DELAY);

    const state = session.getState();
    const step = state!.steps.find((s) => s.id === "quiz");
    expect(step).toBeDefined();
    expect(step!.questionResult).toBeDefined();
    expect(step!.questionResult!.isCorrect).toBe(true);
    expect(step!.questionResult!.selectedOptions).toEqual(["opt-a", "opt-c"]);
    expect(step!.questionResult!.correctOptions).toEqual(["opt-a", "opt-c"]);
  });

  test("questionAnswered (incorrect) → state.json step questionResult.isCorrect false", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "questionAnswered",
      stepId: "quiz",
      isCorrect: false,
      selectedOptions: ["opt-b"],
      correctOptions: ["opt-a"],
      attempts: 1,
    });
    await sleep(PROCESS_DELAY);

    const state = session.getState();
    const step = state!.steps.find((s) => s.id === "quiz");
    expect(step).toBeDefined();
    expect(step!.questionResult).toBeDefined();
    expect(step!.questionResult!.isCorrect).toBe(false);
  });

  test("correct questionAnswered → step marked completed in state", async () => {
    session = await createTestLabSession();

    session.sendVTAMessage({
      type: "questionAnswered",
      stepId: "quiz",
      isCorrect: true,
      selectedOptions: ["opt-a"],
      correctOptions: ["opt-a"],
      attempts: 1,
    });
    await sleep(PROCESS_DELAY);

    const state = session.getState();
    const step = state!.steps.find((s) => s.id === "quiz");
    expect(step!.completed).toBe(true);
    expect(step!.completedBy).toBe("question");
  });
});

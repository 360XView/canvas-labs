// Skill Graph Integration Tests
// End-to-end: telemetry events → evidence interpreter → skill evidence → aggregation → states → queries

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { interpretLabProgress } from "../../telemetry/evidence-interpreter";
import type { TelemetryEvent } from "../../telemetry/types";
import { loadSkillCatalog, loadQMatrix } from "../skill-loader";
import { produceSkillEvidence, computeStudentSkillStates } from "../skill-engine";
import { getStudentSkills, getGapAnalysis, getSkillsByLevel } from "../skill-query";
import { saveStudentProfile, loadStudentProfile } from "../skill-store";
import type { SkillEvidence, StudentSkillProfile } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

function createEvent<T extends TelemetryEvent["event_type"]>(
  eventType: T,
  payload: Record<string, unknown>,
  stepId?: string,
  overrides?: Partial<TelemetryEvent>
): TelemetryEvent {
  return {
    event_id: `evt-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    session_id: "sess-int-1",
    module_id: "shell-navigation",
    student_id: "student-integration",
    step_id: stepId,
    lab_type: "linux_cli",
    event_type: eventType,
    payload,
    ...overrides,
  } as TelemetryEvent;
}

// ============================================================================
// END-TO-END: DESIGN DOC WORKED EXAMPLE (Section 6.5)
// ============================================================================

describe("end-to-end: shell-navigation lab completion", () => {
  const stepIds = ["intro", "navigate-absolute", "navigate-relative", "home-shortcut", "list-files", "path-quiz", "summary"];

  // Simulate the worked example from design doc Section 6.5
  function buildShellNavigationEvents(): TelemetryEvent[] {
    const events: TelemetryEvent[] = [];

    // Session start
    events.push(createEvent("session_started", { attempt_number: 1 }));

    // intro — no skill evidence
    events.push(createEvent("step_started", { step_id: "intro", step_type: "introduction" }, "intro"));
    events.push(createEvent("step_completed", { step_id: "intro", source: "tutor" }, "intro"));

    // navigate-absolute — completed, no hints, first try
    events.push(createEvent("step_started", { step_id: "navigate-absolute", step_type: "task" }, "navigate-absolute"));
    events.push(createEvent("check_passed", { step_id: "navigate-absolute", source: "command" }, "navigate-absolute"));
    events.push(createEvent("step_completed", { step_id: "navigate-absolute", source: "command" }, "navigate-absolute"));

    // navigate-relative — completed, 1 hint
    events.push(createEvent("step_started", { step_id: "navigate-relative", step_type: "task" }, "navigate-relative"));
    events.push(createEvent("hint_requested", { step_id: "navigate-relative", hint_index: 0, total_hints: 3 }, "navigate-relative"));
    events.push(createEvent("check_passed", { step_id: "navigate-relative", source: "command" }, "navigate-relative"));
    events.push(createEvent("step_completed", { step_id: "navigate-relative", source: "command" }, "navigate-relative"));

    // home-shortcut — completed, 2 hints
    events.push(createEvent("step_started", { step_id: "home-shortcut", step_type: "task" }, "home-shortcut"));
    events.push(createEvent("hint_requested", { step_id: "home-shortcut", hint_index: 0, total_hints: 2 }, "home-shortcut"));
    events.push(createEvent("hint_requested", { step_id: "home-shortcut", hint_index: 1, total_hints: 2 }, "home-shortcut"));
    events.push(createEvent("check_passed", { step_id: "home-shortcut", source: "command" }, "home-shortcut"));
    events.push(createEvent("step_completed", { step_id: "home-shortcut", source: "command" }, "home-shortcut"));

    // list-files — completed, viewed solution
    events.push(createEvent("step_started", { step_id: "list-files", step_type: "task" }, "list-files"));
    events.push(createEvent("solution_viewed", { step_id: "list-files" }, "list-files"));
    events.push(createEvent("check_passed", { step_id: "list-files", source: "command" }, "list-files"));
    events.push(createEvent("step_completed", { step_id: "list-files", source: "command" }, "list-files"));

    // path-quiz — correct on first try
    events.push(createEvent("step_started", { step_id: "path-quiz", step_type: "question" }, "path-quiz"));
    events.push(createEvent("question_answered", {
      step_id: "path-quiz", is_correct: true,
      selected_options: ["opt-correct"], correct_options: ["opt-correct"], attempt_number: 1,
    }, "path-quiz"));

    // summary — no skill evidence
    events.push(createEvent("step_started", { step_id: "summary", step_type: "summary" }, "summary"));
    events.push(createEvent("step_completed", { step_id: "summary", source: "tutor" }, "summary"));

    return events;
  }

  test("full pipeline produces correct skill states", () => {
    const events = buildShellNavigationEvents();
    const catalog = loadSkillCatalog("shell-mastery");
    const qmatrix = loadQMatrix("shell-mastery");

    // Step 1: Interpret lab progress (existing infrastructure)
    const labProgress = interpretLabProgress({
      events,
      moduleId: "shell-navigation",
      studentId: "student-integration",
      sessionId: "sess-int-1",
      stepIds,
    });

    // Verify step confidences (scoring includes first-try bonus when check passes on first attempt)
    expect(labProgress.tasks["navigate-absolute"].confidence).toBeCloseTo(1.0, 4);
    expect(labProgress.tasks["navigate-relative"].confidence).toBeCloseTo(0.95, 4); // -0.15 hint +0.10 first-try
    expect(labProgress.tasks["home-shortcut"].confidence).toBeCloseTo(0.80, 4); // -0.30 hints +0.10 first-try
    expect(labProgress.tasks["list-files"].confidence).toBeCloseTo(0.75, 4); // -0.25 solution

    // Step 2: Produce skill evidence via Q-matrix
    const taskEvidenceList = Object.values(labProgress.tasks).map((task) => {
      // Build TaskEvidence from TaskScore (we need the full TaskEvidence shape)
      const stepEvents = events.filter((e) => e.step_id === task.step_id);
      return {
        evidence_id: task.evidence_id,
        timestamp: new Date().toISOString(),
        task_id: task.task_id,
        step_id: task.step_id,
        student_id: "student-integration",
        session_id: "sess-int-1",
        status: task.passed ? "completed" as const : "partial" as const,
        confidence: task.confidence,
        source_event_ids: [],
        validation_results: [],
        modifiers: task.modifiers,
        explanation: "",
        total_attempts: 1,
        hints_revealed: 0,
        solution_viewed: false,
      };
    });

    const skillEvidence = produceSkillEvidence(taskEvidenceList, qmatrix, "shell-navigation");

    // Should produce 6 skill evidence records (matching Q-matrix for shell-navigation)
    expect(skillEvidence.length).toBe(6);

    // Step 3: Compute student skill states
    const states = computeStudentSkillStates(skillEvidence, "student-integration");

    // Verify against design doc worked example
    // shell.nav.absolute-paths: applies, confidence 1.0
    expect(states["shell.nav.absolute-paths"].current_level).toBe("applies");
    expect(states["shell.nav.absolute-paths"].demonstrated).toBeCloseTo(1.0, 2);

    // shell.nav.relative-paths: applies, confidence ~0.90
    // (1.0*0.95 + 0.5*0.80) / (1.0 + 0.5) = 0.90
    expect(states["shell.nav.relative-paths"].current_level).toBe("applies");
    expect(states["shell.nav.relative-paths"].demonstrated).toBeCloseTo(0.90, 2);

    // shell.nav.list-contents: applies, confidence 0.75
    expect(states["shell.nav.list-contents"].current_level).toBe("applies");
    expect(states["shell.nav.list-contents"].demonstrated).toBeCloseTo(0.75, 2);

    // shell.nav.path-concepts: understands, confidence 1.0
    // Question answered correctly first try → confidence 1.0
    expect(states["shell.nav.path-concepts"]).toBeDefined();
    expect(states["shell.nav.path-concepts"].current_level).toBe("understands");
  });

  test("gap analysis for next lab (shell-file-operations)", () => {
    const events = buildShellNavigationEvents();
    const catalog = loadSkillCatalog("shell-mastery");
    const qmatrix = loadQMatrix("shell-mastery");

    // Run pipeline
    const labProgress = interpretLabProgress({
      events,
      moduleId: "shell-navigation",
      studentId: "student-integration",
      sessionId: "sess-int-1",
      stepIds,
    });

    const taskEvidenceList = Object.values(labProgress.tasks).map((task) => ({
      evidence_id: task.evidence_id,
      timestamp: new Date().toISOString(),
      task_id: task.task_id,
      step_id: task.step_id,
      student_id: "student-integration",
      session_id: "sess-int-1",
      status: task.passed ? "completed" as const : "partial" as const,
      confidence: task.confidence,
      source_event_ids: [],
      validation_results: [],
      modifiers: task.modifiers,
      explanation: "",
      total_attempts: 1,
      hints_revealed: 0,
      solution_viewed: false,
    }));

    const skillEvidence = produceSkillEvidence(taskEvidenceList, qmatrix, "shell-navigation");
    const states = computeStudentSkillStates(skillEvidence, "student-integration");

    // Query: what skills does this student need for shell-file-operations?
    const gapAnalysis = getGapAnalysis(states, catalog, qmatrix, "shell-file-operations");

    expect(gapAnalysis.target_lab_id).toBe("shell-file-operations");

    // Student has no file operation skills yet — all should be gaps
    expect(gapAnalysis.gaps.length).toBeGreaterThan(0);

    // The gap skills should include display, search, pipes, redirect, io-concepts
    const gapIds = gapAnalysis.gaps.map((g) => g.skill_id);
    expect(gapIds).toContain("shell.files.display");
    expect(gapIds).toContain("shell.files.search");
    expect(gapIds).toContain("shell.files.pipes");
  });

  test("skills by level shows mastered navigation skills", () => {
    const events = buildShellNavigationEvents();
    const catalog = loadSkillCatalog("shell-mastery");
    const qmatrix = loadQMatrix("shell-mastery");

    const labProgress = interpretLabProgress({
      events,
      moduleId: "shell-navigation",
      studentId: "student-integration",
      sessionId: "sess-int-1",
      stepIds,
    });

    const taskEvidenceList = Object.values(labProgress.tasks).map((task) => ({
      evidence_id: task.evidence_id,
      timestamp: new Date().toISOString(),
      task_id: task.task_id,
      step_id: task.step_id,
      student_id: "student-integration",
      session_id: "sess-int-1",
      status: task.passed ? "completed" as const : "partial" as const,
      confidence: task.confidence,
      source_event_ids: [],
      validation_results: [],
      modifiers: task.modifiers,
      explanation: "",
      total_attempts: 1,
      hints_revealed: 0,
      solution_viewed: false,
    }));

    const skillEvidence = produceSkillEvidence(taskEvidenceList, qmatrix, "shell-navigation");
    const states = computeStudentSkillStates(skillEvidence, "student-integration");

    const byLevel = getSkillsByLevel(states, catalog);

    // 3 navigation skills should be mastered (applies): absolute-paths, relative-paths, list-contents
    expect(byLevel.mastered).toContain("shell.nav.absolute-paths");
    expect(byLevel.mastered).toContain("shell.nav.relative-paths");
    expect(byLevel.mastered).toContain("shell.nav.list-contents");

    // path-concepts is "understands" → in progress
    expect(byLevel.inProgress).toContain("shell.nav.path-concepts");

    // All other skills should be not started (23 remaining)
    expect(byLevel.notStarted.length).toBe(23);
  });
});

describe("end-to-end: persistence round-trip", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "skill-integration-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("save and reload skill profile preserves all state", () => {
    const now = new Date().toISOString();
    const evidence: SkillEvidence[] = [
      {
        evidence_id: "sev-1",
        skill_id: "shell.nav.absolute-paths",
        student_id: "student-persist",
        level: "applies",
        confidence: 1.0,
        weight: 1.0,
        source_type: "lab_step",
        source_id: "shell-navigation:navigate-absolute",
        session_id: "sess-1",
        timestamp: now,
      },
    ];

    const states = computeStudentSkillStates(evidence, "student-persist");

    const profile: StudentSkillProfile = {
      student_id: "student-persist",
      skills: states,
      evidence,
      updated_at: now,
    };

    saveStudentProfile(profile, tempDir);
    const loaded = loadStudentProfile("student-persist", tempDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.skills["shell.nav.absolute-paths"].demonstrated).toBeCloseTo(1.0, 2);
    expect(loaded!.skills["shell.nav.absolute-paths"].current_level).toBe("applies");
    expect(loaded!.evidence.length).toBe(1);
  });
});

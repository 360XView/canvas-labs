// Score Extractor
// Extracts scores from telemetry events using the existing scoring system

import type {
  TelemetryEvent,
  LabProgress,
  HintRequestedEvent,
  SolutionViewedEvent,
} from "../../lab/telemetry/types";
import { interpretLabProgress } from "../../lab/telemetry/evidence-interpreter";
import { getPreset, SCORING_PRESETS } from "../../lab/telemetry/scoring-presets";
import type { TelemetryStats, ScoringBreakdown } from "./types";

// ============================================================================
// SCORE EXTRACTION
// ============================================================================

export interface ExtractScoreOptions {
  events: TelemetryEvent[];
  moduleId: string;
  studentId: string;
  sessionId: string;
  stepIds: string[];
  stepWeights?: Record<string, number>;
  presetId?: string;
}

/**
 * Extract lab progress and scores from telemetry events
 * Uses the existing interpretLabProgress function from the telemetry system
 */
export function extractScore(options: ExtractScoreOptions): LabProgress {
  return interpretLabProgress({
    events: options.events,
    moduleId: options.moduleId,
    studentId: options.studentId,
    sessionId: options.sessionId,
    stepIds: options.stepIds,
    stepWeights: options.stepWeights,
    presetId: options.presetId ?? "partial_credit",
  });
}

/**
 * Extract score with a specific preset, returning the overall score value
 */
export function extractScoreWithPreset(
  events: TelemetryEvent[],
  moduleId: string,
  studentId: string,
  sessionId: string,
  stepIds: string[],
  presetId: string
): number {
  const progress = interpretLabProgress({
    events,
    moduleId,
    studentId,
    sessionId,
    stepIds,
    presetId,
  });

  return progress.overall_score;
}

// ============================================================================
// TELEMETRY STATS
// ============================================================================

/**
 * Calculate statistics from telemetry events
 */
export function calculateTelemetryStats(events: TelemetryEvent[]): TelemetryStats {
  let commandsExecuted = 0;
  let hintsRequested = 0;
  let solutionsViewed = 0;
  let checksPassed = 0;
  let checksFailed = 0;
  let stepsCompleted = 0;
  let stepsStarted = 0;

  for (const event of events) {
    switch (event.event_type) {
      case "command_executed":
      case "student_action":
        commandsExecuted++;
        break;
      case "hint_requested":
        hintsRequested++;
        break;
      case "solution_viewed":
        solutionsViewed++;
        break;
      case "check_passed":
        checksPassed++;
        break;
      case "check_failed":
        checksFailed++;
        break;
      case "step_completed":
        stepsCompleted++;
        break;
      case "step_started":
        stepsStarted++;
        break;
    }
  }

  return {
    totalEvents: events.length,
    commandsExecuted,
    hintsRequested,
    solutionsViewed,
    checksPassed,
    checksFailed,
    stepsCompleted,
    stepsStarted,
  };
}

/**
 * Count hints used (unique step+index combinations)
 */
export function countHintsUsed(events: TelemetryEvent[]): number {
  const hintKeys = new Set<string>();

  for (const event of events) {
    if (event.event_type === "hint_requested") {
      const e = event as HintRequestedEvent;
      hintKeys.add(`${e.payload.step_id}:${e.payload.hint_index}`);
    }
  }

  return hintKeys.size;
}

/**
 * Count solutions viewed (unique steps)
 */
export function countSolutionsViewed(events: TelemetryEvent[]): number {
  const stepIds = new Set<string>();

  for (const event of events) {
    if (event.event_type === "solution_viewed") {
      const e = event as SolutionViewedEvent;
      stepIds.add(e.payload.step_id);
    }
  }

  return stepIds.size;
}

/**
 * Get completed step IDs from events
 */
export function getCompletedSteps(events: TelemetryEvent[]): string[] {
  const completed = new Set<string>();

  for (const event of events) {
    if (event.event_type === "step_completed") {
      const stepId = (event as { payload: { step_id: string } }).payload.step_id;
      completed.add(stepId);
    }
    if (event.event_type === "check_passed") {
      const stepId = (event as { payload: { step_id: string } }).payload.step_id;
      completed.add(stepId);
    }
  }

  return Array.from(completed);
}

// ============================================================================
// SCORING BREAKDOWN
// ============================================================================

/**
 * Get a detailed breakdown of scoring by step
 */
export function getScoringBreakdown(
  events: TelemetryEvent[],
  moduleId: string,
  studentId: string,
  sessionId: string,
  stepIds: string[],
  presetId?: string
): ScoringBreakdown {
  const actualPresetId = presetId ?? "partial_credit";
  const progress = interpretLabProgress({
    events,
    moduleId,
    studentId,
    sessionId,
    stepIds,
    presetId: actualPresetId,
  });

  const steps = stepIds.map((stepId) => {
    const task = progress.tasks[stepId];

    if (!task) {
      return {
        stepId,
        confidence: 0,
        passed: false,
        hintsUsed: 0,
        solutionViewed: false,
        attempts: 0,
        modifiers: [],
      };
    }

    // Count hints for this step
    const stepHints = events.filter(
      (e) =>
        e.event_type === "hint_requested" &&
        (e as HintRequestedEvent).payload.step_id === stepId
    ).length;

    // Check if solution was viewed for this step
    const solutionViewed = events.some(
      (e) =>
        e.event_type === "solution_viewed" &&
        (e as SolutionViewedEvent).payload.step_id === stepId
    );

    // Count check attempts (passed + failed)
    const checkAttempts = events.filter(
      (e) =>
        (e.event_type === "check_passed" || e.event_type === "check_failed") &&
        e.step_id === stepId
    ).length;

    return {
      stepId,
      confidence: task.confidence,
      passed: task.passed,
      hintsUsed: stepHints,
      solutionViewed,
      attempts: checkAttempts,
      modifiers: task.modifiers.map((m) => ({
        kind: m.kind,
        delta: m.delta,
        note: m.note,
      })),
    };
  });

  return {
    presetId: actualPresetId,
    overallScore: progress.overall_score,
    passed: progress.passed,
    completionPct: progress.completion_pct,
    steps,
  };
}

// ============================================================================
// PRESET INFO
// ============================================================================

/**
 * Get available scoring presets
 */
export function getAvailablePresets(): Array<{ id: string; name: string; description: string }> {
  return Object.values(SCORING_PRESETS).map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description,
  }));
}

/**
 * Get pass threshold for a preset
 */
export function getPassThreshold(presetId: string): number {
  const preset = getPreset(presetId);
  return preset.pass_threshold;
}

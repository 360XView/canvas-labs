// Evidence Interpreter
// Derives evidence and scores from immutable telemetry events
// Following event sourcing: all state computed from events

import {
  type TelemetryEvent,
  type TaskEvidence,
  type TaskScore,
  type LabProgress,
  type ScoreTrace,
  type ScoreModifier,
  type ScoringPreset,
  type HintRequestedEvent,
  type SolutionViewedEvent,
  type CheckPassedEvent,
  type CheckFailedEvent,
  type StepStartedEvent,
  type StepCompletedEvent,
  type QuestionAnsweredEvent,
  generateEvidenceId,
} from "./types";
import {
  calculateConfidence,
  calculateOverallScore,
  calculateCompletionPct,
  isPassing,
  getPreset,
} from "./scoring-presets";

// ============================================================================
// STEP METRICS (Intermediate Aggregation)
// ============================================================================

interface StepMetrics {
  stepId: string;
  hintsRevealed: number;
  solutionViewed: boolean;
  checkAttempts: number; // Total check attempts (passed + failed)
  checkPassed: boolean;
  checkPassedAt?: string;
  checkSource?: "command" | "check" | "tutor" | "question";
  startedAt?: string;
  completedAt?: string;
  questionAttempts: number;
  questionCorrect: boolean;
  eventIds: string[];
}

function createEmptyMetrics(stepId: string): StepMetrics {
  return {
    stepId,
    hintsRevealed: 0,
    solutionViewed: false,
    checkAttempts: 0,
    checkPassed: false,
    questionAttempts: 0,
    questionCorrect: false,
    eventIds: [],
  };
}

// ============================================================================
// EVENT AGGREGATION
// ============================================================================

/**
 * Aggregate events by step to calculate metrics
 */
export function aggregateEventsByStep(
  events: TelemetryEvent[],
  sessionId?: string
): Map<string, StepMetrics> {
  const metrics = new Map<string, StepMetrics>();

  // Filter by session if specified
  const filteredEvents = sessionId
    ? events.filter((e) => e.session_id === sessionId)
    : events;

  for (const event of filteredEvents) {
    const stepId = event.step_id;
    if (!stepId) continue;

    if (!metrics.has(stepId)) {
      metrics.set(stepId, createEmptyMetrics(stepId));
    }

    const m = metrics.get(stepId)!;
    m.eventIds.push(event.event_id);

    switch (event.event_type) {
      case "hint_requested": {
        const e = event as HintRequestedEvent;
        // Track highest hint index revealed (0-indexed)
        m.hintsRevealed = Math.max(m.hintsRevealed, e.payload.hint_index + 1);
        break;
      }

      case "solution_viewed": {
        m.solutionViewed = true;
        break;
      }

      case "check_passed": {
        const e = event as CheckPassedEvent;
        m.checkAttempts++;
        m.checkPassed = true;
        m.checkPassedAt = e.timestamp;
        m.checkSource = e.payload.source;
        break;
      }

      case "check_failed": {
        m.checkAttempts++;
        break;
      }

      case "step_started": {
        const e = event as StepStartedEvent;
        if (!m.startedAt) {
          m.startedAt = e.timestamp;
        }
        break;
      }

      case "step_completed": {
        const e = event as StepCompletedEvent;
        m.completedAt = e.timestamp;
        m.checkSource = e.payload.source;
        break;
      }

      case "question_answered": {
        const e = event as QuestionAnsweredEvent;
        m.questionAttempts++;
        if (e.payload.is_correct) {
          m.questionCorrect = true;
          m.checkPassed = true;
          m.checkSource = "question";
          m.completedAt = e.timestamp;
        }
        break;
      }
    }
  }

  return metrics;
}

// ============================================================================
// EVIDENCE GENERATION
// ============================================================================

/**
 * Generate evidence for a single step from its metrics
 */
export function generateStepEvidence(
  metrics: StepMetrics,
  preset: ScoringPreset,
  studentId: string,
  sessionId: string
): TaskEvidence {
  // Calculate retry attempts (attempts after the first that eventually passed)
  const retryAttempts = metrics.checkPassed
    ? Math.max(0, metrics.checkAttempts - 1)
    : metrics.checkAttempts;

  // Determine if this was a first-try success
  const isFirstTrySuccess =
    metrics.checkPassed && metrics.checkAttempts === 1 && !metrics.solutionViewed;

  // Calculate confidence score
  const { confidence, modifiers } = calculateConfidence(
    preset,
    metrics.hintsRevealed,
    metrics.solutionViewed,
    retryAttempts,
    isFirstTrySuccess
  );

  // Determine status
  let status: TaskEvidence["status"];
  if (metrics.checkPassed) {
    status = "completed";
  } else if (metrics.checkAttempts > 0) {
    status = "partial";
  } else if (metrics.startedAt) {
    status = "in_progress";
  } else {
    status = "pending";
  }

  // Calculate time spent
  let timeSpentSeconds: number | undefined;
  if (metrics.startedAt && metrics.completedAt) {
    const start = new Date(metrics.startedAt).getTime();
    const end = new Date(metrics.completedAt).getTime();
    timeSpentSeconds = Math.round((end - start) / 1000);
  }

  // Generate explanation
  const explanation = generateExplanation(metrics, confidence, modifiers);

  return {
    evidence_id: generateEvidenceId(),
    timestamp: new Date().toISOString(),
    task_id: metrics.stepId, // Use stepId as taskId for now
    step_id: metrics.stepId,
    student_id: studentId,
    session_id: sessionId,

    status,
    confidence,

    source_event_ids: metrics.eventIds,
    validation_results: metrics.checkPassed
      ? [
          {
            passed: true,
            timestamp: metrics.checkPassedAt || new Date().toISOString(),
          },
        ]
      : [],
    modifiers,
    explanation,

    started_at: metrics.startedAt,
    completed_at: metrics.completedAt,
    time_spent_seconds: timeSpentSeconds,

    total_attempts: metrics.checkAttempts,
    hints_revealed: metrics.hintsRevealed,
    solution_viewed: metrics.solutionViewed,
  };
}

function generateExplanation(
  metrics: StepMetrics,
  confidence: number,
  modifiers: ScoreModifier[]
): string {
  const parts: string[] = [];

  if (metrics.checkPassed) {
    parts.push(`Completed via ${metrics.checkSource || "unknown"}.`);
  } else if (metrics.checkAttempts > 0) {
    parts.push(`${metrics.checkAttempts} attempt(s), not yet passed.`);
  } else {
    parts.push("Not started or no attempts recorded.");
  }

  if (modifiers.length > 0) {
    const modSummary = modifiers.map((m) => m.note).join(", ");
    parts.push(`Adjustments: ${modSummary}.`);
  }

  parts.push(`Confidence: ${Math.round(confidence * 100)}%`);

  return parts.join(" ");
}

// ============================================================================
// LAB PROGRESS GENERATION
// ============================================================================

export interface InterpretOptions {
  events: TelemetryEvent[];
  moduleId: string;
  studentId: string;
  sessionId: string;
  stepIds: string[]; // All step IDs in the module (for completion tracking)
  stepWeights?: Record<string, number>; // Optional per-step weights
  presetId?: string; // Defaults to "partial_credit"
}

/**
 * Interpret telemetry events to generate lab progress with scores
 */
export function interpretLabProgress(options: InterpretOptions): LabProgress {
  const {
    events,
    moduleId,
    studentId,
    sessionId,
    stepIds,
    stepWeights = {},
    presetId = "partial_credit",
  } = options;

  const preset = getPreset(presetId);

  // Aggregate events by step
  const metricsMap = aggregateEventsByStep(events, sessionId);

  // Generate evidence and scores for each step
  const tasks: Record<string, TaskScore> = {};
  const evidenceMap: Record<string, TaskEvidence> = {};

  for (const stepId of stepIds) {
    const metrics = metricsMap.get(stepId) || createEmptyMetrics(stepId);
    const evidence = generateStepEvidence(metrics, preset, studentId, sessionId);

    evidenceMap[stepId] = evidence;

    tasks[stepId] = {
      task_id: stepId,
      step_id: stepId,
      weight: stepWeights[stepId] ?? 1.0,
      confidence: evidence.confidence,
      modifiers: evidence.modifiers,
      evidence_id: evidence.evidence_id,
      passed: isPassing(evidence.confidence, preset),
    };
  }

  // Calculate overall metrics
  const taskList = Object.values(tasks);
  const completedTasks = taskList.filter((t) => {
    const evidence = evidenceMap[t.step_id];
    return evidence?.status === "completed";
  });

  const overallScore = calculateOverallScore(
    completedTasks.map((t) => ({ confidence: t.confidence, weight: t.weight }))
  );

  const completionPct = calculateCompletionPct(completedTasks.length, stepIds.length);

  // Find timing boundaries
  const sessionEvents = events.filter((e) => e.session_id === sessionId);
  const startedAt =
    sessionEvents.find((e) => e.event_type === "session_started")?.timestamp ||
    sessionEvents[0]?.timestamp ||
    new Date().toISOString();

  const lastActivity =
    sessionEvents[sessionEvents.length - 1]?.timestamp || new Date().toISOString();

  const sessionEndEvent = sessionEvents.find((e) => e.event_type === "session_ended");

  return {
    module_id: moduleId,
    student_id: studentId,
    session_id: sessionId,
    scoring_preset_id: presetId,

    tasks,

    overall_score: overallScore,
    completion_pct: completionPct,
    passed: isPassing(overallScore, preset) && completionPct === 100,

    telemetry_event_count: sessionEvents.length,
    started_at: startedAt,
    last_activity: lastActivity,
    completed_at: sessionEndEvent?.timestamp,
  };
}

// ============================================================================
// SCORE TRACE GENERATION
// ============================================================================

/**
 * Generate a detailed score trace for debugging/transparency
 */
export function generateScoreTrace(
  events: TelemetryEvent[],
  stepId: string,
  sessionId: string,
  studentId: string,
  presetId?: string
): ScoreTrace | null {
  const preset = getPreset(presetId || "partial_credit");

  // Get metrics for this step
  const metricsMap = aggregateEventsByStep(events, sessionId);
  const metrics = metricsMap.get(stepId);

  if (!metrics) {
    return null;
  }

  // Generate evidence
  const evidence = generateStepEvidence(metrics, preset, studentId, sessionId);

  // Build source events summary
  const stepEvents = events.filter(
    (e) => e.step_id === stepId && e.session_id === sessionId
  );

  const sourceEvents = stepEvents.map((e) => ({
    event_id: e.event_id,
    event_type: e.event_type,
    timestamp: e.timestamp,
    summary: summarizeEvent(e),
  }));

  return {
    task_id: stepId,
    step_id: stepId,
    confidence: evidence.confidence,
    base_score: 1.0,
    modifiers: evidence.modifiers,
    evidence_id: evidence.evidence_id,
    source_events: sourceEvents,
    explanation: evidence.explanation,
  };
}

function summarizeEvent(event: TelemetryEvent): string {
  switch (event.event_type) {
    case "hint_requested": {
      const e = event as HintRequestedEvent;
      return `Hint ${e.payload.hint_index + 1} of ${e.payload.total_hints} revealed`;
    }
    case "solution_viewed":
      return "Solution viewed";
    case "check_passed": {
      const e = event as CheckPassedEvent;
      return `Check passed via ${e.payload.source}`;
    }
    case "check_failed":
      return "Check failed";
    case "step_started":
      return "Step started";
    case "step_completed": {
      const e = event as StepCompletedEvent;
      return `Completed via ${e.payload.source}`;
    }
    case "question_answered": {
      const e = event as QuestionAnsweredEvent;
      return e.payload.is_correct ? "Question answered correctly" : "Question answered incorrectly";
    }
    default:
      return event.event_type;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Get all score traces for a session
 */
export function getAllScoreTraces(
  events: TelemetryEvent[],
  stepIds: string[],
  sessionId: string,
  studentId: string,
  presetId?: string
): ScoreTrace[] {
  const traces: ScoreTrace[] = [];

  for (const stepId of stepIds) {
    const trace = generateScoreTrace(events, stepId, sessionId, studentId, presetId);
    if (trace) {
      traces.push(trace);
    }
  }

  return traces;
}

/**
 * Recompute scores with a different preset (replay capability)
 */
export function recomputeWithPreset(
  events: TelemetryEvent[],
  options: Omit<InterpretOptions, "events" | "presetId">,
  newPresetId: string
): LabProgress {
  return interpretLabProgress({
    ...options,
    events,
    presetId: newPresetId,
  });
}

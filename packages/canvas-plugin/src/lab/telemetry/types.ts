// Telemetry Types for Event Sourcing & Scoring
// Following Readiness Radar v3 patterns: immutable events, derived evidence, configurable scoring

import { randomUUID } from "crypto";

// ============================================================================
// LAB TYPE & ACTION KIND (Multi-Lab Support)
// ============================================================================

export type LabType = "linux_cli" | "splunk" | "python";

export type ActionKind =
  | "execute_command"   // Linux CLI
  | "execute_query"     // Splunk SPL
  | "submit_code";      // Python code

// ============================================================================
// TELEMETRY EVENTS (Immutable)
// ============================================================================

export type TelemetryEventType =
  | "command_executed"
  | "file_modified"
  | "hint_requested"
  | "solution_viewed"
  | "check_passed"
  | "check_failed"
  | "question_answered"
  | "step_started"
  | "step_completed"
  | "session_started"
  | "session_ended"
  | "student_action";    // NEW: Unified student action event

export interface TelemetryEventBase {
  event_id: string;
  timestamp: string; // ISO 8601
  session_id: string;
  module_id: string;
  student_id: string;
  step_id?: string;
  lab_type: LabType;  // NEW: Defaults to "linux_cli" for backward compatibility
}

/**
 * @deprecated Use StudentActionEvent instead for unified multi-lab support
 * Kept for backward compatibility with existing Linux CLI labs
 */
export interface CommandExecutedEvent extends TelemetryEventBase {
  event_type: "command_executed";
  lab_type: "linux_cli";  // Always linux_cli for this legacy event
  payload: {
    command: string;
    exit_code?: number;
    cwd?: string;
  };
}

/**
 * NEW: Unified student action event supporting multiple lab types
 * Replaces lab-specific events (CommandExecutedEvent, etc.)
 */
export interface StudentActionEvent extends TelemetryEventBase {
  event_type: "student_action";
  payload: {
    action_kind: ActionKind;
    action: string;              // Command/query/code
    result: "success" | "failure" | "partial";
    exit_code?: number;
    error_message?: string;
    evidence: Record<string, unknown>;  // Lab-specific details
  };
}

export interface HintRequestedEvent extends TelemetryEventBase {
  event_type: "hint_requested";
  payload: {
    step_id: string;
    hint_index: number;
    total_hints: number;
  };
}

export interface SolutionViewedEvent extends TelemetryEventBase {
  event_type: "solution_viewed";
  payload: {
    step_id: string;
  };
}

export interface CheckPassedEvent extends TelemetryEventBase {
  event_type: "check_passed";
  payload: {
    step_id: string;
    check_script?: string;
    source: "command" | "check" | "tutor";
    task_index?: number;
  };
}

export interface CheckFailedEvent extends TelemetryEventBase {
  event_type: "check_failed";
  payload: {
    step_id: string;
    check_script?: string;
    error_message?: string;
    attempt_number: number;
  };
}

export interface QuestionAnsweredEvent extends TelemetryEventBase {
  event_type: "question_answered";
  payload: {
    step_id: string;
    is_correct: boolean;
    selected_options: string[];
    correct_options: string[];
    attempt_number: number;
  };
}

export interface StepStartedEvent extends TelemetryEventBase {
  event_type: "step_started";
  payload: {
    step_id: string;
    step_type: "introduction" | "task" | "question" | "summary";
  };
}

export interface StepCompletedEvent extends TelemetryEventBase {
  event_type: "step_completed";
  payload: {
    step_id: string;
    source: "command" | "check" | "tutor" | "question";
    time_spent_seconds?: number;
  };
}

export interface SessionStartedEvent extends TelemetryEventBase {
  event_type: "session_started";
  payload: {
    attempt_number: number;
  };
}

export interface SessionEndedEvent extends TelemetryEventBase {
  event_type: "session_ended";
  payload: {
    reason: "completed" | "abandoned" | "timeout";
    total_time_seconds: number;
  };
}

/**
 * Tutor utterance event - captured from Claude Code tutor via Stop hooks
 * Used for evaluation and conversation analysis
 */
export interface TutorUtteranceEvent {
  timestamp: string;
  session_id: string;
  claude_session_id: string;
  event_type: "tutor_utterance";
  content: string;
}

export type TelemetryEvent =
  | CommandExecutedEvent
  | StudentActionEvent  // NEW: Unified action event
  | HintRequestedEvent
  | SolutionViewedEvent
  | CheckPassedEvent
  | CheckFailedEvent
  | QuestionAnsweredEvent
  | StepStartedEvent
  | StepCompletedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | TutorUtteranceEvent;

// ============================================================================
// EVIDENCE (Derived from Events)
// ============================================================================

export type TaskStatus = "pending" | "in_progress" | "completed" | "partial" | "failed";

export interface ScoreModifier {
  kind: "hint_used" | "solution_viewed" | "retry_attempt" | "time_penalty" | "first_try_bonus";
  count: number;
  delta: number; // e.g., -0.15 for hint penalty, +0.10 for first try bonus
  note: string;
}

export interface ValidationResult {
  check_script?: string;
  passed: boolean;
  timestamp: string;
  message?: string;
}

export interface TaskEvidence {
  evidence_id: string;
  timestamp: string;
  task_id: string;
  step_id: string;
  student_id: string;
  session_id: string;

  status: TaskStatus;
  confidence: number; // 0.0 - 1.0

  source_event_ids: string[];
  validation_results: ValidationResult[];
  modifiers: ScoreModifier[];
  explanation: string;

  // Timing
  started_at?: string;
  completed_at?: string;
  time_spent_seconds?: number;

  // Attempts
  total_attempts: number;
  hints_revealed: number;
  solution_viewed: boolean;
}

// ============================================================================
// SCORING
// ============================================================================

export interface ScoringModifiers {
  hint_penalty: number; // -0.15 per hint
  solution_penalty: number; // -0.25 for viewing solution
  retry_penalty: number; // -0.10 per retry after first
  time_penalty?: number; // Optional time-based penalty factor
  first_try_bonus: number; // +0.10 for completing on first try
}

export interface ScoringPreset {
  id: "strict" | "partial_credit" | "practice_mode";
  name: string;
  description: string;
  modifiers: ScoringModifiers;
  min_confidence: number; // Floor (0.20 = 20%)
  pass_threshold: number; // 0.70 = 70% to pass
}

// ============================================================================
// TASK & LAB SCORING
// ============================================================================

export interface TaskScore {
  task_id: string;
  step_id: string;
  weight: number; // Task importance (default 1.0)
  confidence: number; // 0.0 - 1.0
  modifiers: ScoreModifier[];
  evidence_id: string;
  passed: boolean;
}

export interface LabProgress {
  module_id: string;
  student_id: string;
  session_id: string;
  scoring_preset_id: string;

  tasks: Record<string, TaskScore>;

  // Derived from tasks
  overall_score: number; // Weighted average
  completion_pct: number; // 0-100
  passed: boolean;

  telemetry_event_count: number;
  started_at: string;
  last_activity: string;
  completed_at?: string;
}

// ============================================================================
// GAP DETECTION
// ============================================================================

export interface GapTemplate {
  id: string;
  condition: GapCondition;
  message: string;
  severity: "info" | "warning" | "critical";
  skill_id?: string;
}

export type GapCondition =
  | { type: "hint_overuse"; min_hints: number }
  | { type: "time_exceeded"; max_seconds: number }
  | { type: "retry_overuse"; min_retries: number }
  | { type: "solution_viewed" }
  | { type: "check_pattern"; pattern: string };

export interface DetectedGap {
  gap_id: string;
  template_id: string;
  step_id: string;
  student_id: string;
  session_id: string;
  timestamp: string;
  message: string;
  severity: "info" | "warning" | "critical";
  skill_id?: string;
}

// ============================================================================
// SCORE TRACE (For Debugging/Transparency)
// ============================================================================

export interface ScoreTrace {
  task_id: string;
  step_id: string;
  confidence: number;
  base_score: number; // Before modifiers
  modifiers: ScoreModifier[];
  evidence_id: string;
  source_events: Array<{
    event_id: string;
    event_type: TelemetryEventType;
    timestamp: string;
    summary: string;
  }>;
  explanation: string;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function generateEventId(): string {
  return `evt-${randomUUID().slice(0, 8)}`;
}

export function generateEvidenceId(): string {
  return `ev-${randomUUID().slice(0, 8)}`;
}

export function generateSessionId(): string {
  return `sess-${randomUUID().slice(0, 8)}`;
}

export function generateGapId(): string {
  return `gap-${randomUUID().slice(0, 8)}`;
}

export function createTelemetryEvent<T extends TelemetryEvent["event_type"]>(
  event_type: T,
  session_id: string,
  module_id: string,
  student_id: string,
  payload: Extract<TelemetryEvent, { event_type: T }>["payload"],
  step_id?: string
): Extract<TelemetryEvent, { event_type: T }> {
  return {
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    session_id,
    module_id,
    student_id,
    step_id,
    event_type,
    payload,
  } as Extract<TelemetryEvent, { event_type: T }>;
}

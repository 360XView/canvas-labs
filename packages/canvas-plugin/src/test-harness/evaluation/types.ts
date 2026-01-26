// Evaluation Types
// Defines how test results are evaluated and reported

import type { LabProgress, TelemetryEvent } from "../../lab/telemetry/types";
import type { Scenario, SuccessCriteria, Checkpoint } from "../scenarios/types";
import type { StudentAction, ActionResult } from "../types";

// ============================================================================
// CHECKPOINT EVALUATION
// ============================================================================

export interface CheckpointStatus {
  checkpointId: string;
  checkpoint: Checkpoint;
  reached: boolean;
  timestamp?: string;
  triggeringEvent?: TelemetryEvent;
  error?: string;
}

export interface CheckpointEvaluation {
  checkpoints: CheckpointStatus[];
  allRequired: boolean;
  allReached: boolean;
  reachedCount: number;
  totalCount: number;
  requiredCount: number;
  requiredReachedCount: number;
}

// ============================================================================
// SUCCESS CRITERIA EVALUATION
// ============================================================================

export interface CriterionResult {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message?: string;
}

export interface SuccessCriteriaEvaluation {
  criteria: CriterionResult[];
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
}

// ============================================================================
// OVERALL EVALUATION
// ============================================================================

export interface EvaluationResult {
  scenario: Scenario;

  // Overall result
  passed: boolean;
  summary: string;

  // Checkpoint evaluation
  checkpoints: CheckpointEvaluation;

  // Criteria evaluation
  successCriteria: SuccessCriteriaEvaluation;

  // Score from telemetry
  labProgress: LabProgress | null;
  score: number;

  // Stats
  actionCount: number;
  durationMs: number;
  hintsUsed: number;
  solutionsViewed: number;

  // Raw data
  events: TelemetryEvent[];
  actions: Array<{ action: StudentAction; result: ActionResult }>;

  // Errors
  errors: string[];
}

// ============================================================================
// ASSERTION TYPES
// ============================================================================

export interface Assertion {
  name: string;
  evaluate: (result: EvaluationContext) => AssertionResult;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface EvaluationContext {
  scenario: Scenario;
  events: TelemetryEvent[];
  labProgress: LabProgress | null;
  checkpointResults: CheckpointStatus[];
  actions: Array<{ action: StudentAction; result: ActionResult }>;
  durationMs: number;
}

// ============================================================================
// TELEMETRY STATS
// ============================================================================

export interface TelemetryStats {
  totalEvents: number;
  commandsExecuted: number;
  hintsRequested: number;
  solutionsViewed: number;
  checksPassed: number;
  checksFailed: number;
  stepsCompleted: number;
  stepsStarted: number;
}

// ============================================================================
// SCORING BREAKDOWN
// ============================================================================

export interface ScoringBreakdown {
  presetId: string;
  overallScore: number;
  passed: boolean;
  completionPct: number;

  steps: Array<{
    stepId: string;
    confidence: number;
    passed: boolean;
    hintsUsed: number;
    solutionViewed: boolean;
    attempts: number;
    modifiers: Array<{ kind: string; delta: number; note: string }>;
  }>;
}

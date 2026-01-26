// Test Harness Core Types
// Driver-agnostic testing framework for Canvas learning labs

import type {
  TelemetryEvent,
  LabProgress,
  LabType,
  ActionKind,
} from "../lab/telemetry/types";
import type { Module, Step } from "../canvases/vta/types";

// ============================================================================
// STUDENT ACTIONS
// ============================================================================

/**
 * Actions a student (or simulated student) can take during a lab
 */
export type StudentAction =
  | CommandAction
  | HintAction
  | SolutionAction
  | WaitAction
  | QuestionAction;

export interface CommandAction {
  type: "command";
  command: string;
  user?: string; // e.g., "root", "student"
}

export interface HintAction {
  type: "hint";
  stepId: string;
  hintIndex: number;
}

export interface SolutionAction {
  type: "solution";
  stepId: string;
}

export interface WaitAction {
  type: "wait";
  durationMs: number;
}

export interface QuestionAction {
  type: "question";
  stepId: string;
  selectedOptions: string[];
}

// ============================================================================
// ACTION RESULTS
// ============================================================================

/**
 * Result of executing a student action
 */
export interface ActionResult {
  action: StudentAction;
  success: boolean;
  exitCode?: number;
  output?: string;
  error?: string;
  timestamp: string;

  // State changes triggered by this action
  completedSteps?: string[];
  passedChecks?: string[];
}

// ============================================================================
// LAB STATE
// ============================================================================

/**
 * Current state of the lab environment
 */
export interface LabState {
  moduleId: string;
  labType: LabType;
  sessionId: string;
  studentId: string;

  // Current user/environment state
  currentUser: string;
  currentWorkingDirectory: string;
  environment: Record<string, string>;

  // Progress tracking
  currentStepIndex: number;
  completedSteps: string[];
  events: TelemetryEvent[];

  // Module info
  module: Module;
  stepIds: string[];
}

// ============================================================================
// TEST RUN OPTIONS & RESULTS
// ============================================================================

export type EnvironmentType = "mock" | "docker" | "tui";

export interface TestRunOptions {
  driver: TestDriver;
  scenario: Scenario;
  environment: EnvironmentType;

  // Optional overrides
  moduleId?: string;
  studentId?: string;
  presetId?: string; // Scoring preset

  // TUI environment options (only used when environment="tui")
  tuiOptions?: {
    shellCommand?: string;
    readyIndicator?: string;
    readyTimeoutMs?: number;
    commandTimeoutMs?: number;
    verbose?: boolean;
  };

  // Callbacks
  onAction?: (action: StudentAction, result: ActionResult) => void;
  onCheckpoint?: (checkpointId: string) => void;
  onLog?: (message: string) => void;
}

export interface TestRunResult {
  scenario: Scenario;
  passed: boolean;

  // Timing
  startedAt: string;
  endedAt: string;
  durationMs: number;

  // Checkpoints
  checkpointResults: CheckpointResult[];
  allCheckpointsPassed: boolean;

  // Scoring
  score: number;
  labProgress: LabProgress | null;

  // Events
  events: TelemetryEvent[];
  actions: Array<{ action: StudentAction; result: ActionResult }>;

  // Success criteria evaluation
  criteriaResults: SuccessCriteriaResult[];

  // Errors
  error?: string;
}

export interface CheckpointResult {
  checkpointId: string;
  passed: boolean;
  timestamp?: string;
  error?: string;
}

export interface SuccessCriteriaResult {
  criterion: string;
  passed: boolean;
  actual: unknown;
  expected: unknown;
  message?: string;
}

// ============================================================================
// SCENARIO TYPES (re-exported from scenarios/types.ts)
// ============================================================================

export type { Scenario, Checkpoint, CheckpointTrigger, SuccessCriteria } from "./scenarios/types";

// ============================================================================
// TEST DRIVER INTERFACE (re-exported from drivers/types.ts)
// ============================================================================

export type { TestDriver, DriverType, DriverContext } from "./drivers/types";

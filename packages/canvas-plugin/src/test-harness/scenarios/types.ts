// Scenario Types
// Defines what to test and how to evaluate success

// ============================================================================
// CHECKPOINT TRIGGERS
// ============================================================================

/**
 * Trigger condition for a checkpoint
 */
export type CheckpointTrigger =
  | StepCompletedTrigger
  | CheckPassedTrigger
  | CommandExecutedTrigger
  | EventOccurredTrigger;

export interface StepCompletedTrigger {
  type: "step_completed";
  stepId: string;
}

export interface CheckPassedTrigger {
  type: "check_passed";
  stepId: string;
  checkScript?: string;
}

export interface CommandExecutedTrigger {
  type: "command_executed";
  pattern: string; // Regex pattern to match command
  exitCode?: number;
}

export interface EventOccurredTrigger {
  type: "event_occurred";
  eventType: string;
  filter?: Record<string, unknown>;
}

// ============================================================================
// CHECKPOINTS
// ============================================================================

/**
 * A checkpoint in the scenario - a milestone to track
 */
export interface Checkpoint {
  id: string;
  trigger: CheckpointTrigger;
  description?: string;
  required?: boolean; // Defaults to true
}

// ============================================================================
// SUCCESS CRITERIA
// ============================================================================

/**
 * Criteria for determining if the test passed
 */
export interface SuccessCriteria {
  /** All checkpoints must be reached */
  allCheckpoints?: boolean;

  /** Minimum overall score (0.0-1.0) */
  minScore?: number;

  /** Maximum hints allowed across entire lab */
  maxHints?: number;

  /** Maximum solutions viewed */
  maxSolutionsViewed?: number;

  /** Must complete within timeout */
  withinTimeout?: boolean;

  /** Maximum actions allowed */
  maxActions?: number;

  /** Custom criteria as key-value assertions */
  custom?: Record<string, unknown>;
}

// ============================================================================
// SCENARIO
// ============================================================================

/**
 * A test scenario defines what to test and how to evaluate
 */
export interface Scenario {
  id: string;
  name: string;
  description?: string;

  /** Module to test against */
  moduleId: string;

  /** Checkpoints to track during the test */
  checkpoints: Checkpoint[];

  /** Criteria for passing the test */
  successCriteria: SuccessCriteria;

  /** Maximum time allowed for the test in milliseconds */
  timeoutMs: number;

  /** Maximum number of actions before stopping */
  maxActions: number;

  /** Optional scripted actions (for scripted scenarios) */
  actions?: ScriptedAction[];

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SCRIPTED ACTIONS (for YAML scenarios)
// ============================================================================

/**
 * Action defined in scenario YAML
 */
export type ScriptedAction =
  | { type: "command"; command: string; user?: string }
  | { type: "hint"; stepId: string; hintIndex: number }
  | { type: "solution"; stepId: string }
  | { type: "wait"; durationMs: number }
  | { type: "question"; stepId: string; selectedOptions: string[] };

// ============================================================================
// YAML SCHEMA (for parsing)
// ============================================================================

/**
 * Raw YAML structure for scenario files
 */
export interface YamlScenario {
  id: string;
  name: string;
  description?: string;
  moduleId: string;
  checkpoints: YamlCheckpoint[];
  successCriteria: SuccessCriteria;
  timeoutMs?: number;
  maxActions?: number;
  actions?: ScriptedAction[];
  metadata?: Record<string, unknown>;
}

export interface YamlCheckpoint {
  id: string;
  trigger: YamlTrigger;
  description?: string;
  required?: boolean;
}

export type YamlTrigger =
  | { type: "step_completed"; stepId: string }
  | { type: "check_passed"; stepId: string; checkScript?: string }
  | { type: "command_executed"; pattern: string; exitCode?: number }
  | { type: "event_occurred"; eventType: string; filter?: Record<string, unknown> };

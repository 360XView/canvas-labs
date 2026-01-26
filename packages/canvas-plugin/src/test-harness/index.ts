// Test Harness for Canvas Learning System
// Driver-agnostic testing framework for validating lab behavior

// ============================================================================
// CORE TYPES
// ============================================================================

export type {
  // Student actions
  StudentAction,
  CommandAction,
  HintAction,
  SolutionAction,
  WaitAction,
  QuestionAction,

  // Action results
  ActionResult,

  // Lab state
  LabState,

  // Test run
  EnvironmentType,
  TestRunOptions,
  TestRunResult,
  CheckpointResult,
  SuccessCriteriaResult,
} from "./types";

// ============================================================================
// DRIVER TYPES & IMPLEMENTATIONS
// ============================================================================

export type {
  TestDriver,
  DriverType,
  DriverContext,
  DriverFactory,
} from "./drivers/types";

export {
  ScriptedDriver,
  createScriptedDriver,
  createLinuxUserMgmtHappyPath,
  type ScriptedDriverOptions,
} from "./drivers/scripted-driver";

// ============================================================================
// SCENARIO TYPES & LOADER
// ============================================================================

export type {
  Scenario,
  Checkpoint,
  CheckpointTrigger,
  StepCompletedTrigger,
  CheckPassedTrigger,
  CommandExecutedTrigger,
  EventOccurredTrigger,
  SuccessCriteria,
  ScriptedAction,
  YamlScenario,
  YamlCheckpoint,
  YamlTrigger,
} from "./scenarios/types";

export {
  loadScenario,
  loadScenarioFromPath,
  loadScenarioFromYaml,
  listScenarios,
  getScenarioInfo,
  createScenario,
  stepCheckpoint,
} from "./scenarios/loader";

// ============================================================================
// ENVIRONMENT
// ============================================================================

export {
  createMockEnvironment,
  type MockEnvironment,
  type MockEnvironmentOptions,
} from "./environment/mock-environment";

export {
  createTUIEnvironment,
  type TUIEnvironment,
  type TUIEnvironmentOptions,
} from "./environment/tui-environment";

// ============================================================================
// EVALUATION
// ============================================================================

export type {
  CheckpointStatus,
  CheckpointEvaluation,
  CriterionResult,
  SuccessCriteriaEvaluation,
  EvaluationResult,
  EvaluationContext,
  TelemetryStats,
  ScoringBreakdown,
  Assertion,
  AssertionResult,
} from "./evaluation/types";

export {
  extractScore,
  extractScoreWithPreset,
  calculateTelemetryStats,
  countHintsUsed,
  countSolutionsViewed,
  getCompletedSteps,
  getScoringBreakdown,
  getAvailablePresets,
  getPassThreshold,
  type ExtractScoreOptions,
} from "./evaluation/score-extractor";

export {
  evaluateCheckpoints,
  evaluateSuccessCriteria,
  evaluateTestRun,
  createAssertion,
  assertMinScore,
  assertAllCheckpoints,
  assertNoSolutions,
  assertMaxHints,
} from "./evaluation/assertion-evaluator";

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export {
  TestOrchestrator,
  runScriptedTest,
  runScenarioWithActions,
  type OrchestratorOptions,
} from "./orchestrator/orchestrator";

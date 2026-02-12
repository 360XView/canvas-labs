// Evaluation scenario types
// Used for scripted lab sessions and baseline capture

/** A single action in a scripted scenario */
export type ScenarioAction =
  | { type: "command"; command: string; description: string }
  | { type: "vta_hint"; stepId: string; hintIndex: number; totalHints: number }
  | { type: "vta_solution"; stepId: string }
  | { type: "vta_step_view"; stepId: string; stepType: "introduction" | "task" | "question" | "summary" }
  | { type: "wait"; seconds: number; description: string }
  | { type: "wait_for_step"; stepId: string; timeoutSeconds: number };

/** A complete scripted scenario */
export interface ScenarioDefinition {
  id: string;
  moduleId: string;
  description: string;
  /** Step IDs from module.yaml, in order */
  stepIds: string[];
  /** Scripted actions to execute in order */
  actions: ScenarioAction[];
}

/** Result of running a scenario */
export interface ScenarioResult {
  scenarioId: string;
  moduleId: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  logDir: string;
  /** Whether all actions completed without error */
  success: boolean;
  /** Errors encountered during the run */
  errors: string[];
  /** Steps that were completed */
  completedSteps: string[];
}

/** Expected artifacts from a scenario run */
export const EXPECTED_ARTIFACTS = [
  "telemetry.jsonl",
  "state.json",
  "commands.log",
  "checks.log",
] as const;

/** Optional artifacts (may not exist in headless mode) */
export const OPTIONAL_ARTIFACTS = [
  "tutor-speech.jsonl",
  "terminal.log",
] as const;

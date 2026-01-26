// Test Orchestrator
// Runs test sessions by coordinating drivers, environments, and evaluation

import type { Module } from "../../canvases/vta/types";
import type { TelemetryEvent, LabProgress } from "../../lab/telemetry/types";
import { loadModule } from "../../lab/module-loader";
import type { TestDriver, DriverContext } from "../drivers/types";
import type { Scenario } from "../scenarios/types";
import type {
  StudentAction,
  ActionResult,
  LabState,
  TestRunOptions,
  TestRunResult,
  CheckpointResult,
  EnvironmentType,
} from "../types";
import {
  createMockEnvironment,
  type MockEnvironment,
} from "../environment/mock-environment";
import {
  createTUIEnvironment,
  type TUIEnvironment,
  type TUIEnvironmentOptions,
} from "../environment/tui-environment";
import { extractScore } from "../evaluation/score-extractor";
import {
  evaluateCheckpoints,
  evaluateSuccessCriteria,
  evaluateTestRun,
} from "../evaluation/assertion-evaluator";
import type { EvaluationResult } from "../evaluation/types";

// ============================================================================
// ORCHESTRATOR OPTIONS
// ============================================================================

export interface OrchestratorOptions {
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export class TestOrchestrator {
  private onLog?: (message: string) => void;
  private onError?: (error: Error) => void;

  constructor(options: OrchestratorOptions = {}) {
    this.onLog = options.onLog;
    this.onError = options.onError;
  }

  /**
   * Run a test scenario with the given driver and environment
   */
  async run(options: TestRunOptions): Promise<TestRunResult> {
    const {
      driver,
      scenario,
      environment: envType,
      moduleId = scenario.moduleId,
      studentId = "test-student",
      presetId = "partial_credit",
      onAction,
      onCheckpoint,
      onLog,
    } = options;

    const log = (msg: string) => {
      this.onLog?.(msg);
      onLog?.(msg);
    };

    const startedAt = new Date();
    let error: string | undefined;

    // Track actions and results
    const actions: Array<{ action: StudentAction; result: ActionResult }> = [];
    const checkpointResults: CheckpointResult[] = scenario.checkpoints.map((cp) => ({
      checkpointId: cp.id,
      passed: false,
    }));

    // Load module
    let module: Module;
    try {
      module = loadModule(moduleId);
      log(`Loaded module: ${module.title} (${moduleId})`);
    } catch (err) {
      const msg = `Failed to load module ${moduleId}: ${err instanceof Error ? err.message : String(err)}`;
      log(msg);
      return this.createErrorResult(scenario, startedAt, msg);
    }

    // Create environment
    // Both MockEnvironment and TUIEnvironment implement the same interface
    let env: MockEnvironment | TUIEnvironment;
    if (envType === "mock") {
      env = createMockEnvironment({
        moduleId,
        studentId,
        labType: module.labType,
        onLog: log,
      });
    } else if (envType === "tui") {
      env = createTUIEnvironment({
        moduleId,
        studentId,
        labType: module.labType,
        onLog: log,
        ...options.tuiOptions,
      });
    } else {
      // Docker environment not implemented yet
      return this.createErrorResult(
        scenario,
        startedAt,
        `Environment type "${envType}" not yet implemented`
      );
    }

    try {
      // Initialize environment
      await env.initialize(module);
      log(`Environment initialized`);

      // Initialize driver
      const driverContext: DriverContext = {
        scenario,
        module,
        sessionId: env.getState().sessionId,
        studentId,
        onLog: log,
      };

      await driver.initialize(driverContext);
      log(`Driver initialized: ${driver.type} (${driver.id})`);

      // Main execution loop
      let actionCount = 0;
      const timeoutAt = startedAt.getTime() + scenario.timeoutMs;

      while (actionCount < scenario.maxActions) {
        // Check timeout
        if (Date.now() > timeoutAt) {
          log(`Timeout reached after ${actionCount} actions`);
          error = "Timeout exceeded";
          break;
        }

        // Get current state
        const state = env.getState();

        // Get next action from driver
        const action = await driver.nextAction(state);

        if (action === null) {
          log(`Driver returned null - sequence complete after ${actionCount} actions`);
          break;
        }

        actionCount++;
        log(`Action ${actionCount}: ${formatAction(action)}`);

        // Execute action
        const result = await env.executeAction(action);
        actions.push({ action, result });

        // Notify driver of result
        await driver.onActionResult(action, result);

        // Notify callback
        onAction?.(action, result);

        // Check for checkpoint completion
        if (result.completedSteps) {
          for (const stepId of result.completedSteps) {
            // Find checkpoint matching this step
            const cpIndex = scenario.checkpoints.findIndex(
              (cp) =>
                cp.trigger.type === "step_completed" && cp.trigger.stepId === stepId
            );

            if (cpIndex !== -1 && !checkpointResults[cpIndex].passed) {
              checkpointResults[cpIndex].passed = true;
              checkpointResults[cpIndex].timestamp = result.timestamp;
              log(`Checkpoint reached: ${scenario.checkpoints[cpIndex].id}`);
              onCheckpoint?.(scenario.checkpoints[cpIndex].id);
            }
          }
        }

        // Check if all required checkpoints are reached
        const allRequired = scenario.checkpoints
          .filter((cp) => cp.required !== false)
          .every((cp) => {
            const cpResult = checkpointResults.find((r) => r.checkpointId === cp.id);
            return cpResult?.passed;
          });

        if (allRequired) {
          log(`All required checkpoints reached`);
          break;
        }
      }

      // Clean up driver
      await driver.dispose();
      log(`Driver disposed`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      log(`Error during execution: ${error}`);
      this.onError?.(err instanceof Error ? err : new Error(String(err)));
    }

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();

    // Get final events
    const events = env.getEvents();

    // Calculate score
    let labProgress: LabProgress | null = null;
    try {
      const stepIds = module.steps.map((s) => s.id);
      labProgress = extractScore({
        events,
        moduleId,
        studentId,
        sessionId: env.getState().sessionId,
        stepIds,
        presetId,
      });
    } catch (err) {
      log(`Error calculating score: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Clean up environment (TUI environment has async dispose)
    if ("dispose" in env && typeof env.dispose === "function") {
      await Promise.resolve(env.dispose());
    }

    // Evaluate checkpoints from events (more accurate than tracking during execution)
    const checkpointEvaluation = evaluateCheckpoints(scenario, events);

    // Update checkpoint results from evaluation
    for (const cp of checkpointEvaluation.checkpoints) {
      const result = checkpointResults.find((r) => r.checkpointId === cp.checkpointId);
      if (result) {
        result.passed = cp.reached;
        result.timestamp = cp.timestamp;
      }
    }

    // Evaluate success criteria
    const criteriaEvaluation = evaluateSuccessCriteria(scenario.successCriteria, {
      checkpointEvaluation,
      labProgress,
      events,
      actions,
      durationMs,
      timeoutMs: scenario.timeoutMs,
    });

    // Determine overall pass/fail
    const passed =
      !error &&
      checkpointEvaluation.allRequired &&
      criteriaEvaluation.allPassed;

    log(`Test ${passed ? "PASSED" : "FAILED"}`);
    if (labProgress) {
      log(`Score: ${(labProgress.overall_score * 100).toFixed(1)}%`);
    }

    return {
      scenario,
      passed,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs,
      checkpointResults,
      allCheckpointsPassed: checkpointEvaluation.allRequired,
      score: labProgress?.overall_score ?? 0,
      labProgress,
      events,
      actions,
      criteriaResults: criteriaEvaluation.criteria.map((c) => ({
        criterion: c.name,
        passed: c.passed,
        actual: c.actual,
        expected: c.expected,
        message: c.message,
      })),
      error,
    };
  }

  /**
   * Run and return full evaluation result
   */
  async runWithEvaluation(options: TestRunOptions): Promise<EvaluationResult> {
    const result = await this.run(options);

    return evaluateTestRun({
      scenario: result.scenario,
      events: result.events,
      labProgress: result.labProgress,
      actions: result.actions,
      durationMs: result.durationMs,
      error: result.error,
    });
  }

  private createErrorResult(
    scenario: Scenario,
    startedAt: Date,
    error: string
  ): TestRunResult {
    return {
      scenario,
      passed: false,
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      checkpointResults: scenario.checkpoints.map((cp) => ({
        checkpointId: cp.id,
        passed: false,
        error,
      })),
      allCheckpointsPassed: false,
      score: 0,
      labProgress: null,
      events: [],
      actions: [],
      criteriaResults: [],
      error,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatAction(action: StudentAction): string {
  switch (action.type) {
    case "command":
      return `command: "${action.command}"`;
    case "hint":
      return `hint: step=${action.stepId} index=${action.hintIndex}`;
    case "solution":
      return `solution: step=${action.stepId}`;
    case "wait":
      return `wait: ${action.durationMs}ms`;
    case "question":
      return `question: step=${action.stepId} options=[${action.selectedOptions.join(", ")}]`;
    default:
      return `unknown action`;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Run a test with a scripted driver
 */
export async function runScriptedTest(options: {
  scenario: Scenario;
  actions: StudentAction[];
  environment?: EnvironmentType;
  presetId?: string;
  onLog?: (message: string) => void;
}): Promise<TestRunResult> {
  const { ScriptedDriver } = await import("../drivers/scripted-driver");

  const driver = new ScriptedDriver(options.actions);
  const orchestrator = new TestOrchestrator({ onLog: options.onLog });

  return orchestrator.run({
    driver,
    scenario: options.scenario,
    environment: options.environment ?? "mock",
    presetId: options.presetId,
    onLog: options.onLog,
  });
}

/**
 * Run a scenario that includes scripted actions
 */
export async function runScenarioWithActions(options: {
  scenario: Scenario;
  environment?: EnvironmentType;
  presetId?: string;
  onLog?: (message: string) => void;
}): Promise<TestRunResult> {
  const { scenario } = options;

  if (!scenario.actions || scenario.actions.length === 0) {
    throw new Error(`Scenario "${scenario.id}" has no actions defined`);
  }

  // Convert ScriptedAction to StudentAction
  const actions: StudentAction[] = scenario.actions.map((a) => {
    switch (a.type) {
      case "command":
        return { type: "command", command: a.command, user: a.user };
      case "hint":
        return { type: "hint", stepId: a.stepId, hintIndex: a.hintIndex };
      case "solution":
        return { type: "solution", stepId: a.stepId };
      case "wait":
        return { type: "wait", durationMs: a.durationMs };
      case "question":
        return { type: "question", stepId: a.stepId, selectedOptions: a.selectedOptions };
      default:
        throw new Error(`Unknown action type: ${(a as { type: string }).type}`);
    }
  });

  return runScriptedTest({
    ...options,
    actions,
  });
}

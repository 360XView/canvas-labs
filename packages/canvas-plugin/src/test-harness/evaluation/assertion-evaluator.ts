// Assertion Evaluator
// Evaluates programmatic assertions on test results

import type {
  TelemetryEvent,
  LabProgress,
  StepCompletedEvent,
  CheckPassedEvent,
  CommandExecutedEvent,
  StudentActionEvent,
} from "../../lab/telemetry/types";
import type {
  Scenario,
  Checkpoint,
  CheckpointTrigger,
  SuccessCriteria,
} from "../scenarios/types";
import type { StudentAction, ActionResult } from "../types";
import type {
  CheckpointStatus,
  CheckpointEvaluation,
  CriterionResult,
  SuccessCriteriaEvaluation,
  EvaluationResult,
  EvaluationContext,
} from "./types";
import {
  calculateTelemetryStats,
  countHintsUsed,
  countSolutionsViewed,
} from "./score-extractor";

// ============================================================================
// CHECKPOINT EVALUATION
// ============================================================================

/**
 * Check if a checkpoint trigger has been satisfied by events
 */
function evaluateTrigger(
  trigger: CheckpointTrigger,
  events: TelemetryEvent[]
): { reached: boolean; timestamp?: string; event?: TelemetryEvent } {
  switch (trigger.type) {
    case "step_completed": {
      const event = events.find(
        (e) =>
          e.event_type === "step_completed" &&
          (e as StepCompletedEvent).payload.step_id === trigger.stepId
      );
      return {
        reached: !!event,
        timestamp: event?.timestamp,
        event,
      };
    }

    case "check_passed": {
      const event = events.find((e) => {
        if (e.event_type !== "check_passed") return false;
        const cp = e as CheckPassedEvent;
        if (cp.payload.step_id !== trigger.stepId) return false;
        if (trigger.checkScript && cp.payload.check_script !== trigger.checkScript) {
          return false;
        }
        return true;
      });
      return {
        reached: !!event,
        timestamp: event?.timestamp,
        event,
      };
    }

    case "command_executed": {
      const pattern = new RegExp(trigger.pattern);
      const event = events.find((e) => {
        if (e.event_type === "command_executed") {
          const ce = e as CommandExecutedEvent;
          if (!pattern.test(ce.payload.command)) return false;
          if (trigger.exitCode !== undefined && ce.payload.exit_code !== trigger.exitCode) {
            return false;
          }
          return true;
        }
        if (e.event_type === "student_action") {
          const sa = e as StudentActionEvent;
          if (sa.payload.action_kind !== "execute_command") return false;
          if (!pattern.test(sa.payload.action)) return false;
          if (trigger.exitCode !== undefined && sa.payload.exit_code !== trigger.exitCode) {
            return false;
          }
          return true;
        }
        return false;
      });
      return {
        reached: !!event,
        timestamp: event?.timestamp,
        event,
      };
    }

    case "event_occurred": {
      const event = events.find((e) => {
        if (e.event_type !== trigger.eventType) return false;
        if (trigger.filter) {
          // Check that all filter keys match
          for (const [key, value] of Object.entries(trigger.filter)) {
            const eventValue = (e as Record<string, unknown>)[key] ||
              ((e as { payload?: Record<string, unknown> }).payload)?.[key];
            if (eventValue !== value) return false;
          }
        }
        return true;
      });
      return {
        reached: !!event,
        timestamp: event?.timestamp,
        event,
      };
    }

    default:
      return { reached: false };
  }
}

/**
 * Evaluate all checkpoints against events
 */
export function evaluateCheckpoints(
  scenario: Scenario,
  events: TelemetryEvent[]
): CheckpointEvaluation {
  const checkpoints: CheckpointStatus[] = scenario.checkpoints.map((cp) => {
    const result = evaluateTrigger(cp.trigger, events);
    return {
      checkpointId: cp.id,
      checkpoint: cp,
      reached: result.reached,
      timestamp: result.timestamp,
      triggeringEvent: result.event,
    };
  });

  const requiredCheckpoints = checkpoints.filter((cp) => cp.checkpoint.required !== false);

  return {
    checkpoints,
    allRequired: requiredCheckpoints.every((cp) => cp.reached),
    allReached: checkpoints.every((cp) => cp.reached),
    reachedCount: checkpoints.filter((cp) => cp.reached).length,
    totalCount: checkpoints.length,
    requiredCount: requiredCheckpoints.length,
    requiredReachedCount: requiredCheckpoints.filter((cp) => cp.reached).length,
  };
}

// ============================================================================
// SUCCESS CRITERIA EVALUATION
// ============================================================================

/**
 * Evaluate success criteria against test results
 */
export function evaluateSuccessCriteria(
  criteria: SuccessCriteria,
  context: {
    checkpointEvaluation: CheckpointEvaluation;
    labProgress: LabProgress | null;
    events: TelemetryEvent[];
    actions: Array<{ action: StudentAction; result: ActionResult }>;
    durationMs: number;
    timeoutMs: number;
  }
): SuccessCriteriaEvaluation {
  const results: CriterionResult[] = [];

  // All checkpoints
  if (criteria.allCheckpoints !== undefined) {
    results.push({
      name: "allCheckpoints",
      passed: context.checkpointEvaluation.allRequired,
      expected: true,
      actual: context.checkpointEvaluation.allRequired,
      message: context.checkpointEvaluation.allRequired
        ? `All ${context.checkpointEvaluation.requiredCount} required checkpoints reached`
        : `Only ${context.checkpointEvaluation.requiredReachedCount}/${context.checkpointEvaluation.requiredCount} required checkpoints reached`,
    });
  }

  // Minimum score
  if (criteria.minScore !== undefined) {
    const actualScore = context.labProgress?.overall_score ?? 0;
    results.push({
      name: "minScore",
      passed: actualScore >= criteria.minScore,
      expected: criteria.minScore,
      actual: actualScore,
      message: `Score: ${(actualScore * 100).toFixed(1)}% (minimum: ${(criteria.minScore * 100).toFixed(1)}%)`,
    });
  }

  // Max hints
  if (criteria.maxHints !== undefined) {
    const hintsUsed = countHintsUsed(context.events);
    results.push({
      name: "maxHints",
      passed: hintsUsed <= criteria.maxHints,
      expected: criteria.maxHints,
      actual: hintsUsed,
      message: `Hints used: ${hintsUsed} (maximum: ${criteria.maxHints})`,
    });
  }

  // Max solutions viewed
  if (criteria.maxSolutionsViewed !== undefined) {
    const solutionsViewed = countSolutionsViewed(context.events);
    results.push({
      name: "maxSolutionsViewed",
      passed: solutionsViewed <= criteria.maxSolutionsViewed,
      expected: criteria.maxSolutionsViewed,
      actual: solutionsViewed,
      message: `Solutions viewed: ${solutionsViewed} (maximum: ${criteria.maxSolutionsViewed})`,
    });
  }

  // Within timeout
  if (criteria.withinTimeout) {
    const withinTimeout = context.durationMs <= context.timeoutMs;
    results.push({
      name: "withinTimeout",
      passed: withinTimeout,
      expected: context.timeoutMs,
      actual: context.durationMs,
      message: `Duration: ${context.durationMs}ms (timeout: ${context.timeoutMs}ms)`,
    });
  }

  // Max actions
  if (criteria.maxActions !== undefined) {
    const actionCount = context.actions.length;
    results.push({
      name: "maxActions",
      passed: actionCount <= criteria.maxActions,
      expected: criteria.maxActions,
      actual: actionCount,
      message: `Actions: ${actionCount} (maximum: ${criteria.maxActions})`,
    });
  }

  return {
    criteria: results,
    allPassed: results.every((r) => r.passed),
    passedCount: results.filter((r) => r.passed).length,
    totalCount: results.length,
  };
}

// ============================================================================
// FULL EVALUATION
// ============================================================================

/**
 * Perform full evaluation of a test run
 */
export function evaluateTestRun(context: {
  scenario: Scenario;
  events: TelemetryEvent[];
  labProgress: LabProgress | null;
  actions: Array<{ action: StudentAction; result: ActionResult }>;
  durationMs: number;
  error?: string;
}): EvaluationResult {
  const { scenario, events, labProgress, actions, durationMs, error } = context;

  // Evaluate checkpoints
  const checkpointEvaluation = evaluateCheckpoints(scenario, events);

  // Evaluate success criteria
  const criteriaEvaluation = evaluateSuccessCriteria(scenario.successCriteria, {
    checkpointEvaluation,
    labProgress,
    events,
    actions,
    durationMs,
    timeoutMs: scenario.timeoutMs,
  });

  // Calculate stats
  const stats = calculateTelemetryStats(events);
  const hintsUsed = countHintsUsed(events);
  const solutionsViewed = countSolutionsViewed(events);

  // Determine overall pass/fail
  const passed =
    !error &&
    checkpointEvaluation.allRequired &&
    criteriaEvaluation.allPassed;

  // Generate summary
  const summaryParts: string[] = [];
  if (passed) {
    summaryParts.push("PASSED");
  } else {
    summaryParts.push("FAILED");
  }
  summaryParts.push(`Score: ${((labProgress?.overall_score ?? 0) * 100).toFixed(1)}%`);
  summaryParts.push(`Checkpoints: ${checkpointEvaluation.reachedCount}/${checkpointEvaluation.totalCount}`);
  summaryParts.push(`Duration: ${durationMs}ms`);

  // Collect errors
  const errors: string[] = [];
  if (error) {
    errors.push(error);
  }
  for (const criterion of criteriaEvaluation.criteria) {
    if (!criterion.passed) {
      errors.push(`Criterion "${criterion.name}" failed: ${criterion.message}`);
    }
  }
  for (const cp of checkpointEvaluation.checkpoints) {
    if (!cp.reached && cp.checkpoint.required !== false) {
      errors.push(`Required checkpoint "${cp.checkpointId}" not reached`);
    }
  }

  return {
    scenario,
    passed,
    summary: summaryParts.join(" | "),

    checkpoints: checkpointEvaluation,
    successCriteria: criteriaEvaluation,

    labProgress,
    score: labProgress?.overall_score ?? 0,

    actionCount: actions.length,
    durationMs,
    hintsUsed,
    solutionsViewed,

    events,
    actions,

    errors,
  };
}

// ============================================================================
// CUSTOM ASSERTIONS
// ============================================================================

/**
 * Create a custom assertion
 */
export function createAssertion(
  name: string,
  evaluate: (context: EvaluationContext) => { passed: boolean; message?: string; expected?: unknown; actual?: unknown }
): {
  name: string;
  evaluate: (context: EvaluationContext) => { name: string; passed: boolean; message?: string; expected?: unknown; actual?: unknown };
} {
  return {
    name,
    evaluate: (context) => ({
      name,
      ...evaluate(context),
    }),
  };
}

/**
 * Assert minimum score
 */
export function assertMinScore(minScore: number) {
  return createAssertion(`minScore(${minScore})`, (context) => {
    const actual = context.labProgress?.overall_score ?? 0;
    return {
      passed: actual >= minScore,
      expected: minScore,
      actual,
      message: `Score ${(actual * 100).toFixed(1)}% ${actual >= minScore ? ">=" : "<"} ${(minScore * 100).toFixed(1)}%`,
    };
  });
}

/**
 * Assert all checkpoints reached
 */
export function assertAllCheckpoints() {
  return createAssertion("allCheckpoints", (context) => {
    const reached = context.checkpointResults.filter((c) => c.reached).length;
    const total = context.checkpointResults.length;
    return {
      passed: reached === total,
      expected: total,
      actual: reached,
      message: `${reached}/${total} checkpoints reached`,
    };
  });
}

/**
 * Assert no solutions viewed
 */
export function assertNoSolutions() {
  return createAssertion("noSolutions", (context) => {
    const count = countSolutionsViewed(context.events);
    return {
      passed: count === 0,
      expected: 0,
      actual: count,
      message: `${count} solutions viewed`,
    };
  });
}

/**
 * Assert max hints used
 */
export function assertMaxHints(max: number) {
  return createAssertion(`maxHints(${max})`, (context) => {
    const count = countHintsUsed(context.events);
    return {
      passed: count <= max,
      expected: max,
      actual: count,
      message: `${count} hints used (max: ${max})`,
    };
  });
}

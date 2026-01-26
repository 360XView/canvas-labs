// Scenario Loader
// Loads test scenarios from YAML files

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import * as yaml from "js-yaml";
import type {
  Scenario,
  Checkpoint,
  CheckpointTrigger,
  SuccessCriteria,
  YamlScenario,
  YamlCheckpoint,
  YamlTrigger,
  ScriptedAction,
} from "./types";

// ============================================================================
// PATHS
// ============================================================================

const SCENARIOS_DIR = join(dirname(__filename), "built-in");

// ============================================================================
// VALIDATION
// ============================================================================

class ScenarioValidationError extends Error {
  constructor(message: string, public scenarioId?: string) {
    super(scenarioId ? `[${scenarioId}] ${message}` : message);
    this.name = "ScenarioValidationError";
  }
}

function validateTrigger(trigger: YamlTrigger, checkpointId: string): CheckpointTrigger {
  if (!trigger || typeof trigger !== "object") {
    throw new ScenarioValidationError(`Invalid trigger for checkpoint ${checkpointId}`);
  }

  if (!trigger.type) {
    throw new ScenarioValidationError(`Missing trigger type for checkpoint ${checkpointId}`);
  }

  switch (trigger.type) {
    case "step_completed":
      if (!trigger.stepId) {
        throw new ScenarioValidationError(`step_completed trigger requires stepId for checkpoint ${checkpointId}`);
      }
      return { type: "step_completed", stepId: trigger.stepId };

    case "check_passed":
      if (!trigger.stepId) {
        throw new ScenarioValidationError(`check_passed trigger requires stepId for checkpoint ${checkpointId}`);
      }
      return {
        type: "check_passed",
        stepId: trigger.stepId,
        checkScript: trigger.checkScript,
      };

    case "command_executed":
      if (!trigger.pattern) {
        throw new ScenarioValidationError(`command_executed trigger requires pattern for checkpoint ${checkpointId}`);
      }
      return {
        type: "command_executed",
        pattern: trigger.pattern,
        exitCode: trigger.exitCode,
      };

    case "event_occurred":
      if (!trigger.eventType) {
        throw new ScenarioValidationError(`event_occurred trigger requires eventType for checkpoint ${checkpointId}`);
      }
      return {
        type: "event_occurred",
        eventType: trigger.eventType,
        filter: trigger.filter,
      };

    default:
      throw new ScenarioValidationError(`Unknown trigger type: ${(trigger as YamlTrigger).type} for checkpoint ${checkpointId}`);
  }
}

function validateCheckpoint(yaml: YamlCheckpoint): Checkpoint {
  if (!yaml.id) {
    throw new ScenarioValidationError("Checkpoint missing id");
  }

  if (!yaml.trigger) {
    throw new ScenarioValidationError(`Checkpoint ${yaml.id} missing trigger`);
  }

  return {
    id: yaml.id,
    trigger: validateTrigger(yaml.trigger, yaml.id),
    description: yaml.description,
    required: yaml.required ?? true,
  };
}

function validateSuccessCriteria(criteria: SuccessCriteria | undefined): SuccessCriteria {
  const defaults: SuccessCriteria = {
    allCheckpoints: true,
    withinTimeout: true,
  };

  if (!criteria) {
    return defaults;
  }

  return {
    allCheckpoints: criteria.allCheckpoints ?? defaults.allCheckpoints,
    minScore: criteria.minScore,
    maxHints: criteria.maxHints,
    maxSolutionsViewed: criteria.maxSolutionsViewed,
    withinTimeout: criteria.withinTimeout ?? defaults.withinTimeout,
    maxActions: criteria.maxActions,
    custom: criteria.custom,
  };
}

function validateScenario(yaml: YamlScenario): Scenario {
  // Required fields
  if (!yaml.id) {
    throw new ScenarioValidationError("Scenario missing id");
  }
  if (!yaml.name) {
    throw new ScenarioValidationError("Scenario missing name", yaml.id);
  }
  if (!yaml.moduleId) {
    throw new ScenarioValidationError("Scenario missing moduleId", yaml.id);
  }
  if (!yaml.checkpoints || !Array.isArray(yaml.checkpoints)) {
    throw new ScenarioValidationError("Scenario missing or invalid checkpoints array", yaml.id);
  }

  // Validate checkpoints
  const checkpoints = yaml.checkpoints.map(validateCheckpoint);

  // Validate success criteria
  const successCriteria = validateSuccessCriteria(yaml.successCriteria);

  return {
    id: yaml.id,
    name: yaml.name,
    description: yaml.description,
    moduleId: yaml.moduleId,
    checkpoints,
    successCriteria,
    timeoutMs: yaml.timeoutMs ?? 120000,
    maxActions: yaml.maxActions ?? 100,
    actions: yaml.actions,
    metadata: yaml.metadata,
  };
}

// ============================================================================
// LOADING
// ============================================================================

/**
 * Load a scenario by ID from the built-in scenarios directory
 */
export async function loadScenario(scenarioId: string): Promise<Scenario> {
  const filePath = join(SCENARIOS_DIR, `${scenarioId}.yaml`);

  if (!existsSync(filePath)) {
    throw new ScenarioValidationError(`Scenario not found: ${scenarioId}`);
  }

  return loadScenarioFromPath(filePath);
}

/**
 * Load a scenario from a file path
 */
export async function loadScenarioFromPath(filePath: string): Promise<Scenario> {
  if (!existsSync(filePath)) {
    throw new ScenarioValidationError(`Scenario file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(content) as YamlScenario;

  return validateScenario(parsed);
}

/**
 * Load a scenario from a YAML string
 */
export function loadScenarioFromYaml(yamlContent: string): Scenario {
  const parsed = yaml.load(yamlContent) as YamlScenario;
  return validateScenario(parsed);
}

/**
 * List all available built-in scenarios
 */
export function listScenarios(): string[] {
  if (!existsSync(SCENARIOS_DIR)) {
    return [];
  }

  return readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(".yaml", ""));
}

/**
 * Get scenario metadata without fully loading
 */
export function getScenarioInfo(scenarioId: string): { id: string; name: string; description?: string } | null {
  const filePath = join(SCENARIOS_DIR, `${scenarioId}.yaml`);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = yaml.load(content) as YamlScenario;
    return {
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// PROGRAMMATIC SCENARIO CREATION
// ============================================================================

/**
 * Create a scenario programmatically
 */
export function createScenario(options: {
  id: string;
  name: string;
  moduleId: string;
  checkpoints: Checkpoint[];
  successCriteria?: Partial<SuccessCriteria>;
  timeoutMs?: number;
  maxActions?: number;
  description?: string;
  actions?: ScriptedAction[];
}): Scenario {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    moduleId: options.moduleId,
    checkpoints: options.checkpoints,
    successCriteria: {
      allCheckpoints: true,
      withinTimeout: true,
      ...options.successCriteria,
    },
    timeoutMs: options.timeoutMs ?? 120000,
    maxActions: options.maxActions ?? 100,
    actions: options.actions,
  };
}

/**
 * Create a simple checkpoint from a step ID
 */
export function stepCheckpoint(stepId: string, description?: string): Checkpoint {
  return {
    id: stepId,
    trigger: { type: "step_completed", stepId },
    description,
    required: true,
  };
}

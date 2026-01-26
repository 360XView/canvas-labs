// Lab Module Validator
// Validates module.yaml structure and check scripts

import * as fs from "fs";
import * as path from "path";
import {
  loadModule,
  loadDraft,
  getValidationRules,
  getCheckConfigs,
  getLabsPath,
  getDraftsPath,
  moduleExists,
} from "./module-loader";

export interface ValidationError {
  type: "error";
  field: string;
  message: string;
}

export interface ValidationWarning {
  type: "warning";
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: {
    stepCount: number;
    taskCount: number;
    infoCount: number;
    checkCount: number;
    hintCount: number;
  };
}

/**
 * Validate a module's YAML structure
 */
export async function validateModule(moduleId: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const stats = {
    stepCount: 0,
    taskCount: 0,
    infoCount: 0,
    checkCount: 0,
    hintCount: 0,
  };

  // Check if module exists
  const { exists, location } = moduleExists(moduleId);
  if (!exists) {
    errors.push({
      type: "error",
      field: "module",
      message: `Module not found: ${moduleId}`,
    });
    return { valid: false, errors, warnings, stats };
  }

  // Load module
  let module;
  try {
    module = location === "draft" ? loadDraft(moduleId) : loadModule(moduleId);
  } catch (error) {
    errors.push({
      type: "error",
      field: "module",
      message: `Failed to load module: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
    return { valid: false, errors, warnings, stats };
  }

  // Validate basic structure
  if (!module.title || module.title.trim() === "") {
    errors.push({
      type: "error",
      field: "title",
      message: "Module must have a non-empty title",
    });
  }

  if (!module.steps || module.steps.length === 0) {
    errors.push({
      type: "error",
      field: "steps",
      message: "Module must have at least one step",
    });
    return { valid: errors.length === 0, errors, warnings, stats };
  }

  stats.stepCount = module.steps.length;

  // Validate each step
  const stepIds = new Set<string>();

  for (let i = 0; i < module.steps.length; i++) {
    const step = module.steps[i];
    const stepPath = `steps[${i}]`;

    // Check for duplicate IDs
    if (stepIds.has(step.id)) {
      errors.push({
        type: "error",
        field: `${stepPath}.id`,
        message: `Duplicate step ID: ${step.id}`,
      });
    }
    stepIds.add(step.id);

    // Validate step type
    const validTypes = ["introduction", "task", "question", "summary"];
    if (!validTypes.includes(step.type)) {
      errors.push({
        type: "error",
        field: `${stepPath}.type`,
        message: `Invalid step type: ${step.type}. Must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Count by type
    if (step.type === "task") {
      stats.taskCount++;
    } else {
      stats.infoCount++;
    }

    // Validate content
    if (!step.content) {
      errors.push({
        type: "error",
        field: `${stepPath}.content`,
        message: `Step ${step.id} must have content`,
      });
      continue;
    }

    // Task steps should have tasks array
    if (step.type === "task") {
      if (!step.content.tasks || step.content.tasks.length === 0) {
        warnings.push({
          type: "warning",
          field: `${stepPath}.content.tasks`,
          message: `Task step ${step.id} should have a tasks array`,
        });
      }

      // Count hints
      if (step.content.hints) {
        stats.hintCount += step.content.hints.length;
      }

      // Recommend hints for task steps
      if (!step.content.hints || step.content.hints.length === 0) {
        warnings.push({
          type: "warning",
          field: `${stepPath}.hints`,
          message: `Task step ${step.id} should have at least one hint`,
        });
      }

      // Recommend solution for task steps
      if (!step.content.solution) {
        warnings.push({
          type: "warning",
          field: `${stepPath}.solution`,
          message: `Task step ${step.id} should have a solution`,
        });
      }
    }

    // Info steps should have instructions
    if ((step.type === "introduction" || step.type === "summary") && !step.content.instructions) {
      warnings.push({
        type: "warning",
        field: `${stepPath}.content.instructions`,
        message: `${step.type} step ${step.id} should have instructions`,
      });
    }
  }

  // Validate check scripts
  try {
    const checks = getCheckConfigs(moduleId);
    stats.checkCount = checks.length;

    // Verify check script files exist
    // Scripts are stored in labs/<moduleId>/checks/ or labs/.drafts/<moduleId>/checks/
    const basePath = location === "draft" ? getDraftsPath() : getLabsPath();
    const checksDir = path.join(basePath, moduleId, "checks");

    for (const check of checks) {
      const scriptPath = path.join(checksDir, check.script);
      if (!fs.existsSync(scriptPath)) {
        errors.push({
          type: "error",
          field: `validation.script`,
          message: `Check script not found: ${check.script} (expected at ${scriptPath})`,
        });
      }
    }
  } catch (error) {
    warnings.push({
      type: "warning",
      field: "validation",
      message: `Could not validate check scripts: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }

  // Warn if no validation at all
  const validationRules = getValidationRules(moduleId);
  const checks = getCheckConfigs(moduleId);
  if (stats.taskCount > 0 && validationRules.length === 0 && checks.length === 0) {
    warnings.push({
      type: "warning",
      field: "validation",
      message: "Module has task steps but no validation rules or check scripts",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Format validation result for CLI output
 */
export function formatValidationResult(result: ValidationResult, moduleId: string): string {
  const lines: string[] = [];

  lines.push(`Validating: ${moduleId}`);
  lines.push("─".repeat(40));
  lines.push("");

  // Stats
  lines.push("Stats:");
  lines.push(`  Steps: ${result.stats.stepCount}`);
  lines.push(`  Tasks: ${result.stats.taskCount}`);
  lines.push(`  Info steps: ${result.stats.infoCount}`);
  lines.push(`  Check scripts: ${result.stats.checkCount}`);
  lines.push(`  Hints: ${result.stats.hintCount}`);
  lines.push("");

  // Errors
  if (result.errors.length > 0) {
    lines.push("Errors:");
    for (const error of result.errors) {
      lines.push(`  ✗ [${error.field}] ${error.message}`);
    }
    lines.push("");
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  ⚠ [${warning.field}] ${warning.message}`);
    }
    lines.push("");
  }

  // Summary
  if (result.valid) {
    lines.push("✓ Module is valid");
  } else {
    lines.push(`✗ Module has ${result.errors.length} error(s)`);
  }

  return lines.join("\n");
}

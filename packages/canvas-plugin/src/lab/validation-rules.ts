// Validation rules for lab command matching
// Each module has a set of rules that map commands to task completions

import type { ValidationRule } from "../canvases/vta/lab-types";

export type { ValidationRule };

export interface CommandLogEntry {
  timestamp: string;
  user: string;
  pwd: string;
  command: string;
  exitCode?: number;
}

export interface ValidationResult {
  stepId: string;
  taskIndex?: number;
}

// Define validation rules for each module
// Command-based rules validate typed commands; check scripts validate outcomes

const becomeRootPattern = /^(sudo\s+)?su(\s|-|$)/;

const validationRulesByModule: Record<string, ValidationRule[]> = {
  "linux-user-management": [
    // Become root - detect the sudo su or su command (pattern-based)
    // This matches when the student runs 'sudo su', 'sudo su -', 'su', 'su -', etc.
    {
      stepId: "become-root",
      pattern: becomeRootPattern,
      description: "Become the root user",
    },

    // The following steps use result-based validation (check scripts):
    // - create-user: Check script verifies user exists
    // - set-permissions: Check script verifies /home/devuser has mode 750
    // - add-to-group: Check script verifies devuser is in developers group
  ],
};

// Get validation rules for a specific module
export function getValidationRules(moduleId: string): ValidationRule[] {
  return validationRulesByModule[moduleId] || [];
}

// Validate a command log entry against rules
export function validateCommand(
  entry: CommandLogEntry,
  rules: ValidationRule[]
): ValidationResult | null {
  const command = entry.command.trim();

  for (const rule of rules) {
    // Check pattern match if specified
    if (rule.pattern) {
      if (!rule.pattern.test(command)) {
        continue;
      }
    }

    // Check user requirement if specified
    if (rule.userCheck) {
      if (entry.user !== rule.userCheck) {
        continue;
      }
    }

    // All checks passed - return the match
    return {
      stepId: rule.stepId,
      taskIndex: rule.taskIndex,
    };
  }

  return null;
}

// Register custom rules for a module (for extensibility)
export function registerValidationRules(
  moduleId: string,
  rules: ValidationRule[]
): void {
  validationRulesByModule[moduleId] = rules;
}

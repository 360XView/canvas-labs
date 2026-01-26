// Scripted Driver
// Executes a predetermined sequence of student actions

import { randomUUID } from "crypto";
import type { TestDriver, DriverContext, DriverType } from "./types";
import type { StudentAction, ActionResult, LabState } from "../types";

// ============================================================================
// SCRIPTED DRIVER OPTIONS
// ============================================================================

export interface ScriptedDriverOptions {
  /** Sequence of actions to execute */
  actions: StudentAction[];

  /** Optional driver ID (auto-generated if not provided) */
  id?: string;

  /** Stop on first action failure */
  stopOnError?: boolean;

  /** Log actions as they execute */
  onLog?: (message: string) => void;
}

// ============================================================================
// SCRIPTED DRIVER IMPLEMENTATION
// ============================================================================

export class ScriptedDriver implements TestDriver {
  readonly id: string;
  readonly type: DriverType = "scripted";

  private actions: StudentAction[];
  private currentIndex: number = 0;
  private stopOnError: boolean;
  private onLog?: (message: string) => void;
  private context: DriverContext | null = null;
  private results: Array<{ action: StudentAction; result: ActionResult }> = [];

  constructor(options: ScriptedDriverOptions);
  constructor(actions: StudentAction[]);
  constructor(optionsOrActions: ScriptedDriverOptions | StudentAction[]) {
    if (Array.isArray(optionsOrActions)) {
      // Simple constructor with just actions
      this.id = `scripted-${randomUUID().slice(0, 8)}`;
      this.actions = optionsOrActions;
      this.stopOnError = false;
    } else {
      // Full options constructor
      this.id = optionsOrActions.id || `scripted-${randomUUID().slice(0, 8)}`;
      this.actions = optionsOrActions.actions;
      this.stopOnError = optionsOrActions.stopOnError ?? false;
      this.onLog = optionsOrActions.onLog;
    }
  }

  async initialize(context: DriverContext): Promise<void> {
    this.context = context;
    this.currentIndex = 0;
    this.results = [];

    this.onLog?.(`[scripted-driver] Initialized with ${this.actions.length} actions`);
  }

  async nextAction(_state: LabState): Promise<StudentAction | null> {
    // Check if we've exhausted all actions
    if (this.currentIndex >= this.actions.length) {
      this.onLog?.(`[scripted-driver] Sequence exhausted after ${this.currentIndex} actions`);
      return null;
    }

    // Check if we should stop due to previous error
    if (this.stopOnError && this.results.length > 0) {
      const lastResult = this.results[this.results.length - 1];
      if (!lastResult.result.success) {
        this.onLog?.(`[scripted-driver] Stopping due to previous error`);
        return null;
      }
    }

    const action = this.actions[this.currentIndex];
    this.onLog?.(`[scripted-driver] Action ${this.currentIndex + 1}/${this.actions.length}: ${formatAction(action)}`);

    this.currentIndex++;
    return action;
  }

  async onActionResult(action: StudentAction, result: ActionResult): Promise<void> {
    this.results.push({ action, result });

    if (result.success) {
      this.onLog?.(`[scripted-driver] Action succeeded${result.completedSteps?.length ? ` (completed: ${result.completedSteps.join(", ")})` : ""}`);
    } else {
      this.onLog?.(`[scripted-driver] Action failed: ${result.error || `exit code ${result.exitCode}`}`);
    }
  }

  async dispose(): Promise<void> {
    this.onLog?.(`[scripted-driver] Disposed after ${this.results.length} actions`);
    this.context = null;
  }

  // ============================================================================
  // ADDITIONAL METHODS
  // ============================================================================

  /**
   * Get the number of actions in the sequence
   */
  getActionCount(): number {
    return this.actions.length;
  }

  /**
   * Get the current index (number of actions returned so far)
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Get all results collected so far
   */
  getResults(): Array<{ action: StudentAction; result: ActionResult }> {
    return [...this.results];
  }

  /**
   * Check if the sequence is complete
   */
  isComplete(): boolean {
    return this.currentIndex >= this.actions.length;
  }

  /**
   * Reset the driver to start from the beginning
   */
  reset(): void {
    this.currentIndex = 0;
    this.results = [];
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
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a scripted driver with the given actions
 */
export function createScriptedDriver(actions: StudentAction[]): ScriptedDriver {
  return new ScriptedDriver(actions);
}

/**
 * Create a scripted driver for the linux-user-management happy path
 */
export function createLinuxUserMgmtHappyPath(): ScriptedDriver {
  return new ScriptedDriver([
    { type: "command", command: "sudo su" },
    { type: "command", command: "useradd -m devuser" },
    { type: "command", command: "chmod 750 /home/devuser" },
    { type: "command", command: "usermod -aG developers devuser" },
  ]);
}

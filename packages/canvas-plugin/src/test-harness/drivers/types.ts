// Test Driver Types
// Pluggable interface for student simulation

import type { Module } from "../../canvases/vta/types";
import type { StudentAction, ActionResult, LabState } from "../types";
import type { Scenario } from "../scenarios/types";

// ============================================================================
// DRIVER TYPE
// ============================================================================

export type DriverType = "scripted" | "replay" | "ai-persona" | "playwright";

// ============================================================================
// DRIVER CONTEXT
// ============================================================================

/**
 * Context provided to drivers when initializing
 */
export interface DriverContext {
  scenario: Scenario;
  module: Module;
  sessionId: string;
  studentId: string;

  // Callbacks for driver to communicate back
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// TEST DRIVER INTERFACE
// ============================================================================

/**
 * Interface for pluggable student simulation drivers
 *
 * Drivers generate StudentActions based on the current lab state.
 * They can be deterministic (ScriptedDriver) or adaptive (AIPersonaDriver).
 */
export interface TestDriver {
  /** Unique identifier for this driver instance */
  id: string;

  /** Type of driver */
  type: DriverType;

  /**
   * Initialize the driver with context
   * Called once before the test run starts
   */
  initialize(context: DriverContext): Promise<void>;

  /**
   * Get the next action to perform
   * Returns null when the driver has no more actions (sequence exhausted or goal reached)
   */
  nextAction(state: LabState): Promise<StudentAction | null>;

  /**
   * Called after each action is executed with the result
   * Allows drivers to adapt behavior based on outcomes
   */
  onActionResult(action: StudentAction, result: ActionResult): Promise<void>;

  /**
   * Clean up resources when test run ends
   */
  dispose(): Promise<void>;
}

// ============================================================================
// DRIVER FACTORY
// ============================================================================

/**
 * Factory function type for creating drivers
 */
export type DriverFactory<TConfig = unknown> = (config: TConfig) => TestDriver;

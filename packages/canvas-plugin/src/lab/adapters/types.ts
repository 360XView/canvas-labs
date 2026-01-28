// Lab Adapter Types
// Multi-lab support using adapter pattern for event normalization

import type { LabType, ActionKind } from "../telemetry/types";

// ============================================================================
// UNIFIED LAB EVENTS
// ============================================================================

/**
 * Event emitted when student performs an action (command, query, code submission)
 * All lab types normalize their actions to this format
 */
export interface UnifiedLabEvent {
  stepId?: string;
  actionKind: ActionKind;
  action: string;                     // Command/query/code
  result: "success" | "failure" | "partial";
  evidence: Record<string, unknown>;  // Lab-specific details
  timestamp: string;
  source: "command" | "check" | "tutor";
}

/**
 * Event emitted when a step completion is detected
 * (e.g., validation check passes, required command executed)
 */
export interface StepCompletionEvent {
  stepId: string;
  source: "command" | "check" | "tutor" | "question";
  taskIndex?: number;
  timestamp: string;
}

// ============================================================================
// LAB ADAPTER INTERFACE
// ============================================================================

/**
 * Adapter pattern: Each lab type implements this interface
 * Adapters transform lab-specific events into unified events
 */
export interface LabAdapter {
  /**
   * Start watching for lab events
   */
  start(): Promise<void>;

  /**
   * Stop watching and clean up
   */
  stop(): void;

  /**
   * Check if adapter is actively monitoring
   */
  isRunning(): boolean;

  /**
   * Get the lab type this adapter handles
   */
  getLabType(): LabType;

  /**
   * Get the module/lab ID being monitored
   */
  getModuleId(): string;

  // =========================================================================
  // EVENT CALLBACKS (Set by Event Hub)
  // =========================================================================

  /**
   * Called when student performs an action
   * Event hub sets this before calling start()
   */
  onStudentAction?: (event: UnifiedLabEvent) => void;

  /**
   * Called when a step completion is detected
   * Event hub sets this before calling start()
   */
  onStepCompleted?: (event: StepCompletionEvent) => void;

  /**
   * Called on adapter errors
   * Event hub sets this before calling start()
   */
  onError?: (error: Error) => void;
}

// ============================================================================
// ADAPTER OPTIONS (For factory methods)
// ============================================================================

/**
 * Base options for all adapter types
 */
export interface BaseAdapterOptions {
  moduleId: string;
  logPath: string;
  onLog?: (msg: string) => void;
  onError?: (err: Error) => void;
}

/**
 * Linux CLI adapter specific options
 */
export interface LinuxCliAdapterOptions extends BaseAdapterOptions {
  checksLogPath?: string;
  validationRules?: Record<string, unknown>;
}

/**
 * Splunk adapter specific options
 */
export interface SplunkAdapterOptions extends BaseAdapterOptions {
  // TODO: Add Splunk-specific options (host, port, credentials, etc.)
}

/**
 * Python adapter specific options
 */
export interface PythonAdapterOptions extends BaseAdapterOptions {
  // TODO: Add Python-specific options (interpreter path, virtual env, etc.)
}

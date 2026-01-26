// Splunk Lab Adapter (Stub)
// TODO: Implement Splunk query monitoring and validation
// For now, provides minimal stub implementation

import type { LabAdapter, SplunkAdapterOptions, UnifiedLabEvent, StepCompletionEvent } from "./types";

/**
 * Splunk Adapter: Monitors Splunk queries and search results
 * Currently a stub - full implementation pending
 */
export function createSplunkAdapter(options: SplunkAdapterOptions): LabAdapter {
  const { moduleId, logPath, onLog, onError } = options;

  const log = (msg: string) => onLog?.(msg);

  // State
  let running = false;

  // Callbacks (set by Event Hub before start())
  let onStudentAction: ((event: UnifiedLabEvent) => void) | undefined;
  let onStepCompleted: ((event: StepCompletionEvent) => void) | undefined;
  let onError_: ((error: Error) => void) | undefined = onError;

  return {
    async start() {
      if (running) {
        return;
      }

      running = true;
      log(`Splunk adapter starting for module ${moduleId}`);

      // TODO: Implement Splunk monitoring
      // - Connect to Splunk API or watch queries.log
      // - Parse SPL (Splunk Processing Language) queries
      // - Validate query results against expected outputs
      // - Emit UnifiedLabEvent for each query execution
      // - Emit StepCompletionEvent when validation passes
      log("Splunk adapter is in stub mode (not fully implemented)");
    },

    stop() {
      if (!running) {
        return;
      }

      running = false;
      log("Splunk adapter stopped");
    },

    isRunning() {
      return running;
    },

    getLabType() {
      return "splunk";
    },

    getModuleId() {
      return moduleId;
    },

    set onStudentAction(handler: ((event: UnifiedLabEvent) => void) | undefined) {
      onStudentAction = handler;
    },

    set onStepCompleted(handler: ((event: StepCompletionEvent) => void) | undefined) {
      onStepCompleted = handler;
    },

    set onError(handler: ((error: Error) => void) | undefined) {
      onError_ = handler;
    },
  };
}

// Python Lab Adapter
// Monitors Python code submissions and test results from submissions.log
// Normalizes Python events to unified adapter interface

import { watch, existsSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import type {
  LabAdapter,
  PythonAdapterOptions,
  UnifiedLabEvent,
  StepCompletionEvent,
} from "./types";
import { getCheckConfigs } from "../module-loader";

/**
 * Python submission log entry format
 */
interface PythonSubmission {
  timestamp: string;
  file: string;
  code: string;
  test_results: {
    passed: boolean;
    test_name: string | null;
    error: string | null;
    output: string;
  };
  metadata: {
    line_count: number;
    functions_defined: string[];
  };
}

/**
 * Python Adapter: Monitors submissions.log for code submissions and test results
 * Emits unified events that Event Hub can process
 */
export function createPythonAdapter(options: PythonAdapterOptions): LabAdapter {
  const { moduleId, logPath, onLog, onError } = options;

  const submissionsLogPath = join(logPath, "submissions.log");
  const log = (msg: string) => onLog?.(msg);

  // State
  let running = false;
  let submissionWatcher: ReturnType<typeof watch> | null = null;
  let lastFileSize = 0;
  let completedSteps = new Set<string>();
  let processedSubmissions = new Set<string>();

  // Callbacks (set by Event Hub before start())
  let onStudentAction: ((event: UnifiedLabEvent) => void) | undefined;
  let onStepCompleted: ((event: StepCompletionEvent) => void) | undefined;
  let onError_: ((error: Error) => void) | undefined = onError;

  // Build mapping from test names to step IDs
  const testToStepId = new Map<string, string>();
  try {
    const checkConfigs = getCheckConfigs(moduleId);
    for (const config of checkConfigs) {
      // For Python labs, the "script" field in checkConfigs contains the test name
      // e.g., "tests/test_main.py::test_hello_world" -> step ID
      testToStepId.set(config.script, config.stepId);
    }
  } catch (e) {
    // Module might not have check configs, that's OK
    log(`Note: Could not load check configs for ${moduleId}: ${e}`);
  }

  /**
   * Emit a student action event (every code submission)
   */
  function emitStudentAction(
    submission: PythonSubmission,
    result: "success" | "failure"
  ): void {
    const event: UnifiedLabEvent = {
      actionKind: "submit_code",
      action: submission.code,
      result,
      evidence: {
        file: submission.file,
        test_passed: submission.test_results.passed,
        test_name: submission.test_results.test_name,
        error: submission.test_results.error,
        output: submission.test_results.output,
        line_count: submission.metadata.line_count,
        functions_defined: submission.metadata.functions_defined,
      },
      timestamp: submission.timestamp,
      source: "tutor",
    };

    onStudentAction?.(event);
  }

  /**
   * Emit a step completion event
   */
  function emitStepCompleted(
    stepId: string,
    timestamp: string
  ): void {
    const event: StepCompletionEvent = {
      stepId,
      source: "tutor",
      timestamp,
    };

    onStepCompleted?.(event);
  }

  /**
   * Process a single submission log entry
   * - Emit student action event
   * - Check if test passes and matches validation rule
   * - Emit step completion if validated
   */
  function processSubmissionEntry(submission: PythonSubmission): void {
    // Always emit the student action
    const result = submission.test_results.passed ? "success" : "failure";
    emitStudentAction(submission, result);

    // Check if this submission's test matches a validation rule
    if (submission.test_results.passed && submission.test_results.test_name) {
      const stepId = testToStepId.get(submission.test_results.test_name);

      if (stepId && !completedSteps.has(stepId)) {
        completedSteps.add(stepId);
        log(`Task validated: ${stepId} (via test ${submission.test_results.test_name})`);
        emitStepCompleted(stepId, submission.timestamp);
      }
    }
  }

  /**
   * Read and process new entries from submissions.log
   */
  function processNewEntries(): void {
    if (!existsSync(submissionsLogPath)) {
      return;
    }

    try {
      const stats = statSync(submissionsLogPath);
      const currentSize = stats.size;

      // Only process if file has grown
      if (currentSize <= lastFileSize) {
        return;
      }

      const content = readFileSync(submissionsLogPath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      // Process each line
      for (const line of lines) {
        try {
          const submission = JSON.parse(line) as PythonSubmission;
          // Create a unique key for this submission
          const key = `${submission.timestamp}:${submission.file}:${submission.code.length}`;

          // Only process if we haven't seen this exact submission before
          if (!processedSubmissions.has(key)) {
            processedSubmissions.add(key);
            processSubmissionEntry(submission);
          }
        } catch (e) {
          // Skip invalid JSON lines
          log(`Warning: Skipped invalid JSON entry: ${e}`);
        }
      }

      lastFileSize = currentSize;
    } catch (e) {
      onError_?.(e as Error);
    }
  }

  return {
    async start() {
      if (running) {
        return;
      }

      running = true;
      log(`Python adapter starting for module ${moduleId}`);

      // Initialize file position if file exists
      if (existsSync(submissionsLogPath)) {
        lastFileSize = statSync(submissionsLogPath).size;
      }

      // Watch submissions.log
      const dir = dirname(submissionsLogPath);
      submissionWatcher = watch(dir, { persistent: true }, (eventType, filename) => {
        if (filename === "submissions.log") {
          processNewEntries();
        }
      });
      log(`Watching ${submissionsLogPath}`);
    },

    stop() {
      if (!running) {
        return;
      }

      running = false;

      if (submissionWatcher) {
        submissionWatcher.close();
        submissionWatcher = null;
      }

      // Clear state
      lastFileSize = 0;
      processedSubmissions.clear();
      completedSteps.clear();

      log("Python adapter stopped");
    },

    isRunning() {
      return running;
    },

    getLabType() {
      return "python";
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

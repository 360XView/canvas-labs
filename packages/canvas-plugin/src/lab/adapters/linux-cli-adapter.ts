// Linux CLI Lab Adapter
// Extracts command and check log monitoring logic
// Normalizes Linux CLI events to unified adapter interface

import { watch, existsSync, readFileSync, statSync } from "fs";
import { dirname, join } from "path";
import type {
  LabAdapter,
  LinuxCliAdapterOptions,
  UnifiedLabEvent,
  StepCompletionEvent,
} from "./types";
import type { CommandLogEntry, ValidationRule } from "../validation-rules";
import { validateCommand, getValidationRules } from "../validation-rules";
import { getCheckConfigs } from "../module-loader";
import { createCheckLogWatcher, type CheckLogWatcher } from "../checks/log-watcher";

/**
 * Linux CLI Adapter: Monitors command.log and checks.log for task completion
 * Emits unified events that Event Hub can process
 */
export function createLinuxCliAdapter(options: LinuxCliAdapterOptions): LabAdapter {
  const { moduleId, logPath, checksLogPath: providedChecksLogPath, onLog, onError } = options;

  const checksLogPath = providedChecksLogPath ?? join(dirname(logPath), "checks.log");
  const log = (msg: string) => onLog?.(msg);

  // State
  let running = false;
  let commandWatcher: ReturnType<typeof watch> | null = null;
  let checkWatcher: CheckLogWatcher | null = null;
  let lastFileSize = 0;
  let completedSteps = new Set<string>();
  let rules: ValidationRule[] = [];

  // Callbacks (set by Event Hub before start())
  let onStudentAction: ((event: UnifiedLabEvent) => void) | undefined;
  let onStepCompleted: ((event: StepCompletionEvent) => void) | undefined;
  let onError_: ((error: Error) => void) | undefined = onError;

  // Build mapping from check script names to step IDs
  const scriptToStepId = new Map<string, string>();
  try {
    const checkConfigs = getCheckConfigs(moduleId);
    for (const config of checkConfigs) {
      scriptToStepId.set(config.script, config.stepId);
    }
  } catch (e) {
    // Module might not have check configs, that's OK
  }

  // Load validation rules for this module
  try {
    rules = getValidationRules(moduleId);
  } catch (e) {
    log(`Warning: Could not load validation rules for ${moduleId}: ${e}`);
  }

  /**
   * Emit a student action event (every command execution)
   */
  function emitStudentAction(entry: CommandLogEntry, result: "success" | "failure"): void {
    const event: UnifiedLabEvent = {
      actionKind: "execute_command",
      action: entry.command,
      result,
      evidence: {
        command: entry.command,
        exit_code: entry.exitCode ?? 0,
        cwd: entry.pwd,
        user: entry.user,
      },
      timestamp: entry.timestamp,
      source: "command",
    };

    onStudentAction?.(event);
  }

  /**
   * Emit a step completion event
   */
  function emitStepCompleted(
    stepId: string,
    taskIndex: number | undefined,
    timestamp: string,
    source: "command" | "check"
  ): void {
    const event: StepCompletionEvent = {
      stepId,
      source,
      taskIndex,
      timestamp,
    };

    onStepCompleted?.(event);
  }

  /**
   * Process a single command log entry
   * - Emit student action event
   * - Check if validation rule passes
   * - Emit step completion if validated
   */
  function processCommandEntry(entry: CommandLogEntry): void {
    // Always emit the student action
    const result = (entry.exitCode ?? 0) === 0 ? "success" : "failure";
    emitStudentAction(entry, result);

    // Check if this command satisfies any validation rule
    const validationResult = validateCommand(entry, rules);

    if (validationResult) {
      // This command triggered a step completion
      if (!completedSteps.has(validationResult.stepId)) {
        completedSteps.add(validationResult.stepId);
        log(`Task validated: ${validationResult.stepId} (via command)`);
        emitStepCompleted(validationResult.stepId, validationResult.taskIndex, entry.timestamp, "command");
      }
    }
  }

  /**
   * Read and process new entries from commands.log
   */
  function processNewEntries(): void {
    if (!existsSync(logPath)) {
      return;
    }

    try {
      const stats = statSync(logPath);
      const currentSize = stats.size;

      // Only process if file has grown
      if (currentSize <= lastFileSize) {
        return;
      }

      const content = readFileSync(logPath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      // Process each line
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as CommandLogEntry;
          processCommandEntry(entry);
        } catch (e) {
          // Skip invalid JSON lines
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
      log(`Linux CLI adapter starting for module ${moduleId}`);

      // Process existing log entries on startup (fixes race condition where
      // commands executed before monitor starts are missed)
      if (existsSync(logPath)) {
        lastFileSize = 0;  // Start from beginning to catch all entries
        processNewEntries();
      }

      // Watch commands.log
      const dir = dirname(logPath);
      commandWatcher = watch(dir, { persistent: true }, (eventType, filename) => {
        if (filename === "commands.log") {
          processNewEntries();
        }
      });
      log(`Watching ${logPath}`);

      // Watch checks.log
      checkWatcher = createCheckLogWatcher({
        logPath: checksLogPath,
        onCheckPassed: (result) => {
          // Map check script name to step ID
          const actualStepId = scriptToStepId.get(result.stepId) || result.stepId;
          log(`Check script ${result.stepId} -> step ${actualStepId}`);

          if (!completedSteps.has(actualStepId)) {
            completedSteps.add(actualStepId);
            emitStepCompleted(actualStepId, result.taskIndex, new Date().toISOString(), "check");
          }
        },
        onError: onError_,
        onLog,
      });
      checkWatcher.start();
      log(`Watching ${checksLogPath}`);
    },

    stop() {
      if (!running) {
        return;
      }

      running = false;

      if (commandWatcher) {
        commandWatcher.close();
        commandWatcher = null;
      }

      if (checkWatcher) {
        checkWatcher.stop();
        checkWatcher = null;
      }

      log("Linux CLI adapter stopped");
    },

    isRunning() {
      return running;
    },

    getLabType() {
      return "linux_cli";
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

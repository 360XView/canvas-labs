// Check Log Watcher - Watches checks.log for passed check results
// Complements the command log watcher for result-based validation

import { watch, existsSync, readFileSync, statSync } from "fs";
import { dirname, basename } from "path";
import { parseCheckLogEntry, type CheckLogEntry } from "./types";

export interface CheckLogWatcherOptions {
  logPath: string;
  onCheckPassed: (result: { stepId: string; taskIndex?: number }) => void;
  onError?: (error: Error) => void;
  onLog?: (message: string) => void;
}

export interface CheckLogWatcher {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createCheckLogWatcher(options: CheckLogWatcherOptions): CheckLogWatcher {
  const { logPath, onCheckPassed, onError, onLog } = options;

  let running = false;
  let watcher: ReturnType<typeof watch> | null = null;
  let lastFileSize = 0;
  let processedStepIds = new Set<string>();

  const log = (msg: string) => onLog?.(msg);

  function processNewEntries(): void {
    if (!existsSync(logPath)) {
      return;
    }

    try {
      const stats = statSync(logPath);
      const currentSize = stats.size;

      if (currentSize <= lastFileSize) {
        return;
      }

      // Read the file content
      const content = readFileSync(logPath, "utf-8");

      // Split by newlines and process each line
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        const entry = parseCheckLogEntry(line);

        if (!entry) {
          // Log parse errors but continue processing
          continue;
        }

        // Only process passed checks that we haven't seen before
        if (entry.status === "passed" && !processedStepIds.has(entry.stepId)) {
          processedStepIds.add(entry.stepId);
          log(`Check passed: ${entry.stepId}`);
          onCheckPassed({
            stepId: entry.stepId,
            taskIndex: entry.taskIndex,
          });
        }
      }

      lastFileSize = currentSize;
    } catch (e) {
      onError?.(e as Error);
    }
  }

  return {
    start() {
      if (running) {
        return;
      }

      running = true;

      // Initialize file position if file exists
      if (existsSync(logPath)) {
        lastFileSize = statSync(logPath).size;
        // Process any existing entries
        lastFileSize = 0; // Reset to process from beginning
        processNewEntries();
      }

      // Watch the directory for changes to checks.log
      const dir = dirname(logPath);
      const filename = basename(logPath);

      watcher = watch(dir, { persistent: true }, (eventType, changedFile) => {
        if (changedFile === filename) {
          processNewEntries();
        }
      });

      log(`Watching ${logPath} for check results`);
    },

    stop() {
      if (!running) {
        return;
      }

      running = false;

      if (watcher) {
        watcher.close();
        watcher = null;
      }

      log("Check log watcher stopped");
    },

    isRunning() {
      return running;
    },
  };
}

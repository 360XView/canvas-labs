// Tutor Control Watcher
// Watches tutor-commands.json for commands from Claude Code tutor
// Processes commands and sends IPC messages to VTA canvas

import { watch, existsSync, readFileSync, writeFileSync, type FSWatcher } from "fs";
import { join } from "path";
import type { LabMessage, DynamicStep } from "../../ipc/types";
import {
  type TutorCommand,
  type TutorCommandsFile,
  isAddStepPayload,
  isMarkCompletePayload,
} from "./types";

export interface TutorControlWatcherOptions {
  logDir: string;
  sendMessage: (msg: LabMessage) => void;
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
}

export interface TutorControlWatcher {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createTutorControlWatcher(
  options: TutorControlWatcherOptions
): TutorControlWatcher {
  const { logDir, sendMessage, onLog, onError } = options;

  const commandsPath = join(logDir, "tutor-commands.json");
  let watcher: FSWatcher | null = null;
  let running = false;
  let lastProcessedTime = 0;

  const log = (msg: string) => onLog?.(msg);

  function readCommandsFile(): TutorCommandsFile | null {
    try {
      if (!existsSync(commandsPath)) {
        return null;
      }
      const content = readFileSync(commandsPath, "utf-8").trim();
      if (!content) {
        return { commands: [] };
      }
      return JSON.parse(content) as TutorCommandsFile;
    } catch (e) {
      onError?.(new Error(`Failed to parse tutor-commands.json: ${e}`));
      return null;
    }
  }

  function writeCommandsFile(data: TutorCommandsFile): void {
    try {
      writeFileSync(commandsPath, JSON.stringify(data, null, 2));
    } catch (e) {
      onError?.(new Error(`Failed to write tutor-commands.json: ${e}`));
    }
  }

  function processCommand(command: TutorCommand): { status: "done" | "error"; error?: string } {
    log(`Processing command: ${command.type} (${command.id})`);

    try {
      if (command.type === "addStep" && isAddStepPayload(command.payload)) {
        const payload = command.payload;

        // Convert to DynamicStep format
        const dynamicStep: DynamicStep = {
          id: payload.stepId,
          title: payload.step.title,
          type: "task",
          content: {
            instructions: payload.step.content.instructions,
            tasks: payload.step.content.tasks,
            hints: payload.step.content.hints,
          },
          source: "tutor",
        };

        // Send IPC message to VTA
        sendMessage({
          type: "addDynamicStep",
          step: dynamicStep,
          afterStepId: payload.afterStepId,
        });

        log(`Sent addDynamicStep for ${payload.stepId}`);
        return { status: "done" };
      }

      if (command.type === "markComplete" && isMarkCompletePayload(command.payload)) {
        const payload = command.payload;

        // Send task completed message with tutor source
        sendMessage({
          type: "taskCompleted",
          taskId: `tutor-${payload.stepId}`,
          stepId: payload.stepId,
          source: "tutor",
        });

        log(`Sent markComplete for ${payload.stepId}`);
        return { status: "done" };
      }

      return { status: "error", error: `Unknown command type: ${command.type}` };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return { status: "error", error: errorMsg };
    }
  }

  function processPendingCommands(): void {
    const data = readCommandsFile();
    if (!data) {
      return;
    }

    let modified = false;

    for (const command of data.commands) {
      if (command.status === "pending") {
        const result = processCommand(command);
        command.status = result.status;
        command.processedAt = new Date().toISOString();
        if (result.error) {
          command.error = result.error;
        }
        modified = true;
      }
    }

    if (modified) {
      writeCommandsFile(data);
    }
  }

  return {
    start() {
      if (running) {
        return;
      }

      running = true;

      // Process any pending commands on start
      processPendingCommands();

      // Watch for changes to the commands file
      watcher = watch(logDir, { persistent: false }, (eventType, filename) => {
        if (filename === "tutor-commands.json") {
          // Debounce to avoid processing same change multiple times
          const now = Date.now();
          if (now - lastProcessedTime < 100) {
            return;
          }
          lastProcessedTime = now;

          processPendingCommands();
        }
      });

      log(`Tutor control watcher started, watching ${commandsPath}`);
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

      log("Tutor control watcher stopped");
    },

    isRunning() {
      return running;
    },
  };
}

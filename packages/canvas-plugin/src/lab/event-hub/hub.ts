// Event Hub - Central dispatcher for multi-lab telemetry
// Receives events from lab adapters and routes to telemetry, state, IPC

import { dirname } from "path";
import type { LabAdapter, UnifiedLabEvent, StepCompletionEvent } from "../adapters/types";
import { createEventLogger, type EventLogger } from "../telemetry/event-logger";
import { createStateWriter, type StateWriter } from "../tutor-control/state-writer";
import type { LabMessage } from "../../ipc/types";

/**
 * Event Hub configuration
 */
export interface EventHubOptions {
  adapter: LabAdapter;
  socketPath: string;
  logDir: string;
  moduleId: string;
  studentId?: string;
  onTaskCompleted?: (stepId: string, source: "command" | "check" | "tutor") => void;
  onError?: (error: Error) => void;
  onLog?: (message: string) => void;
}

/**
 * Event Hub interface
 */
export interface EventHub {
  start(): Promise<void>;
  stop(): void;
  isRunning(): boolean;
  getEventLogger(): EventLogger | null;
  getSessionId(): string | null;
}

/**
 * Create an Event Hub that routes adapter events to telemetry, state, and IPC
 */
export function createEventHub(options: EventHubOptions): EventHub {
  const { adapter, socketPath, logDir, moduleId, studentId = "anonymous", onTaskCompleted, onError, onLog } = options;

  const log = (msg: string) => onLog?.(msg);

  // State
  let running = false;
  let eventLogger: EventLogger | null = null;
  let stateWriter: StateWriter | null = null;
  let ipcClient: { send: (msg: LabMessage) => void; close: () => void } | null = null;
  let completedSteps = new Set<string>();
  let sessionStartTime: number = 0;
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  // Deduplication: track recent event hashes
  const recentEventHashes = new Set<string>();
  const DEDUP_WINDOW_MS = 1000;

  /**
   * Check if an event is a duplicate (within dedup window)
   */
  function isDuplicate(event: UnifiedLabEvent | StepCompletionEvent): boolean {
    const hash = JSON.stringify(event);
    if (recentEventHashes.has(hash)) {
      return true;
    }
    recentEventHashes.add(hash);
    setTimeout(() => recentEventHashes.delete(hash), DEDUP_WINDOW_MS);
    return false;
  }

  /**
   * Handle incoming student action event from adapter
   */
  function handleStudentAction(event: UnifiedLabEvent): void {
    if (isDuplicate(event)) {
      log(`Deduped student action: ${event.actionKind}`);
      return;
    }

    // Log to telemetry
    if (eventLogger) {
      eventLogger.logStudentAction(
        event.stepId || "",
        event.actionKind,
        event.action,
        event.result,
        event.evidence
      );
    }
  }

  /**
   * Handle incoming step completion event from adapter
   */
  function handleStepCompleted(event: StepCompletionEvent): void {
    // Prevent duplicate completions
    if (completedSteps.has(event.stepId)) {
      log(`Step already completed: ${event.stepId}`);
      return;
    }

    if (isDuplicate(event)) {
      log(`Deduped step completion: ${event.stepId}`);
      return;
    }

    completedSteps.add(event.stepId);
    log(`Step completed: ${event.stepId} (via ${event.source})`);

    // Log telemetry events
    if (eventLogger) {
      eventLogger.logCheckPassed(event.stepId, event.source, undefined, event.taskIndex);
      eventLogger.logStepCompleted(event.stepId, event.source);
    }

    // Update state.json for tutor
    stateWriter?.markCompleted(event.stepId, event.source);

    // Send IPC message to vTA
    const msg: LabMessage = {
      type: "taskCompleted",
      taskId: `task-${event.taskIndex ?? 0}`,
      stepId: event.stepId,
      source: event.source,
    };

    if (ipcClient) {
      ipcClient.send(msg);
    }

    onTaskCompleted?.(event.stepId, event.source);
  }

  /**
   * Handle errors from adapter
   */
  function handleError(error: Error): void {
    log(`Adapter error: ${error.message}`);
    onError?.(error);
  }

  /**
   * Connect to vTA canvas via IPC socket with retry logic
   * Retries up to 10 times with 500ms delay to handle race condition
   * where monitor starts before VTA has created the socket
   */
  async function connectToCanvas(): Promise<void> {
    const MAX_RETRIES = 10;
    const RETRY_DELAY_MS = 500;
    let buffer = "";
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const socket = await Bun.connect({
          unix: socketPath,
          socket: {
            data(socket, data) {
              buffer += data.toString();
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const msg = JSON.parse(line) as LabMessage;
                    // Handle incoming messages from vTA if needed
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            },
            open() {
              log(`Connected to vTA canvas at ${socketPath}`);
            },
            close() {
              log("Disconnected from vTA canvas");
              ipcClient = null;
            },
            error(socket, error) {
              handleError(error as Error);
            },
          },
        });

        ipcClient = {
          send: (msg: LabMessage) => {
            socket.write(JSON.stringify(msg) + "\n");
          },
          close: () => {
            socket.end();
          },
        };

        // Success - exit retry loop
        return;
      } catch (e) {
        lastError = e as Error;
        if (attempt < MAX_RETRIES) {
          log(`Connection attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    throw new Error(`Failed to connect to canvas after ${MAX_RETRIES} attempts: ${lastError}`);
  }

  return {
    async start() {
      if (running) {
        return;
      }

      running = true;
      sessionStartTime = Date.now();
      log(`Event Hub starting for ${adapter.getLabType()} lab: ${moduleId}`);

      // Initialize telemetry
      eventLogger = createEventLogger({
        logDir,
        moduleId,
        studentId,
        labType: adapter.getLabType(),
        onLog,
        onError,
      });

      // Start telemetry session
      const existingEvents = eventLogger.getEvents();
      const attemptNumber = existingEvents.filter((e) => e.event_type === "session_started").length + 1;
      eventLogger.startSession(attemptNumber);
      log(`Telemetry session started (attempt ${attemptNumber}, lab_type: ${adapter.getLabType()})`);

      // Initialize state writer
      try {
        stateWriter = createStateWriter({
          logDir,
          onLog,
          onError,
        });

        // Initialize with module steps if available
        try {
          const { loadModule } = await import("../module-loader");
          const module = loadModule(moduleId);
          const stepIds = module.steps.map((s) => s.id);
          stateWriter.initialize(stepIds);
        } catch (e) {
          log(`Warning: Could not initialize state writer with module steps: ${e}`);
        }
      } catch (e) {
        log(`Warning: Could not create state writer: ${e}`);
      }

      // Connect to vTA canvas
      try {
        await connectToCanvas();
      } catch (e) {
        log(`Warning: Could not connect to canvas: ${e}`);
      }

      // Send initial status
      if (ipcClient) {
        ipcClient.send({ type: "labStatus", status: "running", message: "Event hub started" });
      }

      // Set up adapter callbacks before starting
      adapter.onStudentAction = handleStudentAction;
      adapter.onStepCompleted = handleStepCompleted;
      adapter.onError = handleError;

      // Start adapter
      await adapter.start();
      log(`Adapter started: ${adapter.getLabType()}`);

      // Start heartbeat ping
      pingInterval = setInterval(() => {
        if (ipcClient) {
          ipcClient.send({ type: "ping" });
        }
      }, 2000);
    },

    stop() {
      if (!running) {
        return;
      }

      running = false;
      log("Event Hub stopping");

      // Stop heartbeat
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }

      // Stop adapter
      adapter.stop();

      // End telemetry session
      if (eventLogger) {
        const totalTimeSeconds = Math.round((Date.now() - sessionStartTime) / 1000);

        // Determine completion status
        try {
          const { loadModule } = require("../module-loader");
          const module = loadModule(moduleId);
          const totalSteps = module.steps.filter((s: any) => s.type === "task").length;
          const completedTaskSteps = [...completedSteps].filter((id) =>
            module.steps.find((s: any) => s.id === id && s.type === "task")
          ).length;

          const reason = completedTaskSteps >= totalSteps ? "completed" : "abandoned";
          eventLogger.endSession(reason, totalTimeSeconds);
          log(`Telemetry session ended: ${reason} (${totalTimeSeconds}s)`);
        } catch (e) {
          eventLogger.endSession("abandoned", totalTimeSeconds);
          log(`Telemetry session ended: abandoned (${totalTimeSeconds}s)`);
        }
      }

      // Send stop status
      if (ipcClient) {
        ipcClient.send({ type: "labStatus", status: "stopped", message: "Event hub stopped" });
        ipcClient.close();
        ipcClient = null;
      }

      // Clean up state writer
      stateWriter = null;
    },

    isRunning() {
      return running;
    },

    getEventLogger() {
      return eventLogger;
    },

    getSessionId() {
      return eventLogger?.getSessionId() ?? null;
    },
  };
}

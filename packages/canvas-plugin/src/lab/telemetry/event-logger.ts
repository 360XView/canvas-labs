// Telemetry Event Logger
// Append-only JSONL file for immutable event stream
// Following event sourcing principles: all state derived from events

import { appendFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import {
  type TelemetryEvent,
  type TelemetryEventType,
  type LabType,
  type ActionKind,
  generateEventId,
  generateSessionId,
} from "./types";

export interface EventLoggerOptions {
  logDir: string;
  moduleId: string;
  studentId: string;
  sessionId?: string; // Auto-generated if not provided
  labType?: LabType;  // NEW: Defaults to "linux_cli"
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
}

export interface EventLogger {
  // Session management
  getSessionId(): string;
  startSession(attemptNumber: number): void;
  endSession(reason: "completed" | "abandoned" | "timeout", totalTimeSeconds: number): void;

  // Event logging
  logCommand(command: string, exitCode?: number, cwd?: string): void;
  logHintRequested(stepId: string, hintIndex: number, totalHints: number): void;
  logSolutionViewed(stepId: string): void;
  logCheckPassed(
    stepId: string,
    source: "command" | "check" | "tutor",
    checkScript?: string,
    taskIndex?: number
  ): void;
  logCheckFailed(
    stepId: string,
    attemptNumber: number,
    checkScript?: string,
    errorMessage?: string
  ): void;
  logQuestionAnswered(
    stepId: string,
    isCorrect: boolean,
    selectedOptions: string[],
    correctOptions: string[],
    attemptNumber: number
  ): void;
  logStepStarted(stepId: string, stepType: "introduction" | "task" | "question" | "summary"): void;
  logStepCompleted(
    stepId: string,
    source: "command" | "check" | "tutor" | "question",
    timeSpentSeconds?: number
  ): void;

  // NEW: Unified action logging for multi-lab support
  logStudentAction(
    stepId: string,
    actionKind: ActionKind,
    action: string,
    result: "success" | "failure" | "partial",
    evidence?: Record<string, unknown>
  ): void;

  // Reading events
  getEvents(): TelemetryEvent[];
  getEventsByType(type: TelemetryEventType): TelemetryEvent[];
  getEventsByStep(stepId: string): TelemetryEvent[];

  // File path
  getLogPath(): string;
}

export function createEventLogger(options: EventLoggerOptions): EventLogger {
  const { logDir, moduleId, studentId, labType = "linux_cli", onLog, onError } = options;

  // Ensure directory exists
  if (!existsSync(logDir)) {
    try {
      mkdirSync(logDir, { recursive: true });
    } catch (e) {
      onError?.(new Error(`Failed to create log directory: ${e}`));
    }
  }

  const logPath = join(logDir, "telemetry.jsonl");
  const sessionId = options.sessionId || generateSessionId();

  const log = (msg: string) => onLog?.(msg);

  function appendEvent(event: TelemetryEvent): void {
    try {
      const line = JSON.stringify(event) + "\n";
      appendFileSync(logPath, line);
      log(`Telemetry: ${event.event_type} - ${event.event_id}`);
    } catch (e) {
      onError?.(new Error(`Failed to write telemetry event: ${e}`));
    }
  }

  function createEvent<T extends TelemetryEventType>(
    eventType: T,
    payload: Record<string, unknown>,
    stepId?: string
  ): TelemetryEvent {
    return {
      event_id: generateEventId(),
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      module_id: moduleId,
      student_id: studentId,
      step_id: stepId,
      lab_type: labType,  // NEW: Include lab_type in all events
      event_type: eventType,
      payload,
    } as TelemetryEvent;
  }

  function readEvents(): TelemetryEvent[] {
    if (!existsSync(logPath)) {
      return [];
    }

    try {
      const content = readFileSync(logPath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());
      return lines.map((line) => JSON.parse(line) as TelemetryEvent);
    } catch (e) {
      onError?.(new Error(`Failed to read telemetry events: ${e}`));
      return [];
    }
  }

  return {
    getSessionId() {
      return sessionId;
    },

    startSession(attemptNumber: number) {
      const event = createEvent("session_started", {
        attempt_number: attemptNumber,
      });
      appendEvent(event);
    },

    endSession(reason: "completed" | "abandoned" | "timeout", totalTimeSeconds: number) {
      const event = createEvent("session_ended", {
        reason,
        total_time_seconds: totalTimeSeconds,
      });
      appendEvent(event);
    },

    logCommand(command: string, exitCode?: number, cwd?: string) {
      const event = createEvent("command_executed", {
        command,
        exit_code: exitCode,
        cwd,
      });
      appendEvent(event);
    },

    logHintRequested(stepId: string, hintIndex: number, totalHints: number) {
      const event = createEvent(
        "hint_requested",
        {
          step_id: stepId,
          hint_index: hintIndex,
          total_hints: totalHints,
        },
        stepId
      );
      appendEvent(event);
    },

    logSolutionViewed(stepId: string) {
      const event = createEvent(
        "solution_viewed",
        {
          step_id: stepId,
        },
        stepId
      );
      appendEvent(event);
    },

    logCheckPassed(
      stepId: string,
      source: "command" | "check" | "tutor",
      checkScript?: string,
      taskIndex?: number
    ) {
      const event = createEvent(
        "check_passed",
        {
          step_id: stepId,
          check_script: checkScript,
          source,
          task_index: taskIndex,
        },
        stepId
      );
      appendEvent(event);
    },

    logCheckFailed(
      stepId: string,
      attemptNumber: number,
      checkScript?: string,
      errorMessage?: string
    ) {
      const event = createEvent(
        "check_failed",
        {
          step_id: stepId,
          check_script: checkScript,
          error_message: errorMessage,
          attempt_number: attemptNumber,
        },
        stepId
      );
      appendEvent(event);
    },

    logQuestionAnswered(
      stepId: string,
      isCorrect: boolean,
      selectedOptions: string[],
      correctOptions: string[],
      attemptNumber: number
    ) {
      const event = createEvent(
        "question_answered",
        {
          step_id: stepId,
          is_correct: isCorrect,
          selected_options: selectedOptions,
          correct_options: correctOptions,
          attempt_number: attemptNumber,
        },
        stepId
      );
      appendEvent(event);
    },

    logStepStarted(stepId: string, stepType: "introduction" | "task" | "question" | "summary") {
      const event = createEvent(
        "step_started",
        {
          step_id: stepId,
          step_type: stepType,
        },
        stepId
      );
      appendEvent(event);
    },

    logStepCompleted(
      stepId: string,
      source: "command" | "check" | "tutor" | "question",
      timeSpentSeconds?: number
    ) {
      const event = createEvent(
        "step_completed",
        {
          step_id: stepId,
          source,
          time_spent_seconds: timeSpentSeconds,
        },
        stepId
      );
      appendEvent(event);
    },

    // NEW: Unified action logging for multi-lab support
    logStudentAction(
      stepId: string,
      actionKind: ActionKind,
      action: string,
      result: "success" | "failure" | "partial",
      evidence?: Record<string, unknown>
    ) {
      // Write unified event for all lab types
      const unifiedEvent = createEvent(
        "student_action",
        {
          action_kind: actionKind,
          action,
          result,
          evidence: evidence || {},
        },
        stepId
      );
      appendEvent(unifiedEvent);

      // DUAL-WRITE: Also write legacy command_executed event for Linux CLI (backward compatibility)
      if (labType === "linux_cli" && actionKind === "execute_command") {
        const legacyEvent = createEvent(
          "command_executed",
          {
            command: action,
            exit_code: (evidence?.exit_code as number | undefined),
            cwd: evidence?.cwd as string | undefined,
          },
          stepId
        );
        appendEvent(legacyEvent);
      }
    },

    getEvents() {
      return readEvents();
    },

    getEventsByType(type: TelemetryEventType) {
      return readEvents().filter((e) => e.event_type === type);
    },

    getEventsByStep(stepId: string) {
      return readEvents().filter((e) => e.step_id === stepId);
    },

    getLogPath() {
      return logPath;
    },
  };
}

// Helper to read telemetry from a specific file
export function readTelemetryFile(filePath: string): TelemetryEvent[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    return lines.map((line) => JSON.parse(line) as TelemetryEvent);
  } catch (e) {
    console.error(`Failed to read telemetry file: ${e}`);
    return [];
  }
}

// Helper to filter events by session
export function filterEventsBySession(
  events: TelemetryEvent[],
  sessionId: string
): TelemetryEvent[] {
  return events.filter((e) => e.session_id === sessionId);
}

// Helper to get the latest session ID from events
export function getLatestSessionId(events: TelemetryEvent[]): string | null {
  const sessionStartEvents = events.filter((e) => e.event_type === "session_started");
  if (sessionStartEvents.length === 0) {
    return null;
  }
  return sessionStartEvents[sessionStartEvents.length - 1].session_id;
}

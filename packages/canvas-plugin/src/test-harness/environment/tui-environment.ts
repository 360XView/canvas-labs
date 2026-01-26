// TUI Environment
// Real process-based environment using direct PTY spawning

import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "bun";
import type { Module } from "../../canvases/vta/types";
import type { StudentAction, ActionResult, LabState } from "../types";
import type { TelemetryEvent, LabType } from "../../lab/telemetry/types";
import { createEventLogger, type EventLogger } from "../../lab/telemetry/event-logger";

// ============================================================================
// TUI ENVIRONMENT OPTIONS
// ============================================================================

export interface TUIEnvironmentOptions {
  moduleId: string;
  studentId?: string;
  labType?: LabType;

  /**
   * Shell command to spawn. Defaults to "bash" for local testing.
   * Can be set to a Docker command for container-based testing.
   */
  shellCommand?: string;

  /**
   * Text that indicates the shell is ready to receive commands
   */
  readyIndicator?: string;

  /**
   * Timeout for waiting for shell to be ready (ms)
   */
  readyTimeoutMs?: number;

  /**
   * Timeout for command execution (ms)
   */
  commandTimeoutMs?: number;

  /**
   * Enable verbose logging
   */
  verbose?: boolean;

  onLog?: (message: string) => void;
}

/**
 * Simple PTY-like process wrapper for shell command execution.
 * Uses Bun's spawn with pipes and collects all output.
 */
interface ShellProcess {
  write(data: string): void;
  getAllOutput(): string;
  waitForText(text: string, timeoutMs: number): Promise<void>;
  close(): Promise<void>;
  isRunning(): boolean;
}

export interface TUIEnvironment {
  // State access
  getState(): LabState;
  getEventLogger(): EventLogger;
  getEvents(): TelemetryEvent[];

  // Action execution
  executeAction(action: StudentAction): Promise<ActionResult>;

  // Lifecycle
  initialize(module: Module): Promise<void>;
  dispose(): Promise<void>;

  // TUI-specific
  getAdapter(): ShellProcess | null;
  getRawOutput(): string;

  // State inspection
  getCurrentUser(): string;
}

// ============================================================================
// TUI ENVIRONMENT IMPLEMENTATION
// ============================================================================

/**
 * Create a shell process wrapper that captures output and allows command execution.
 */
function createShellProcess(
  shellCommand: string,
  verbose: boolean,
  log: (msg: string) => void
): ShellProcess {
  let output = "";
  let running = true;

  // Parse shell command into parts
  const parts = shellCommand.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  // Spawn the shell process using Bun's spawn
  const proc = spawn({
    cmd: [cmd, ...args],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Disable shell startup messages and set simple prompt
      PS1: "$ ",
      PS2: "> ",
      TERM: "dumb",
    },
  });

  // Bun's stdin is a FileSink when using "pipe"
  const stdin = proc.stdin;

  // Collect stdout asynchronously
  (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    try {
      while (running) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        output += text;
        if (verbose) {
          log(`[stdout] ${text.replace(/\n/g, "\\n")}`);
        }
      }
    } catch {
      // Process ended
    }
  })();

  // Collect stderr asynchronously
  (async () => {
    const reader = proc.stderr.getReader();
    const decoder = new TextDecoder();
    try {
      while (running) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        output += text;
        if (verbose) {
          log(`[stderr] ${text.replace(/\n/g, "\\n")}`);
        }
      }
    } catch {
      // Process ended
    }
  })();

  return {
    write(data: string) {
      if (stdin && running) {
        // Bun's FileSink.write accepts string directly
        stdin.write(data + "\n");
        stdin.flush();
      }
    },

    getAllOutput(): string {
      return output;
    },

    async waitForText(text: string, timeoutMs: number): Promise<void> {
      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        if (output.includes(text)) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Timeout waiting for text: ${text}`);
    },

    async close(): Promise<void> {
      running = false;
      if (stdin) {
        try {
          stdin.end();
        } catch {
          // Already closed
        }
      }
      proc.kill();
    },

    isRunning(): boolean {
      return running;
    },
  };
}

export function createTUIEnvironment(options: TUIEnvironmentOptions): TUIEnvironment {
  const {
    moduleId,
    studentId = "test-student",
    labType = "linux_cli",
    shellCommand = "/bin/bash",
    readyIndicator = "",
    readyTimeoutMs = 10000,
    commandTimeoutMs = 5000,
    verbose = false,
    onLog,
  } = options;

  // State
  let shellProcess: ShellProcess | null = null;
  let module: Module | null = null;
  let sessionId: string | null = null;
  let tempDir: string | null = null;
  let eventLogger: EventLogger | null = null;
  let currentUser = "user";
  let cwd = process.cwd();
  const completedSteps = new Set<string>();

  // ============================================================================
  // HELPERS
  // ============================================================================

  function log(msg: string) {
    onLog?.(msg);
    if (verbose) {
      console.log(`[tui-env] ${msg}`);
    }
  }

  /**
   * Send a command and wait for the output marker
   */
  async function sendCommand(command: string): Promise<{ output: string; exitCode: number }> {
    if (!shellProcess) {
      throw new Error("TUI environment not initialized");
    }

    const outputBefore = shellProcess.getAllOutput();

    // Use unique markers to delimit command output
    const marker = `__MARKER_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    const wrappedCommand = `echo "${marker}_START"; ${command}; echo "${marker}_EXIT:$?"`;
    shellProcess.write(wrappedCommand);

    // Wait for the exit marker
    try {
      await shellProcess.waitForText(`${marker}_EXIT:`, commandTimeoutMs);
      // Give a moment for the full line to be captured
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (err) {
      log(`Command timeout: ${command}`);
      return { output: "", exitCode: 124 }; // timeout exit code
    }

    // Parse output
    const outputAfter = shellProcess.getAllOutput();
    const newOutput = outputAfter.slice(outputBefore.length);

    // Extract exit code
    const exitCodeMatch = newOutput.match(new RegExp(`${marker}_EXIT:(\\d+)`));
    const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;

    // Extract output between markers
    const startMarkerIndex = newOutput.indexOf(`${marker}_START`);
    const exitMarkerIndex = newOutput.indexOf(`${marker}_EXIT:`);

    let cleanOutput = "";
    if (startMarkerIndex !== -1 && exitMarkerIndex !== -1) {
      // Get content between START marker line end and EXIT marker
      const afterStart = newOutput.indexOf("\n", startMarkerIndex);
      if (afterStart !== -1 && afterStart < exitMarkerIndex) {
        cleanOutput = newOutput.slice(afterStart + 1, exitMarkerIndex).trim();
      }
    }

    return { output: cleanOutput, exitCode };
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Detect current user from shell
   */
  async function detectUser(): Promise<string> {
    const { output } = await sendCommand("whoami");
    return output.trim() || "user";
  }

  /**
   * Detect current working directory
   */
  async function detectCwd(): Promise<string> {
    const { output } = await sendCommand("pwd");
    return output.trim() || process.cwd();
  }

  /**
   * Check if a step is completed based on shell state
   */
  async function checkStepCompletion(stepId: string): Promise<boolean> {
    // This is a simplified check - real implementation would use module validation rules
    switch (stepId) {
      case "become-root":
        return currentUser === "root";

      case "create-user": {
        const { exitCode } = await sendCommand("id devuser 2>/dev/null");
        return exitCode === 0;
      }

      case "set-permissions": {
        const { output } = await sendCommand("stat -c %a /home/devuser 2>/dev/null || stat -f %Lp /home/devuser 2>/dev/null");
        return output.trim() === "750";
      }

      case "add-to-group": {
        const { output } = await sendCommand("groups devuser 2>/dev/null");
        return output.includes("developers");
      }

      default:
        return false;
    }
  }

  // ============================================================================
  // ACTION EXECUTION
  // ============================================================================

  async function executeAction(action: StudentAction): Promise<ActionResult> {
    const timestamp = new Date().toISOString();

    switch (action.type) {
      case "command": {
        log(`Executing: ${action.command}`);

        const { output, exitCode } = await sendCommand(action.command);
        const success = exitCode === 0;

        // Log command to telemetry
        eventLogger?.logCommand(action.command, exitCode, cwd);

        // Update current user if command might have changed it
        if (action.command.includes("su") || action.command.includes("sudo")) {
          currentUser = await detectUser();
          cwd = await detectCwd();
          log(`User is now: ${currentUser}, cwd: ${cwd}`);
        }

        // Check for step completions
        const completedFromCommand: string[] = [];
        const stepIds = module?.steps.map((s) => s.id) || [];

        for (const stepId of stepIds) {
          if (!completedSteps.has(stepId)) {
            const completed = await checkStepCompletion(stepId);
            if (completed) {
              completedSteps.add(stepId);
              completedFromCommand.push(stepId);

              eventLogger?.logCheckPassed(stepId, "command");
              eventLogger?.logStepCompleted(stepId, "command");
              log(`Step completed: ${stepId}`);
            }
          }
        }

        return {
          action,
          success,
          exitCode,
          output,
          timestamp,
          completedSteps: completedFromCommand,
          passedChecks: completedFromCommand,
        };
      }

      case "hint": {
        const step = module?.steps.find((s) => s.id === action.stepId);
        const totalHints = step?.content.hints?.length || 0;

        eventLogger?.logHintRequested(action.stepId, action.hintIndex, totalHints);

        return {
          action,
          success: true,
          timestamp,
        };
      }

      case "solution": {
        eventLogger?.logSolutionViewed(action.stepId);

        return {
          action,
          success: true,
          timestamp,
        };
      }

      case "wait": {
        await new Promise((resolve) => setTimeout(resolve, action.durationMs));
        return {
          action,
          success: true,
          timestamp,
        };
      }

      case "question": {
        const step = module?.steps.find((s) => s.id === action.stepId);
        const question = step?.content.question;

        if (!question) {
          return {
            action,
            success: false,
            error: "No question found for step",
            timestamp,
          };
        }

        const correctOptions = question.options
          .filter((o) => o.correct)
          .map((o) => o.id);

        const isCorrect =
          action.selectedOptions.length === correctOptions.length &&
          action.selectedOptions.every((opt) => correctOptions.includes(opt));

        eventLogger?.logQuestionAnswered(
          action.stepId,
          isCorrect,
          action.selectedOptions,
          correctOptions,
          1
        );

        if (isCorrect && !completedSteps.has(action.stepId)) {
          completedSteps.add(action.stepId);
          eventLogger?.logStepCompleted(action.stepId, "question");
        }

        return {
          action,
          success: true,
          timestamp,
          completedSteps: isCorrect ? [action.stepId] : [],
        };
      }

      default:
        return {
          action,
          success: false,
          error: `Unknown action type: ${(action as StudentAction).type}`,
          timestamp,
        };
    }
  }

  // ============================================================================
  // PUBLIC INTERFACE
  // ============================================================================

  return {
    async initialize(mod: Module) {
      module = mod;

      // Create temp directory for telemetry
      tempDir = mkdtempSync(join(tmpdir(), "tui-harness-"));

      // Create event logger
      eventLogger = createEventLogger({
        logDir: tempDir,
        moduleId,
        studentId,
        labType,
        onLog: (msg) => log(`[telemetry] ${msg}`),
      });

      // Start session
      eventLogger.startSession(1);
      sessionId = eventLogger.getSessionId();

      // Spawn shell process
      log(`Spawning shell: ${shellCommand}`);
      shellProcess = createShellProcess(shellCommand, verbose, log);

      // Give shell a moment to initialize
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Wait for ready indicator if specified
      if (readyIndicator) {
        try {
          await shellProcess.waitForText(readyIndicator, readyTimeoutMs);
        } catch {
          log(`Ready indicator not found: ${readyIndicator}`);
        }
      }

      log("Shell ready");

      // Detect initial state
      try {
        currentUser = await detectUser();
        cwd = await detectCwd();
        log(`Initial user: ${currentUser}, cwd: ${cwd}`);
      } catch (err) {
        // If detection fails, use defaults
        log(`Initial state detection failed, using defaults: ${err}`);
        currentUser = "user";
        cwd = process.cwd();
      }
    },

    async dispose() {
      if (eventLogger) {
        eventLogger.endSession("completed", 0);
      }

      if (shellProcess) {
        await shellProcess.close();
        shellProcess = null;
      }

      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true });
      }
    },

    executeAction,

    getState(): LabState {
      if (!module || !sessionId) {
        throw new Error("TUI environment not initialized");
      }

      return {
        moduleId,
        labType,
        sessionId,
        studentId,
        currentUser,
        currentWorkingDirectory: cwd,
        environment: {},
        currentStepIndex: 0,
        completedSteps: Array.from(completedSteps),
        events: eventLogger?.getEvents() || [],
        module,
        stepIds: module.steps.map((s) => s.id),
      };
    },

    getEventLogger(): EventLogger {
      if (!eventLogger) {
        throw new Error("TUI environment not initialized");
      }
      return eventLogger;
    },

    getEvents(): TelemetryEvent[] {
      return eventLogger?.getEvents() || [];
    },

    getAdapter(): ShellProcess | null {
      return shellProcess;
    },

    getRawOutput(): string {
      return shellProcess?.getAllOutput() || "";
    },

    getCurrentUser(): string {
      return currentUser;
    },
  };
}

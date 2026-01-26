/**
 * State Observer Layer - Phase 3
 *
 * Provides a unified interface for monitoring application state changes.
 * Supports text matching (for generic TUI apps), file conditions (log checking),
 * and custom predicates (for extensibility).
 *
 * Works with:
 * - Canvas labs: Reads state.json for task completion detection
 * - Generic TUI apps: Captures pane content and searches for text
 * - File-based conditions: Checks for file existence, content, or patterns
 */

// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { readFile, access } from "fs/promises";
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { constants as fsConstants } from "fs";
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { join } from "path";

import * as tmux from "./tmux-controller.js";

/**
 * Structure of Canvas lab state.json
 */
interface CanvasLabState {
  version: number;
  lastUpdated: string;
  steps: Array<{
    id: string;
    completed: boolean;
    [key: string]: unknown;
  }>;
  scoring?: {
    [key: string]: unknown;
  };
}

/**
 * Represents a condition to check during state observation.
 * Supports text matching, file checking, and custom predicates.
 */
export type StateCondition =
  | {
      type: "text";
      pane: string;
      text: string;
      caseSensitive?: boolean;
      description?: string;
    }
  | {
      type: "file";
      path: string;
      content?: string; // Optional: if provided, check file contains this
      contentRegex?: RegExp; // Optional: if provided, check file matches regex
      description?: string;
    }
  | {
      type: "custom";
      check: () => Promise<boolean>;
      description?: string;
    };

/**
 * Observes application state and detects condition changes.
 * Implementations are adapter-specific (Canvas reads state.json, text observer captures panes).
 */
export interface StateObserver {
  /**
   * Wait for a condition to be true, polling until timeout.
   * Returns true if condition met, false if timeout.
   * Does NOT throw - returns boolean for graceful handling.
   */
  waitFor(
    condition: StateCondition,
    timeoutMs: number,
    pollIntervalMs?: number
  ): Promise<boolean>;

  /**
   * Check if a condition is currently true (single check, no polling).
   */
  checkCondition(condition: StateCondition): Promise<boolean>;

  /**
   * Get diagnostic info about why a condition failed (for error messages).
   */
  getDiagnostics(condition: StateCondition): Promise<string>;
}

/**
 * Canvas-specific state observer that reads state.json for task completion.
 * Used with Canvas labs to detect when tasks are completed.
 *
 * Reads from logDir/state.json which has the structure:
 * {
 *   version: number,
 *   lastUpdated: string,
 *   steps: [{ id: string, completed: boolean, ... }, ...],
 *   scoring?: { ... }
 * }
 */
export class CanvasStateObserver implements StateObserver {
  readonly logDir: string;

  constructor(
    logDir: string,
    private tmuxController: typeof tmux
  ) {
    if (!logDir || typeof logDir !== "string") {
      throw new Error("CanvasStateObserver requires logDir (path to Canvas log directory)");
    }
    this.logDir = logDir;
  }

  async waitFor(
    condition: StateCondition,
    timeoutMs: number,
    pollIntervalMs: number = 300
  ): Promise<boolean> {
    if (timeoutMs <= 0) {
      return false;
    }
    if (pollIntervalMs <= 0) {
      return false;
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = await this.checkCondition(condition);
        if (result) {
          return true;
        }
      } catch (error) {
        // Continue polling on errors (e.g., file not yet available)
        // Only system errors will be caught and should not stop polling
      }

      // Sleep before next poll
      await new Promise((resolve: (value: void) => void) =>
        setTimeout(resolve, pollIntervalMs)
      );
    }

    return false;
  }

  async checkCondition(condition: StateCondition): Promise<boolean> {
    switch (condition.type) {
      case "text":
        return this.checkTextCondition(condition);
      case "file":
        return this.checkFileCondition(condition);
      case "custom":
        return condition.check();
    }
  }

  private async checkTextCondition(
    condition: StateCondition & { type: "text" }
  ): Promise<boolean> {
    try {
      // Capture the pane content
      const content = await this.tmuxController.capturePane(condition.pane);

      // Perform text matching
      if (condition.caseSensitive !== false) {
        // Case-sensitive (default)
        return content.includes(condition.text);
      } else {
        // Case-insensitive
        return content.toLowerCase().includes(condition.text.toLowerCase());
      }
    } catch (error) {
      // If pane doesn't exist or capture fails, condition is not met
      return false;
    }
  }

  private async checkFileCondition(
    condition: StateCondition & { type: "file" }
  ): Promise<boolean> {
    try {
      const content = await readFile(condition.path, "utf-8");

      // If no content filter specified, just check file exists
      if (!condition.content && !condition.contentRegex) {
        return true;
      }

      // Check for content substring
      if (condition.content) {
        if (!content.includes(condition.content)) {
          return false;
        }
      }

      // Check for regex match
      if (condition.contentRegex) {
        if (!condition.contentRegex.test(content)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      // File doesn't exist or is unreadable
      return false;
    }
  }

  async getDiagnostics(condition: StateCondition): Promise<string> {
    switch (condition.type) {
      case "text": {
        try {
          const content = await this.tmuxController.capturePane(condition.pane);
          const lines = content.split("\n");
          const lastLines = lines.slice(-5).join("\n");
          return (
            `Expected text: "${condition.text}"\n` +
            `Pane: ${condition.pane}\n` +
            `Last 5 lines:\n${lastLines}`
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return `Failed to capture pane: ${errorMsg}`;
        }
      }

      case "file": {
        try {
          await access(condition.path, fsConstants.F_OK);
          let fileContent = "";
          try {
            fileContent = await readFile(condition.path, "utf-8");
          } catch {
            fileContent = "[File exists but is unreadable]";
          }

          let filterInfo = "";
          if (condition.content) {
            filterInfo += `\nSearching for content: "${condition.content}"`;
            if (!fileContent.includes(condition.content)) {
              filterInfo += " [NOT FOUND]";
            }
          }
          if (condition.contentRegex) {
            filterInfo += `\nSearching for pattern: ${condition.contentRegex.source}`;
            if (!condition.contentRegex.test(fileContent)) {
              filterInfo += " [NOT MATCHED]";
            }
          }

          const lastLine = fileContent.split("\n").slice(-1)[0];
          return (
            `File: ${condition.path}\n` +
            `Status: exists\n` +
            `Size: ${fileContent.length} bytes\n` +
            `Last line: ${lastLine}${filterInfo}`
          );
        } catch (error) {
          return `File not found or not readable: ${condition.path}`;
        }
      }

      case "custom": {
        return condition.description || "Custom condition failed";
      }
    }
  }

  /**
   * Read the current lab state from state.json
   * @returns Parsed state or null if file doesn't exist
   */
  private async readLabState(): Promise<CanvasLabState | null> {
    try {
      const statePath = join(this.logDir, "state.json");
      const content = await readFile(statePath, "utf-8");
      const trimmed = content.trim();
      if (!trimmed) {
        return null;
      }
      return JSON.parse(trimmed) as CanvasLabState;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a condition factory for step completion.
   * Returns a StateCondition instance bound to this observer's logDir.
   *
   * Usage:
   *   const observer = new CanvasStateObserver(logDir, tmux);
   *   const condition = observer.createStepCompletedCondition("create-user");
   *   const success = await observer.waitFor(condition, 10000);
   */
  createStepCompletedCondition(stepId: string): StateCondition {
    const self = this;

    return {
      type: "custom",
      description: `Step "${stepId}" completed`,
      check: async () => {
        const state = await self.readLabState();
        if (!state) {
          return false;
        }
        const step = state.steps.find((s) => s.id === stepId);
        return step ? step.completed : false;
      },
    };
  }

  /**
   * Helper: Create a condition that waits for text to appear in a pane
   * @param text Text to search for
   * @param caseSensitive Whether to match case (default: true)
   * @returns StateCondition for text matching
   */
  static textAppears(
    text: string,
    caseSensitive: boolean = true
  ): StateCondition {
    return {
      type: "text",
      pane: "auto", // Will be determined at runtime
      text,
      caseSensitive,
      description: `Text "${text}" appears`,
    };
  }
}

/**
 * Generic text-based state observer for any TUI app.
 * Captures pane content and checks for text patterns/files.
 * Used as fallback when app-specific observers aren't available.
 *
 * Works with any TUI application by:
 * - Capturing pane content via tmux
 * - Searching for text patterns (case-sensitive/insensitive)
 * - Checking for files and their content
 */
export class TextStateObserver implements StateObserver {
  constructor(
    private targetPane: string,
    private tmuxController: typeof tmux
  ) {
    if (!targetPane || typeof targetPane !== "string") {
      throw new Error("TextStateObserver requires targetPane (tmux pane address)");
    }
  }

  async waitFor(
    condition: StateCondition,
    timeoutMs: number,
    pollIntervalMs: number = 200
  ): Promise<boolean> {
    if (timeoutMs <= 0) {
      return false;
    }
    if (pollIntervalMs <= 0) {
      return false;
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = await this.checkCondition(condition);
        if (result) {
          return true;
        }
      } catch (error) {
        // Continue polling on errors
      }

      // Sleep before next poll
      await new Promise((resolve: (value: void) => void) =>
        setTimeout(resolve, pollIntervalMs)
      );
    }

    return false;
  }

  async checkCondition(condition: StateCondition): Promise<boolean> {
    switch (condition.type) {
      case "text":
        return this.checkTextCondition(condition);
      case "file":
        return this.checkFileCondition(condition);
      case "custom":
        return condition.check();
    }
  }

  private async checkTextCondition(
    condition: StateCondition & { type: "text" }
  ): Promise<boolean> {
    try {
      // Determine which pane to capture
      const pane = condition.pane === "auto" ? this.targetPane : condition.pane;

      // Capture the pane content
      const rawContent = await this.tmuxController.capturePane(pane);

      // Strip ANSI escape codes for cleaner matching
      const content = this.stripAnsiCodes(rawContent);

      // Perform text matching
      if (condition.caseSensitive !== false) {
        // Case-sensitive (default)
        return content.includes(condition.text);
      } else {
        // Case-insensitive
        return content.toLowerCase().includes(condition.text.toLowerCase());
      }
    } catch (error) {
      // If pane doesn't exist or capture fails, condition is not met
      return false;
    }
  }

  private async checkFileCondition(
    condition: StateCondition & { type: "file" }
  ): Promise<boolean> {
    try {
      const content = await readFile(condition.path, "utf-8");

      // If no content filter specified, just check file exists
      if (!condition.content && !condition.contentRegex) {
        return true;
      }

      // Check for content substring
      if (condition.content) {
        if (!content.includes(condition.content)) {
          return false;
        }
      }

      // Check for regex match
      if (condition.contentRegex) {
        if (!condition.contentRegex.test(content)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      // File doesn't exist or is unreadable
      return false;
    }
  }

  async getDiagnostics(condition: StateCondition): Promise<string> {
    switch (condition.type) {
      case "text": {
        try {
          const pane = condition.pane === "auto" ? this.targetPane : condition.pane;
          const rawContent = await this.tmuxController.capturePane(pane);
          const content = this.stripAnsiCodes(rawContent);
          const lines = content.split("\n");
          const lastLines = lines.slice(-5).join("\n");
          return (
            `Expected text: "${condition.text}"\n` +
            `Pane: ${pane}\n` +
            `Last 5 lines:\n${lastLines}`
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return `Failed to capture pane: ${errorMsg}`;
        }
      }

      case "file": {
        try {
          await access(condition.path, fsConstants.F_OK);
          let fileContent = "";
          try {
            fileContent = await readFile(condition.path, "utf-8");
          } catch {
            fileContent = "[File exists but is unreadable]";
          }

          let filterInfo = "";
          if (condition.content) {
            filterInfo += `\nSearching for content: "${condition.content}"`;
            if (!fileContent.includes(condition.content)) {
              filterInfo += " [NOT FOUND]";
            }
          }
          if (condition.contentRegex) {
            filterInfo += `\nSearching for pattern: ${condition.contentRegex.source}`;
            if (!condition.contentRegex.test(fileContent)) {
              filterInfo += " [NOT MATCHED]";
            }
          }

          const lastLine = fileContent.split("\n").slice(-1)[0];
          return (
            `File: ${condition.path}\n` +
            `Status: exists\n` +
            `Size: ${fileContent.length} bytes\n` +
            `Last line: ${lastLine}${filterInfo}`
          );
        } catch (error) {
          return `File not found or not readable: ${condition.path}`;
        }
      }

      case "custom": {
        return condition.description || "Custom condition failed";
      }
    }
  }

  /**
   * Strip ANSI escape codes from text.
   * Removes color codes, formatting, etc. for clean text matching.
   * Pattern matches: ESC [ followed by any number and semicolons, then m
   * Example: \x1b[0m, \x1b[31m, \x1b[1;32m
   */
  private stripAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
  }

  /**
   * Helper: Create a condition that waits for text to appear in the target pane
   * @param text Text to search for
   * @param caseSensitive Whether to match case (default: true)
   * @returns StateCondition for text matching
   */
  static textAppears(
    text: string,
    caseSensitive: boolean = true
  ): StateCondition {
    return {
      type: "text",
      pane: "auto",
      text,
      caseSensitive,
      description: `Text "${text}" appears in pane`,
    };
  }

  /**
   * Helper: Create a condition that waits for a file to contain specific text
   * @param path Path to file
   * @param content Content to search for
   * @returns StateCondition for file content matching
   */
  static fileContains(path: string, content: string): StateCondition {
    return {
      type: "file",
      path,
      content,
      description: `File "${path}" contains "${content}"`,
    };
  }

  /**
   * Helper: Create a condition that waits for a file to match a regex pattern
   * @param path Path to file
   * @param pattern Regex pattern to match
   * @returns StateCondition for regex matching
   */
  static fileMatches(path: string, pattern: RegExp): StateCondition {
    return {
      type: "file",
      path,
      contentRegex: pattern,
      description: `File "${path}" matches pattern`,
    };
  }
}

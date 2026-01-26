/**
 * Generic TUI Application Adapter
 *
 * Provides a universal adapter for launching any TUI application in tmux.
 * Works with any CLI tool or interactive application that can be run in a shell.
 *
 * This adapter is useful for testing:
 * - Custom CLI tools
 * - Interactive applications
 * - Scripts and command-line utilities
 * - Third-party TUI applications
 *
 * For applications with specific launch requirements, create a custom adapter
 * implementing the TUIAppAdapter interface.
 */

// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { execFile } from "child_process";
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { promisify } from "util";

import type { TUIAppAdapter, LaunchOptions, LaunchResult } from "./adapter-interface";
import * as tmux from "../src/tmux-controller";

const execFileAsync = promisify(execFile);

/**
 * Configuration for generic TUI application adapter
 */
interface GenericAdapterConfig {
  /** The command to execute (e.g., "node", "python", "bun run my-app.ts") */
  launchCommand: string;

  /** Arguments to pass to the command */
  args?: string[];

  /** Pattern to identify the target pane (regex string, optional) */
  targetPanePattern?: string;

  /** Text indicating the application is ready (e.g., "> ", "$ ", "Input:") */
  readyIndicator?: string;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Generic adapter for any TUI application.
 * Launches the application in a tmux window and provides basic integration.
 */
export class GenericAdapter implements TUIAppAdapter {
  readonly name: string;
  readonly description: string;

  private launchCommand: string;
  private args: string[];
  private targetPanePattern?: RegExp;
  private readyIndicator?: string;
  private verbose: boolean;

  /**
   * Create a generic adapter instance.
   *
   * @param config Generic adapter configuration
   * @throws Error if launchCommand is missing
   */
  constructor(config: GenericAdapterConfig) {
    if (!config.launchCommand || typeof config.launchCommand !== "string") {
      throw new Error("Generic adapter requires launchCommand");
    }

    this.launchCommand = config.launchCommand;
    this.args = config.args || [];
    this.verbose = config.verbose || false;

    // Compile regex pattern if provided
    if (config.targetPanePattern) {
      try {
        this.targetPanePattern = new RegExp(config.targetPanePattern);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (this.verbose) {
          console.error(
            `[Generic] Failed to compile regex pattern: ${errorMsg}`
          );
        }
        throw new Error(
          `Invalid targetPanePattern regex: ${config.targetPanePattern}\n${errorMsg}`
        );
      }
    }

    this.readyIndicator = config.readyIndicator;

    // Set readable name and description
    this.name = `TUI App: ${this.launchCommand}`;
    this.description = `Generic TUI adapter for: ${this.launchCommand} ${
      this.args.length > 0 ? this.args.join(" ") : ""
    }`;
  }

  /**
   * Launch the TUI application.
   * Creates a new tmux window and runs the application command.
   *
   * @param options Launch options (sessionName, windowName)
   * @returns Launch result with tmux coordinates
   * @throws Error if window creation or command execution fails
   */
  async launch(options: LaunchOptions): Promise<LaunchResult> {
    const sessionName = options.sessionName || `tui-app-${Date.now()}`;
    const windowName = options.windowName || "tui-app";

    if (this.verbose) {
      console.log(`[Generic] Launching application: ${this.launchCommand}`);
      console.log(`[Generic] Session: ${sessionName}, Window: ${windowName}`);
      if (this.args.length > 0) {
        console.log(`[Generic] Arguments: ${this.args.join(" ")}`);
      }
    }

    // Create a new tmux window
    let windowIndex: string;
    try {
      windowIndex = await tmux.createWindow(sessionName, windowName);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create window for TUI application: ${errorMsg}\n` +
        `Command: ${this.launchCommand}\n` +
        `Ensure tmux is installed and session "${sessionName}" exists`
      );
    }

    const windowTarget = `${sessionName}:${windowIndex}`;
    const paneTarget = `${windowTarget}.0`;

    // Build the full command
    const fullCommand = this.buildCommand();

    if (this.verbose) {
      console.log(`[Generic] Running: ${fullCommand}`);
    }

    // Launch the application
    try {
      await tmux.sendCommand(paneTarget, fullCommand);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await tmux.killWindow(windowTarget).catch(() => {
        /* ignore cleanup errors */
      });
      throw new Error(
        `Failed to launch TUI application: ${errorMsg}\n` +
        `Command: ${fullCommand}\n` +
        `Ensure the command is available and executable`
      );
    }

    // Wait briefly for process to start
    await new Promise((resolve: (value: void) => void) =>
      setTimeout(resolve, 1000)
    );

    if (this.verbose) {
      console.log(`[Generic] Application launched successfully`);
    }

    return {
      sessionName,
      windowName,
      targetPaneName: paneTarget,
    };
  }

  /**
   * Find the target pane.
   * For generic adapter, returns the pane where the command was launched (pane 0).
   * If targetPanePattern is provided, searches for matching pane.
   *
   * @param sessionName tmux session name
   * @param windowName tmux window name
   * @returns tmux target (e.g., "session:window.pane")
   * @throws Error if target pane not found (when pattern is used)
   */
  async findTargetPane(sessionName: string, windowName: string): Promise<string> {
    const windowTarget = `${sessionName}:${windowName}`;

    // If no pattern specified, return the default pane (where we launched)
    if (!this.targetPanePattern) {
      if (this.verbose) {
        console.log(`[Generic] Using default target pane: ${windowTarget}.0`);
      }
      return `${windowTarget}.0`;
    }

    // Otherwise, search panes by pattern
    if (this.verbose) {
      console.log(
        `[Generic] Searching for pane matching: ${this.targetPanePattern}`
      );
    }

    let panes: string[];
    try {
      panes = await tmux.listPanes(windowTarget);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to list panes in window: ${errorMsg}\n` +
        `Target: ${windowTarget}`
      );
    }

    // Search panes for matching content
    for (const paneIndex of panes) {
      const paneTarget = `${windowTarget}.${paneIndex}`;
      try {
        const content = await tmux.capturePane(paneTarget);
        try {
          if (this.targetPanePattern.test(content)) {
            if (this.verbose) {
              console.log(
                `[Generic] Found matching pane: ${paneTarget}`
              );
            }
            return paneTarget;
          }
        } catch (regexError) {
          // Log regex test errors but continue searching
          const errorMsg = regexError instanceof Error ? regexError.message : String(regexError);
          if (this.verbose) {
            console.error(
              `[Generic] Regex test error on pane ${paneTarget}: ${errorMsg}`
            );
          }
        }
      } catch (error) {
        // Continue to next pane on capture errors
      }
    }

    throw new Error(
      `No pane found matching pattern: ${this.targetPanePattern}\n` +
      `Window: ${windowTarget}`
    );
  }

  /**
   * Check if the application is ready.
   * If readyIndicator is provided, waits for it to appear in the pane.
   * Otherwise, assumes ready after a short delay.
   *
   * @param paneName tmux pane target
   * @returns true if ready
   * @throws Error if readiness check fails
   */
  async isReady(paneName: string): Promise<boolean> {
    if (this.verbose) {
      console.log(`[Generic] Checking readiness of pane ${paneName}`);
    }

    // If no ready indicator specified, assume ready after startup
    if (!this.readyIndicator) {
      if (this.verbose) {
        console.log(`[Generic] No ready indicator specified, assuming ready`);
      }
      return true;
    }

    // Wait for ready indicator to appear
    if (this.verbose) {
      console.log(
        `[Generic] Waiting for ready indicator: "${this.readyIndicator}"`
      );
    }

    try {
      const found = await tmux.waitForText(paneName, this.readyIndicator, 5000, 200);
      if (this.verbose) {
        console.log(
          `[Generic] Ready indicator ${
            found ? "found" : "not found (timeout)"
          }`
        );
      }
      return found;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to check application readiness: ${errorMsg}\n` +
        `Pane: ${paneName}`
      );
    }
  }

  /**
   * Clean up resources.
   * Kills the tmux window.
   *
   * Note: This adapter throws on cleanup errors, unlike Canvas which warns.
   * This is appropriate for generic applications where cleanup failure is
   * always an error condition (we control the entire lifecycle).
   *
   * @param sessionName tmux session name
   * @param windowName tmux window name
   * @throws Error if cleanup fails
   */
  async cleanup(sessionName: string, windowName: string): Promise<void> {
    const windowTarget = `${sessionName}:${windowName}`;

    if (this.verbose) {
      console.log(`[Generic] Cleaning up window ${windowTarget}`);
    }

    try {
      await tmux.killWindow(windowTarget);
      if (this.verbose) {
        console.log(`[Generic] Window killed successfully`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to clean up window: ${errorMsg}\n` +
        `Target: ${windowTarget}`
      );
    }
  }

  /**
   * Build the complete command with arguments.
   * Joins launchCommand and args with proper spacing.
   *
   * @returns full command string
   */
  private buildCommand(): string {
    if (this.args.length === 0) {
      return this.launchCommand;
    }
    return `${this.launchCommand} ${this.args.join(" ")}`;
  }
}

/**
 * Create a generic adapter instance.
 *
 * @param launchCommand command to execute
 * @param options Optional configuration (args, patterns, ready indicator, verbose)
 * @returns Generic adapter ready for use
 */
export function createGenericAdapter(
  launchCommand: string,
  options?: {
    args?: string[];
    targetPanePattern?: string;
    readyIndicator?: string;
    verbose?: boolean;
  }
): GenericAdapter {
  return new GenericAdapter({
    launchCommand,
    ...options,
  });
}

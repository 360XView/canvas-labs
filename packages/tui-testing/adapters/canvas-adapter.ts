/**
 * Canvas vTA Lab System Adapter
 *
 * Integrates Canvas labs with the TUI testing framework.
 * Handles launching Canvas labs, finding the Docker container pane,
 * waiting for readiness, and cleaning up containers.
 *
 * Canvas creates a split-pane window:
 * - Pane 0: vTA Canvas (UI)
 * - Pane 1: Docker container (target for commands)
 *
 * Lab modules are located at:
 * /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin/labs/{moduleId}/module.yaml
 */

// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { execFile } from "child_process";
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { promisify } from "util";
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { readdir, stat } from "fs/promises";
// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { spawn } from "child_process";

import type { TUIAppAdapter, LaunchOptions, LaunchResult } from "./adapter-interface";
import * as tmux from "../src/tmux-controller";

const execFileAsync = promisify(execFile);

/**
 * Configuration for Canvas adapter
 */
interface CanvasAdapterConfig {
  /** Canvas module ID (e.g., "linux-user-management", "shell-navigation") */
  moduleId: string;

  /** Path to Canvas installation (defaults to official location) */
  canvasPath?: string;

  /** Disable AI tutor pane (launches with --no-tutor flag) */
  noTutor?: boolean;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Canvas vTA Lab System Adapter
 * Launches Canvas labs and integrates with the testing framework.
 */
export class CanvasAdapter implements TUIAppAdapter {
  readonly name = "Canvas vTA";
  readonly description =
    "Virtual Teaching Assistant lab system with automated task detection";

  private moduleId: string;
  private canvasPath: string;
  private noTutor: boolean;
  private verbose: boolean;

  /**
   * Create a Canvas adapter instance.
   *
   * @param config Canvas configuration
   * @throws Error if moduleId is missing
   */
  constructor(config: CanvasAdapterConfig) {
    if (!config.moduleId || typeof config.moduleId !== "string") {
      throw new Error("Canvas adapter requires moduleId (lab module identifier)");
    }

    this.moduleId = config.moduleId;
    this.canvasPath =
      config.canvasPath ||
      process.env.CANVAS_HOME ||
      "/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin";
    this.noTutor = config.noTutor || false;
    this.verbose = config.verbose || false;
  }

  /**
   * Launch a Canvas lab.
   * Runs the Canvas CLI command and waits for the Docker container to start.
   *
   * @param options Launch options (sessionName, windowName)
   * @returns Launch result with tmux coordinates and log directory
   * @throws Error if Canvas command fails or lab doesn't start
   */
  async launch(options: LaunchOptions): Promise<LaunchResult> {
    const sessionName = options.sessionName || `canvas-lab-${Date.now()}`;
    const windowName = options.windowName || "canvas-lab";

    if (this.verbose) {
      console.log(`[Canvas] Launching lab: ${this.moduleId}`);
      console.log(`[Canvas] Canvas path: ${this.canvasPath}`);
      console.log(`[Canvas] Session: ${sessionName}, Window: ${windowName}`);
    }

    // Create a new tmux window
    let windowIndex: string;
    try {
      windowIndex = await tmux.createWindow(sessionName, windowName);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to create Canvas window: ${errorMsg}\n` +
        `Ensure tmux is installed and you have a session named "${sessionName}"`
      );
    }

    const windowTarget = `${sessionName}:${windowIndex}`;

    // Build Canvas command
    const cmd = `cd ${this.canvasPath} && bun run src/cli.ts lab ${this.moduleId}${
      this.noTutor ? " --no-tutor" : ""
    }`;

    if (this.verbose) {
      console.log(`[Canvas] Running command: ${cmd}`);
    }

    // Launch Canvas in the window
    try {
      await tmux.sendCommand(windowTarget, cmd);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await tmux.killWindow(windowTarget).catch(() => {
        /* ignore cleanup errors */
      });
      throw new Error(
        `Failed to launch Canvas lab: ${errorMsg}\n` +
        `Command: ${cmd}\n` +
        `Check that Canvas is installed at ${this.canvasPath}`
      );
    }

    // Wait for log directory to appear (Canvas creates /tmp/lab-logs-*)
    let logDir: string | undefined;
    try {
      logDir = await this.waitForLogDirectory(10000); // 10 second timeout
      if (this.verbose) {
        console.log(`[Canvas] Log directory: ${logDir}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await tmux.killWindow(windowTarget).catch(() => {
        /* ignore cleanup errors */
      });
      throw new Error(
        `Canvas lab failed to start: ${errorMsg}\n` +
        `Ensure the module "${this.moduleId}" exists and all prerequisites are met.`
      );
    }

    return {
      sessionName,
      windowName,
      targetPaneName: windowTarget,
      logDir,
    };
  }

  /**
   * Find the target pane (Docker container pane).
   * Canvas creates multiple panes; we want the one with "student@" prompt.
   *
   * @param sessionName tmux session name
   * @param windowName tmux window name
   * @returns tmux target (e.g., "session:window.pane")
   * @throws Error if target pane not found
   */
  async findTargetPane(sessionName: string, windowName: string): Promise<string> {
    const windowTarget = `${sessionName}:${windowName}`;

    if (this.verbose) {
      console.log(`[Canvas] Finding target pane in ${windowTarget}`);
    }

    // List panes in the window
    let panes: string[];
    try {
      panes = await tmux.listPanes(windowTarget);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to list panes in Canvas window: ${errorMsg}\n` +
        `Target: ${windowTarget}`
      );
    }

    if (panes.length === 0) {
      throw new Error(
        `No panes found in Canvas window ${windowTarget}\n` +
        `Canvas should create split panes (vTA and Docker container)`
      );
    }

    // Find the pane with "student@" prompt (Docker container)
    // Typically index 1 (vTA is 0), but check all panes to be safe
    for (const paneIndex of panes) {
      const paneTarget = `${windowTarget}.${paneIndex}`;
      try {
        const content = await tmux.capturePane(paneTarget);
        if (content.includes("student@")) {
          if (this.verbose) {
            console.log(`[Canvas] Found target pane: ${paneTarget}`);
          }
          return paneTarget;
        }
      } catch (error) {
        // Continue to next pane
      }
    }

    // If no "student@" found, use the last pane (typically the Docker pane)
    const lastPaneIndex = panes[panes.length - 1];
    const defaultTarget = `${windowTarget}.${lastPaneIndex}`;

    if (this.verbose) {
      console.log(
        `[Canvas] No "student@" found, using default pane: ${defaultTarget}`
      );
    }

    return defaultTarget;
  }

  /**
   * Check if the Canvas lab is ready (Docker container prompt is visible).
   *
   * @param paneName tmux pane target
   * @returns true if ready, false if timeout
   * @throws Error if readiness check fails
   */
  async isReady(paneName: string): Promise<boolean> {
    const maxRetries = 5;
    const retryDelay = 500; // milliseconds

    if (this.verbose) {
      console.log(`[Canvas] Checking readiness of pane ${paneName}`);
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const content = await tmux.capturePane(paneName);

        // Check for shell prompts at end of line (anchored regex to avoid false matches)
        if (/\n[$#]\s*$/.test(content)) {
          if (this.verbose) {
            console.log(
              `[Canvas] Pane is ready (attempt ${attempt}/${maxRetries})`
            );
          }
          return true;
        }

        if (this.verbose) {
          console.log(
            `[Canvas] Not ready yet (attempt ${attempt}/${maxRetries}), retrying...`
          );
        }
      } catch (error) {
        // Retry on capture errors (pane might be initializing)
        if (this.verbose) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.log(`[Canvas] Capture error (attempt ${attempt}): ${errorMsg}`);
        }
      }

      // Wait before next retry (except on last attempt)
      if (attempt < maxRetries) {
        await new Promise((resolve: (value: void) => void) =>
          setTimeout(resolve, retryDelay)
        );
      }
    }

    if (this.verbose) {
      console.log(
        `[Canvas] Pane not ready after ${maxRetries} attempts (${
          maxRetries * retryDelay
        }ms)`
      );
    }

    return false;
  }

  /**
   * Clean up Canvas resources.
   * Kills the tmux window and any Docker containers created by Canvas.
   *
   * Note: This adapter warns on cleanup errors rather than throwing, allowing
   * partial cleanup to succeed. This is intentional because Docker cleanup can
   * fail safely if containers were already removed or Docker is not running.
   * The critical cleanup (killing the tmux window) is attempted first.
   *
   * @param sessionName tmux session name
   * @param windowName tmux window name
   * @logs Warning messages on cleanup errors (does not throw)
   */
  async cleanup(sessionName: string, windowName: string): Promise<void> {
    const windowTarget = `${sessionName}:${windowName}`;

    if (this.verbose) {
      console.log(`[Canvas] Cleaning up window ${windowTarget}`);
    }

    const errors: string[] = [];

    // Kill the tmux window
    try {
      await tmux.killWindow(windowTarget);
      if (this.verbose) {
        console.log(`[Canvas] Killed window ${windowTarget}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to kill window: ${errorMsg}`);
    }

    // Kill Docker containers with canvas-lab label
    try {
      await this.killDockerContainers();
      if (this.verbose) {
        console.log(`[Canvas] Killed Docker containers`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to kill Docker containers: ${errorMsg}`);
    }

    // Report any errors (don't throw on first one, report all)
    if (errors.length > 0) {
      console.warn(`[Canvas] Cleanup completed with errors:\n${errors.join("\n")}`);
    }
  }

  /**
   * Wait for Canvas log directory to appear.
   * Canvas creates /tmp/lab-logs-{timestamp} when starting.
   * Uses file modification times (not lexicographic sort) to find the most recent directory.
   *
   * @param timeout max wait time in milliseconds
   * @returns path to log directory
   * @throws Error if timeout or no logs found
   */
  private async waitForLogDirectory(timeout: number): Promise<string> {
    const startTime = Date.now();
    const pollInterval = 500; // Check every 500ms

    if (this.verbose) {
      console.log(`[Canvas] Waiting for log directory (timeout: ${timeout}ms)`);
    }

    while (Date.now() - startTime < timeout) {
      try {
        const tmpDir = "/tmp";
        const entries = await readdir(tmpDir);

        // Look for lab-logs-* directories
        const logDirs = entries
          .filter((name: string) => name.startsWith("lab-logs-"))
          .map((name: string) => `${tmpDir}/${name}`);

        if (logDirs.length > 0) {
          // Find the most recent directory by modification time
          const dirsWithMtime = await Promise.all(
            logDirs.map(async (dir) => ({
              dir,
              mtime: (await stat(dir)).mtimeMs,
            }))
          );
          const mostRecent = dirsWithMtime.sort((a, b) => b.mtime - a.mtime)[0];
          return mostRecent.dir;
        }
      } catch (error) {
        // Continue polling on read errors
      }

      await new Promise((resolve: (value: void) => void) =>
        setTimeout(resolve, pollInterval)
      );
    }

    throw new Error(
      `Canvas lab did not create log directory within ${timeout}ms\n` +
      `Check that Canvas is properly installed and the lab module exists`
    );
  }

  /**
   * Kill Docker containers created by Canvas.
   * Matches on container name containing "canvas-lab".
   *
   * @throws Error if Docker kill command fails
   */
  private async killDockerContainers(): Promise<void> {
    try {
      // List containers with canvas-lab in the name
      const result = await execFileAsync("docker", [
        "ps",
        "-a",
        "--format",
        "{{.ID}}|{{.Names}}",
      ]);

      const lines = result.stdout.trim().split("\n").filter((l: string) => l);
      const containerIds: string[] = [];

      for (const line of lines) {
        const [id, names] = line.split("|");
        if (names && names.includes("canvas-lab")) {
          containerIds.push(id);
        }
      }

      if (containerIds.length > 0) {
        if (this.verbose) {
          console.log(`[Canvas] Found ${containerIds.length} Docker containers to remove`);
        }

        // Remove containers
        await execFileAsync("docker", ["rm", "-f", ...containerIds]);
      }
    } catch (error) {
      // Docker might not be running or containers already removed
      // This is not fatal - continue with cleanup
      if (this.verbose) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[Canvas] Docker cleanup note: ${errorMsg}`);
      }
    }
  }
}

/**
 * Create a Canvas adapter instance.
 *
 * @param moduleId Canvas lab module ID
 * @param options Optional configuration (canvasPath, noTutor, verbose)
 * @returns Canvas adapter ready for use
 */
export function createCanvasAdapter(
  moduleId: string,
  options?: {
    canvasPath?: string;
    noTutor?: boolean;
    verbose?: boolean;
  }
): CanvasAdapter {
  return new CanvasAdapter({
    moduleId,
    ...options,
  });
}

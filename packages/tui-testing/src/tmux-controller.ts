// tmux Controller - Utilities for controlling tmux panes
// Provides high-level functions for test automation
//
// Generic tmux abstraction with no framework-specific dependencies.
// Can be used in any testing framework that needs tmux interaction.

// @ts-ignore - Node.js built-in module
import { execFile } from "child_process";
// @ts-ignore - Node.js built-in module
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Validate tmux target format (session:window.pane or session:window)
 * @param target tmux target string
 * @throws Error if target format is invalid
 */
function validateTarget(target: string): void {
  if (!target || typeof target !== "string" || target.trim().length === 0) {
    throw new Error(
      'Invalid tmux target: empty or null. Expected format "session:window.pane" or "session:window"'
    );
  }
  if (!target.includes(":")) {
    throw new Error(
      `Invalid tmux target format: "${target}". Expected format "session:window.pane" or "session:window"`
    );
  }
}

/**
 * Get the current tmux session from TMUX environment variable
 * Parses the format: session_name,window_index,pane_index
 * @returns session name or null if not in a tmux session
 */
export function getCurrentSession(): string | null {
  // @ts-ignore - process is a Node.js global
  const tmuxEnv = process.env.TMUX;
  if (!tmuxEnv) {
    return null;
  }
  // Format: /tmp/tmux-1000/default,0,0
  // We want the session name part
  const parts = tmuxEnv.split(",");
  if (parts.length < 2) {
    return null;
  }
  // Extract session name from path like /tmp/tmux-1000/session-name
  const sessionPath = parts[0];
  const sessionName = sessionPath.split("/").pop();
  return sessionName || null;
}

/**
 * Send keyboard input to a tmux pane
 * @param target tmux target (e.g., "session:window.pane")
 * @param keys keys to send (literal text)
 * @throws Error if target is invalid or tmux command fails
 */
export async function sendKeys(target: string, keys: string): Promise<void> {
  if (!keys || typeof keys !== "string") {
    throw new Error('Invalid keys: must be a non-empty string');
  }
  validateTarget(target);

  try {
    await execFileAsync("tmux", ["send-keys", "-t", target, "-l", keys]);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to send keys to pane "${target}": ${errorMsg}\n` +
      `Ensure the target exists and tmux is running.`
    );
  }
}

/**
 * Send a command to a tmux pane (text + Enter)
 * @param target tmux target (e.g., "session:window.pane")
 * @param cmd command to execute
 * @throws Error if target is invalid or tmux command fails
 */
export async function sendCommand(target: string, cmd: string): Promise<void> {
  if (!cmd || typeof cmd !== "string") {
    throw new Error('Invalid command: must be a non-empty string');
  }
  validateTarget(target);

  try {
    await execFileAsync("tmux", ["send-keys", "-t", target, "-l", cmd]);
    await execFileAsync("tmux", ["send-keys", "-t", target, "C-m"]);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to send command to pane "${target}": ${errorMsg}\n` +
      `Ensure the target exists and tmux is running.`
    );
  }
}

/**
 * Capture the visible text from a tmux pane
 * @param target tmux target (e.g., "session:window.pane")
 * @returns the pane content as a string (may contain ANSI escape codes for colors/formatting)
 * @throws Error if target is invalid or capture fails
 *
 * Note: The returned content may contain ANSI escape codes for terminal formatting.
 * To strip them if needed, use a regex like `/\x1b\[[0-9;]*m/g`
 */
export async function capturePane(target: string): Promise<string> {
  validateTarget(target);

  try {
    const result = await execFileAsync("tmux", ["capture-pane", "-t", target, "-p"]);
    return result.stdout;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to capture pane "${target}": ${errorMsg}\n` +
      `Ensure the target exists and tmux is running.`
    );
  }
}

/**
 * Wait for text to appear in a tmux pane
 * Polls pane content at regular intervals until text is found or timeout.
 *
 * @param target tmux target (e.g., "session:window.pane")
 * @param text text to wait for (substring match)
 * @param timeout max wait time in milliseconds (default: 10s)
 * @param pollInterval polling interval in milliseconds (default: 200ms)
 * @returns true if text found, false if timeout
 * @throws Error if target is invalid or polling encounters a fatal error
 *
 * Race Condition Note: There's a small window between checking content and the next poll
 * where text could appear and disappear before being detected. For time-sensitive operations,
 * increase timeout or pollInterval. Example: slow operations might need 20s timeout or 500ms pollInterval.
 */
export async function waitForText(
  target: string,
  text: string,
  timeout: number = 10000,
  pollInterval: number = 200
): Promise<boolean> {
  if (!text || typeof text !== "string") {
    throw new Error('Invalid text: must be a non-empty string');
  }
  if (timeout <= 0) {
    throw new Error('Invalid timeout: must be a positive number');
  }
  if (pollInterval <= 0) {
    throw new Error('Invalid pollInterval: must be a positive number');
  }
  validateTarget(target);

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const content = await capturePane(target);
      if (content.includes(text)) {
        return true;
      }
    } catch (error) {
      // Log but continue polling - transient capture failures can happen
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`Transient error during waitForText: ${errorMsg}`);
    }
    await new Promise((resolve: (value: void) => void) => setTimeout(resolve, pollInterval));
  }

  return false;
}

/**
 * Get information about tmux sessions and windows
 * @returns object with session info including list of sessions, current session, and windows
 * @throws Error if tmux command fails
 *
 * The currentSession is determined by parsing the TMUX environment variable if available.
 * If not in a tmux session or the variable cannot be parsed, currentSession will be null.
 */
export async function getSessionInfo(): Promise<{
  sessions: string[];
  currentSession: string | null;
  windows: { session: string; windows: string[] }[];
}> {
  try {
    const sessionsResult = await execFileAsync("tmux", ["list-sessions", "-F", "#{session_name}"]);
    const sessions = sessionsResult.stdout.trim().split("\n").filter((s: string) => s);

    // If we're in tmux, try to get the current session from TMUX env var
    const currentSession = getCurrentSession();

    const windows: { session: string; windows: string[] }[] = [];
    for (const session of sessions) {
      try {
        const windowsResult = await execFileAsync("tmux", [
          "list-windows",
          "-t",
          session,
          "-F",
          "#{window_name}",
        ]);
        const windowList = windowsResult.stdout.trim().split("\n").filter((w: string) => w);
        windows.push({ session, windows: windowList });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to list windows for session "${session}": ${errorMsg}`
        );
      }
    }

    return { sessions, currentSession, windows };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to get session info: ${errorMsg}\n` +
      `Ensure tmux is installed and running.`
    );
  }
}

/**
 * Create a new tmux window in a session
 * @param sessionName session name
 * @param windowName window name (optional)
 * @returns window index as a string (e.g., "2", "0")
 * @throws Error if session does not exist or tmux command fails
 *
 * Example:
 *   const windowIndex = await createWindow("my-session", "test-window");
 *   // Returns "2" for the third window (0-indexed)
 */
export async function createWindow(sessionName: string, windowName?: string): Promise<string> {
  if (!sessionName || typeof sessionName !== "string" || sessionName.trim().length === 0) {
    throw new Error('Invalid session name: must be a non-empty string');
  }
  if (windowName !== undefined && (typeof windowName !== "string" || windowName.trim().length === 0)) {
    throw new Error('Invalid window name: must be a non-empty string or undefined');
  }

  const args = ["new-window", "-t", sessionName, "-P", "-F", "#{window_index}"];
  if (windowName) {
    args.push("-n", windowName);
  }

  try {
    const result = await execFileAsync("tmux", args);
    return result.stdout.trim();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to create window in session "${sessionName}": ${errorMsg}\n` +
      `Ensure the session exists and tmux is running.`
    );
  }
}

/**
 * Kill a tmux window
 * @param target tmux target (e.g., "session:window")
 * @throws Error if target is invalid or window does not exist
 */
export async function killWindow(target: string): Promise<void> {
  validateTarget(target);

  try {
    await execFileAsync("tmux", ["kill-window", "-t", target]);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to kill window "${target}": ${errorMsg}\n` +
      `Ensure the target exists and tmux is running.`
    );
  }
}

/**
 * List panes in a window
 * @param target tmux target (e.g., "session:window")
 * @returns array of pane indices as strings
 * @throws Error if target is invalid or window does not exist
 */
export async function listPanes(target: string): Promise<string[]> {
  validateTarget(target);

  try {
    const result = await execFileAsync("tmux", [
      "list-panes",
      "-t",
      target,
      "-F",
      "#{pane_index}",
    ]);
    return result.stdout.trim().split("\n").filter((p: string) => p);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to list panes in window "${target}": ${errorMsg}\n` +
      `Ensure the target exists and tmux is running.`
    );
  }
}

/**
 * Select a pane (make it active)
 * @param target tmux target (e.g., "session:window.pane")
 * @throws Error if target is invalid or pane does not exist
 */
export async function selectPane(target: string): Promise<void> {
  validateTarget(target);

  try {
    await execFileAsync("tmux", ["select-pane", "-t", target]);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to select pane "${target}": ${errorMsg}\n` +
      `Ensure the target exists and tmux is running.`
    );
  }
}

/**
 * Get the current working directory of a pane
 * @param target tmux target (e.g., "session:window.pane")
 * @returns path to working directory
 * @throws Error if target is invalid or pane does not exist
 */
export async function getPaneDirectory(target: string): Promise<string> {
  validateTarget(target);

  try {
    const result = await execFileAsync("tmux", ["display-message", "-t", target, "-p", "#{pane_current_path}"]);
    return result.stdout.trim();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to get directory for pane "${target}": ${errorMsg}\n` +
      `Ensure the target exists and tmux is running.`
    );
  }
}

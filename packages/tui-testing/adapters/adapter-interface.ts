/**
 * TUI Application Adapter Interface
 *
 * Defines the contract for adapters that integrate different TUI applications
 * with the test framework. Each adapter is responsible for:
 * - Launching the TUI application in a tmux window
 * - Finding the target pane where commands will be executed
 * - Checking application readiness
 * - Cleaning up resources after testing
 *
 * This enables the framework to work with any TUI application type through
 * a unified interface while allowing app-specific customizations.
 */

/**
 * Options for launching a TUI application.
 * Includes generic options and pass-through for app-specific configuration.
 */
export interface LaunchOptions {
  /** Optional session name for the tmux session (generated if not provided) */
  sessionName?: string;

  /** Optional window name for the tmux window (generated if not provided) */
  windowName?: string;

  /** Enable verbose logging for debugging */
  verbose?: boolean;

  /** App-specific options passed through to the adapter (any key-value pairs) */
  [key: string]: any;
}

/**
 * Result of a successful application launch.
 * Contains the tmux coordinates and optional paths to application resources.
 */
export interface LaunchResult {
  /** The tmux session name where the app was launched */
  sessionName: string;

  /** The tmux window name */
  windowName: string;

  /** The specific pane to target for commands and assertions */
  targetPaneName: string;

  /** Optional: Path to application log directory (if available) */
  logDir?: string;
}

/**
 * State observer for monitoring application state.
 * Phase 3 will expand this to include state matching capabilities.
 * For now, implementations can return null.
 */
export interface StateObserver {
  /**
   * Wait for a condition to be true (Phase 3).
   * Implementations may be added in future phases.
   */
  waitFor?(condition: any, timeout: number): Promise<boolean>;
}

/**
 * TUI Application Adapter.
 * Implementations must provide all methods to integrate a specific TUI application.
 */
export interface TUIAppAdapter {
  /** Human-readable name of the application (e.g., "Canvas vTA", "Splunk CLI") */
  readonly name: string;

  /** Description of the application and what this adapter does */
  readonly description: string;

  /**
   * Launch the TUI application.
   * Creates a new tmux session and window, starts the application, and returns
   * coordinates for sending commands and monitoring progress.
   *
   * @param options Launch configuration (generic and app-specific)
   * @returns Launch result with tmux coordinates and application paths
   * @throws Error if launch fails (e.g., command not found, prerequisites missing)
   *
   * Error messages should be descriptive, mentioning:
   * - What failed (launch, setup, environment check)
   * - Why it failed (missing prerequisites, command error)
   * - How to fix it (install dependencies, check configuration)
   */
  launch(options: LaunchOptions): Promise<LaunchResult>;

  /**
   * Find the target pane in the window.
   * Applications may create multiple panes (e.g., Canvas creates vTA + Docker panes).
   * This method identifies which pane to target for test commands.
   *
   * @param sessionName tmux session name
   * @param windowName tmux window name
   * @returns tmux target string (e.g., "session:window.pane")
   * @throws Error if target pane cannot be found
   */
  findTargetPane(sessionName: string, windowName: string): Promise<string>;

  /**
   * Check if the application is ready for commands.
   * Polls the target pane until a ready indicator appears (e.g., shell prompt)
   * or timeout is exceeded.
   *
   * @param paneName tmux pane target (from findTargetPane)
   * @returns true if application is ready, false if timeout
   * @throws Error if readiness check encounters a fatal error
   *
   * Implementations should retry 3-5 times with 500ms delays to account for
   * application startup time.
   */
  isReady(paneName: string): Promise<boolean>;

  /**
   * Optional: State observer for the application.
   * Can be null for Phase 2 (will be implemented in Phase 3).
   * When implemented, enables waiting for specific application states.
   */
  observeState?: StateObserver;

  /**
   * Clean up resources and shut down the application.
   * Called when testing completes or an error occurs.
   * Must clean up:
   * - tmux window
   * - Any containers or processes created during launch
   * - Temporary files or resources
   *
   * @param sessionName tmux session name
   * @param windowName tmux window name
   * @throws Error if cleanup fails (should still attempt all cleanup steps)
   *
   * Errors during cleanup should not prevent other cleanup steps from running.
   * Consider logging cleanup errors rather than throwing on the first error.
   */
  cleanup(sessionName: string, windowName: string): Promise<void>;
}

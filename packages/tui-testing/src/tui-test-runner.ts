/**
 * TUI Test Runner - Phase 4
 *
 * Generic test runner that orchestrates the adapter system and state observers
 * into a cohesive testing framework.
 *
 * Handles:
 * - Launching TUI applications via adapters
 * - Finding target panes for test execution
 * - Waiting for applications to be ready
 * - Executing test functions with full control
 * - Automatic cleanup and reporting
 * - State observation and assertions
 *
 * Works with any TUI application through the adapter interface.
 */

// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import { randomBytes } from "crypto";

import type { TUIAppAdapter } from "../adapters/adapter-interface.js";
import type {
  StateCondition,
  StateObserver as StateObserverType,
} from "./state-observer.js";
import { TextStateObserver, CanvasStateObserver } from "./state-observer.js";
import * as tmux from "./tmux-controller.js";
import { TestLogger, TestReport } from "./reporter.js";

/**
 * Configuration for test runner
 */
export interface TUITestConfig {
  /** The adapter to use (CanvasAdapter, GenericAdapter, or custom) */
  adapter: TUIAppAdapter;

  /** Optional: session name (auto-generated if not provided) */
  sessionName?: string;

  /** Optional: enable verbose logging */
  verbose?: boolean;

  /** Optional: custom timeouts (all in milliseconds) */
  timeouts?: {
    launch?: number; // How long to wait for app to launch (default 30000)
    ready?: number; // How long to wait for app to be ready (default 10000)
    action?: number; // How long to wait for actions to complete (default 5000)
  };
}

/**
 * Context object passed to test functions
 * Provides all test capabilities: actions and assertions
 */
export interface TestContext {
  // Session/window/pane info
  sessionName: string;
  windowName: string;
  targetPane: string;
  logDir?: string; // For Canvas labs with telemetry

  // === ACTIONS ===

  /**
   * Send raw tmux keys (e.g., "ArrowRight", "C-c", "Enter")
   * See tmux send-keys documentation for key names
   */
  sendKeys(keys: string): Promise<void>;

  /**
   * Send a shell command and press Enter
   * Equivalent to: tmux send-keys "command" Enter
   */
  sendCommand(cmd: string): Promise<void>;

  /**
   * Capture and return current pane content as text
   */
  capturePane(): Promise<string>;

  // === ASSERTIONS / WAITING ===

  /**
   * Wait for text to appear in pane (default timeout from config)
   * Returns true if text found, false if timeout
   */
  waitForText(
    text: string,
    timeout?: number,
    caseSensitive?: boolean
  ): Promise<boolean>;

  /**
   * Wait for any StateCondition (text, file, custom)
   * Returns true if condition met, false if timeout
   */
  waitForCondition(
    condition: StateCondition,
    timeout?: number
  ): Promise<boolean>;

  /**
   * Assert pane contains text, throw if not found
   * Useful for strong guarantees in test
   */
  assertPaneContains(text: string, caseSensitive?: boolean): Promise<void>;

  /**
   * Assert condition is currently true, throw if not
   * Useful for strong guarantees in test
   */
  assertCondition(condition: StateCondition, timeout?: number): Promise<void>;

  /**
   * Assert pane does NOT contain text
   */
  assertPaneNotContains(text: string, caseSensitive?: boolean): Promise<void>;

  /**
   * Wait for condition OR fail with descriptive error
   * Combines waitForCondition + assertCondition in one call
   */
  assertWaitFor(
    condition: StateCondition,
    timeout?: number
  ): Promise<void>;
}

/**
 * TUI Test Runner
 *
 * Orchestrates the full test lifecycle: setup, execution, cleanup, and reporting.
 */
export class TUITestRunner {
  private defaultTimeouts: {
    launch: number;
    ready: number;
    action: number;
  };

  constructor(private config: TUITestConfig) {
    this.defaultTimeouts = {
      launch: config.timeouts?.launch || 30000,
      ready: config.timeouts?.ready || 10000,
      action: config.timeouts?.action || 5000,
    };
  }

  /**
   * Run a test function with automatic setup/cleanup
   *
   * Usage:
   * ```typescript
   * const runner = new TUITestRunner({ adapter });
   * const report = await runner.run(async (ctx) => {
   *   await ctx.sendKeys("ArrowRight");
   *   await ctx.assertPaneContains("Step 2");
   * });
   * ```
   *
   * Returns a TestReport with pass/fail status and detailed results
   */
  async run(
    testFn: (ctx: TestContext) => Promise<void>
  ): Promise<TestReport> {
    const logger = new TestLogger();
    let sessionName: string | null = null;
    let windowName: string | null = null;

    try {
      // === SETUP PHASE ===
      this.log("Launching app...");
      const setupStart = Date.now();

      // Generate session name if not provided
      sessionName = this.config.sessionName || this.generateSessionName();

      // Launch the application
      const launchResult = await this.config.adapter.launch({
        sessionName,
        verbose: this.config.verbose,
      });
      windowName = launchResult.windowName;

      this.log(`Launched on ${launchResult.sessionName}:${launchResult.windowName}`);

      // Find the target pane
      this.log("Finding target pane...");
      const targetPane = await this.config.adapter.findTargetPane(
        launchResult.sessionName,
        launchResult.windowName
      );
      this.log(`Target pane: ${targetPane}`);

      // Wait for app to be ready
      this.log("Waiting for app to be ready...");
      const isReady = await this.waitForReady(targetPane);

      if (!isReady) {
        throw new Error(
          `Application did not become ready within ${this.defaultTimeouts.ready}ms`
        );
      }

      const setupDuration = Date.now() - setupStart;
      this.log(`Setup complete in ${setupDuration}ms`);

      // Create state observer (Canvas or Text based on adapter)
      const stateObserver = this.createStateObserver(targetPane, launchResult.logDir);

      // Create test context
      const testContext = this.createTestContext(launchResult, targetPane, stateObserver);

      // === TEST EXECUTION ===
      this.log("Executing test...");
      const testStart = Date.now();
      await testFn(testContext);
      const testDuration = Date.now() - testStart;

      logger.logSuccess("Test execution", testDuration);
      this.log(`Test passed in ${testDuration}ms`);

      return logger.getReport(this.config.adapter.name);
    } catch (error) {
      // === ERROR HANDLING ===
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Test failed: ${errorMsg}`);
      logger.logFailure("Test execution", 0, errorMsg);
      return logger.getReport(this.config.adapter.name);
    } finally {
      // === CLEANUP PHASE ===
      if (sessionName && windowName) {
        try {
          this.log("Cleaning up...");
          await this.config.adapter.cleanup(sessionName, windowName);
          this.log("Cleanup complete");
        } catch (cleanupError) {
          const cleanupMsg =
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          this.log(`Warning: Cleanup error: ${cleanupMsg}`);
        }
      }
    }
  }

  /**
   * Generate a unique session name using timestamp and random bytes
   */
  private generateSessionName(): string {
    // @ts-ignore - Node.js global
    const randomHex = randomBytes(4).toString("hex").slice(0, 6);
    const timestamp = Date.now().toString(36);
    return `test-${timestamp}-${randomHex}`;
  }

  /**
   * Wait for application to be ready, with retries
   * Polls isReady() until true or timeout
   */
  private async waitForReady(targetPane: string): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 200;

    while (Date.now() - startTime < this.defaultTimeouts.ready) {
      try {
        const ready = await this.config.adapter.isReady(targetPane);
        if (ready) {
          return true;
        }
      } catch (error) {
        // Continue polling on transient errors
        this.log(`Readiness check error (continuing): ${error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return false;
  }

  /**
   * Create appropriate state observer based on adapter and context
   */
  private createStateObserver(
    targetPane: string,
    logDir?: string
  ): StateObserverType {
    // If logDir is provided, use Canvas observer
    if (logDir) {
      return new CanvasStateObserver(logDir, tmux);
    }

    // Default to text observer for generic TUI apps
    return new TextStateObserver(targetPane, tmux);
  }

  /**
   * Create the test context that will be passed to test functions
   */
  private createTestContext(
    launchResult: Awaited<ReturnType<TUIAppAdapter["launch"]>>,
    targetPane: string,
    stateObserver: StateObserverType
  ): TestContext {
    const defaultTimeout = this.defaultTimeouts.action;

    return {
      sessionName: launchResult.sessionName,
      windowName: launchResult.windowName,
      targetPane,
      logDir: launchResult.logDir,

      // === ACTIONS ===

      async sendKeys(keys: string): Promise<void> {
        return tmux.sendKeys(targetPane, keys);
      },

      async sendCommand(cmd: string): Promise<void> {
        return tmux.sendCommand(targetPane, cmd);
      },

      async capturePane(): Promise<string> {
        return tmux.capturePane(targetPane);
      },

      // === ASSERTIONS / WAITING ===

      async waitForText(
        text: string,
        timeout: number = defaultTimeout,
        caseSensitive: boolean = true
      ): Promise<boolean> {
        const condition: StateCondition = {
          type: "text",
          pane: targetPane,
          text,
          caseSensitive,
          description: `Text "${text}" appears`,
        };

        return stateObserver.waitFor(condition, timeout);
      },

      async waitForCondition(
        condition: StateCondition,
        timeout: number = defaultTimeout
      ): Promise<boolean> {
        return stateObserver.waitFor(condition, timeout);
      },

      async assertPaneContains(
        text: string,
        caseSensitive: boolean = true
      ): Promise<void> {
        const found = await this.waitForText(text, defaultTimeout, caseSensitive);

        if (!found) {
          const diagnostics = await stateObserver.getDiagnostics({
            type: "text",
            pane: targetPane,
            text,
            caseSensitive,
            description: `Text "${text}" appears`,
          });

          throw new Error(
            `Assertion failed: Expected pane to contain "${text}"\n\n${diagnostics}`
          );
        }
      },

      async assertCondition(
        condition: StateCondition,
        timeout: number = defaultTimeout
      ): Promise<void> {
        const met = await stateObserver.waitFor(condition, timeout);

        if (!met) {
          const diagnostics = await stateObserver.getDiagnostics(condition);
          const conditionDesc = condition.description || "condition";

          throw new Error(
            `Assertion failed: Expected ${conditionDesc}\n\n${diagnostics}`
          );
        }
      },

      async assertPaneNotContains(
        text: string,
        caseSensitive: boolean = true
      ): Promise<void> {
        const content = await tmux.capturePane(targetPane);

        let found: boolean;
        if (caseSensitive) {
          found = content.includes(text);
        } else {
          found = content.toLowerCase().includes(text.toLowerCase());
        }

        if (found) {
          const lastLines = content
            .split("\n")
            .slice(-5)
            .join("\n");

          throw new Error(
            `Assertion failed: Expected pane to NOT contain "${text}"\n\n` +
            `Last 5 lines:\n${lastLines}`
          );
        }
      },

      async assertWaitFor(
        condition: StateCondition,
        timeout: number = defaultTimeout
      ): Promise<void> {
        const met = await stateObserver.waitFor(condition, timeout);

        if (!met) {
          const diagnostics = await stateObserver.getDiagnostics(condition);
          const conditionDesc = condition.description || "condition";

          throw new Error(
            `Assertion timed out after ${timeout}ms: Expected ${conditionDesc}\n\n${diagnostics}`
          );
        }
      },
    };
  }

  /**
   * Log a message if verbose mode is enabled
   */
  private log(msg: string): void {
    if (this.config.verbose) {
      console.log(`[TUITestRunner] ${msg}`);
    }
  }
}

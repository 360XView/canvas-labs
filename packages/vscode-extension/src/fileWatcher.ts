import * as vscode from "vscode";
import type { TestRunner } from "./testRunner";
import type { SubmissionWriter } from "./submissionWriter";

/**
 * Watches Python source files for changes and triggers test execution
 */
export class FileWatcher {
  private watcher: vscode.FileSystemWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 1500;
  private processedFiles = new Set<string>();

  /**
   * Start watching for Python file changes
   */
  watch(
    projectPath: string,
    testRunner: TestRunner,
    submissionWriter: SubmissionWriter,
    labId: string
  ): vscode.FileSystemWatcher {
    // Watch src/**/*.py for changes
    const pattern = new vscode.RelativePattern(projectPath, "src/**/*.py");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Use onDidChange to detect file saves
    this.watcher.onDidChange((uri: vscode.Uri) => {
      this.debouncedTest(uri, testRunner, submissionWriter, labId);
    });

    return this.watcher;
  }

  /**
   * Debounce test execution to avoid running tests too frequently
   */
  private debouncedTest(
    uri: vscode.Uri,
    testRunner: TestRunner,
    submissionWriter: SubmissionWriter,
    labId: string
  ): void {
    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(async () => {
      try {
        const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!projectPath) {
          return;
        }

        // Run tests
        const results = await testRunner.runTests(projectPath);

        // Write submission
        submissionWriter.writeSubmission(uri, results);
      } catch (error) {
        console.error("Error running tests:", error);
      }
    }, this.DEBOUNCE_MS);
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.processedFiles.clear();
  }
}

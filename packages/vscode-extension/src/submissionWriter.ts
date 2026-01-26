import * as fs from "fs";
import * as path from "path";
import type { TestResults, Submission } from "./types";

/**
 * Writes Python code submissions to submissions.log for Canvas integration
 */
export class SubmissionWriter {
  constructor(private labId: string) {}

  /**
   * Write a submission to the log file
   */
  writeSubmission(fileUri: any, testResults: TestResults): void {
    try {
      // Read the Python file contents
      const code = fs.readFileSync(fileUri.fsPath, "utf-8");
      const metadata = this.extractMetadata(code);

      const submission: Submission = {
        timestamp: new Date().toISOString(),
        file: path.basename(fileUri.fsPath),
        code,
        test_results: testResults,
        metadata,
      };

      // Create log directory if it doesn't exist
      const logPath = `/tmp/canvas-${this.labId}/submissions.log`;
      const logDir = path.dirname(logPath);

      console.log(`[SubmissionWriter] Lab ID: ${this.labId}`);
      console.log(`[SubmissionWriter] Log path: ${logPath}`);

      fs.mkdirSync(logDir, { recursive: true });

      // Append JSON Line to submissions.log
      fs.appendFileSync(logPath, JSON.stringify(submission) + "\n");

      console.log(`[SubmissionWriter] ✓ Submission logged: ${fileUri.fsPath}`);
    } catch (error) {
      console.error("[SubmissionWriter] ✗ Failed to write submission:", error);
    }
  }

  /**
   * Extract metadata from Python code
   */
  private extractMetadata(code: string) {
    // Count lines
    const lines = code.split("\n").length;

    // Extract function definitions
    const functionMatches = code.match(/def\s+(\w+)\s*\(/g) || [];
    const functions = functionMatches
      .map((m) => m.match(/def\s+(\w+)/)?.[1])
      .filter((f): f is string => !!f);

    return {
      line_count: lines,
      functions_defined: functions,
    };
  }
}

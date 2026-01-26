// Test Reporter - Generate test reports from test results
//
// Generic reporting utilities for recording and formatting test execution results.
// No framework-specific dependencies, works with any test system.

// @ts-ignore - Node.js built-in module
import { writeFile } from "fs/promises";

/**
 * A single test step result
 */
export interface TestResult {
  stepNumber: number;
  description: string;
  passed: boolean;
  duration: number; // milliseconds
  timestamp: string;
  error?: string;
}

/**
 * Full test report
 */
export interface TestReport {
  testName: string;
  date: string;
  passed: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  totalDuration: number;
  steps: TestResult[];
}

/**
 * Test logger for recording test steps
 * Records individual step results with timing and error information.
 * startTime is initialized on the first logStep call to capture actual test window.
 */
export class TestLogger {
  private steps: TestResult[] = [];
  private stepCounter = 0;
  private startTime: number | null = null;

  /**
   * Log a test step with arbitrary pass/fail status
   */
  logStep(description: string, passed: boolean, duration: number, error?: string): void {
    // Initialize startTime on first log step
    if (this.startTime === null) {
      this.startTime = Date.now();
    }

    this.stepCounter++;
    this.steps.push({
      stepNumber: this.stepCounter,
      description,
      passed,
      duration,
      timestamp: new Date().toISOString(),
      error,
    });
  }

  /**
   * Log a successful step
   */
  logSuccess(description: string, duration: number): void {
    this.logStep(description, true, duration);
  }

  /**
   * Log a failed step with error message
   */
  logFailure(description: string, duration: number, error: string): void {
    this.logStep(description, false, duration, error);
  }

  /**
   * Generate a complete test report
   */
  getReport(testName: string): TestReport {
    const totalDuration = this.startTime !== null ? Date.now() - this.startTime : 0;
    const passedSteps = this.steps.filter((s) => s.passed).length;
    const failedSteps = this.steps.filter((s) => !s.passed).length;

    return {
      testName,
      date: new Date().toISOString(),
      passed: failedSteps === 0,
      totalSteps: this.steps.length,
      passedSteps,
      failedSteps,
      totalDuration,
      steps: this.steps,
    };
  }
}

/**
 * Generate a markdown report from test results
 * Produces human-readable markdown with test status, step-by-step results, and summary.
 */
export function generateMarkdownReport(report: TestReport): string {
  const statusIcon = report.passed ? "✓" : "✗";
  const statusText = report.passed ? "PASSED" : "FAILED";

  const lines = [
    `# Test Report: ${report.testName}`,
    "",
    `**Date**: ${new Date(report.date).toLocaleString()}`,
    `**Status**: ${statusIcon} ${statusText}`,
    "",
    "## Test Steps",
    "",
  ];

  for (const step of report.steps) {
    const icon = step.passed ? "✓" : "✗";
    const durationStr = `${(step.duration / 1000).toFixed(1)}s`;
    lines.push(`${step.stepNumber}. ${icon} ${step.description} (${durationStr})`);

    if (step.error) {
      lines.push(`   Error: ${step.error}`);
    }
  }

  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`**Total Duration**: ${(report.totalDuration / 1000).toFixed(1)}s`);
  lines.push(`**Steps Passed**: ${report.passedSteps}/${report.totalSteps}`);

  // Handle division by zero for completion percentage
  const completionPercentage = report.totalSteps > 0
    ? Math.round((report.passedSteps / report.totalSteps) * 100)
    : 0;
  lines.push(`**Completion**: ${completionPercentage}%`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate a JSON report
 * Produces machine-readable JSON with complete test data.
 */
export function generateJsonReport(report: TestReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Save report to a file
 * @param report report content (markdown or JSON string)
 * @param filePath path where report will be saved
 * @throws Error if file write fails, with context about the operation
 */
export async function saveReport(report: string, filePath: string): Promise<void> {
  if (!report || typeof report !== "string") {
    throw new Error('Invalid report: must be a non-empty string');
  }
  if (!filePath || typeof filePath !== "string" || filePath.trim().length === 0) {
    throw new Error('Invalid file path: must be a non-empty string');
  }

  try {
    await writeFile(filePath, report, "utf-8");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to save report to "${filePath}": ${errorMsg}\n` +
      `Ensure the directory exists and you have write permissions.`
    );
  }
}

/**
 * Save markdown report to file
 */
export async function saveMarkdownReport(report: TestReport, filePath: string): Promise<void> {
  const markdown = generateMarkdownReport(report);
  await saveReport(markdown, filePath);
}

/**
 * Save JSON report to file
 */
export async function saveJsonReport(report: TestReport, filePath: string): Promise<void> {
  const json = generateJsonReport(report);
  await saveReport(json, filePath);
}

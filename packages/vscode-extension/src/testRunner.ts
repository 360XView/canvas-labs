import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { TestResults } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Runs Python tests using pytest and parses results
 */
export class TestRunner {
  /**
   * Run tests for a project using pytest
   */
  async runTests(projectPath: string): Promise<TestResults> {
    try {
      const venvPython = path.join(projectPath, ".venv/bin/python");
      const reportDir = path.join(projectPath, ".pytest_cache");
      const reportPath = path.join(reportDir, "report.json");

      // Ensure report directory exists
      fs.mkdirSync(reportDir, { recursive: true });

      // Run pytest with JSON reporter
      try {
        await execFileAsync(venvPython, [
          "-m",
          "pytest",
          "--json-report",
          `--json-report-file=${reportPath}`,
        ], {
          cwd: projectPath,
        });
      } catch (error: any) {
        // pytest exits with non-zero if tests fail, which is expected
        // Continue to parse the report
      }

      // Parse the JSON report
      if (fs.existsSync(reportPath)) {
        return this.parseReport(reportPath);
      } else {
        return {
          passed: false,
          test_name: null,
          error: "No test report generated",
          output: "",
        };
      }
    } catch (error) {
      return {
        passed: false,
        test_name: null,
        error: `Test execution failed: ${error}`,
        output: "",
      };
    }
  }

  /**
   * Parse pytest JSON report
   */
  private parseReport(reportPath: string): TestResults {
    try {
      const reportContent = fs.readFileSync(reportPath, "utf-8");
      const report = JSON.parse(reportContent) as any;

      const summary = report.summary || {};
      const tests = report.tests || [];

      const passed = (summary.failed || 0) === 0 && (summary.passed || 0) > 0;
      const testName = tests.length > 0 ? tests[0].nodeid : null;
      const error = !passed && tests.length > 0 ? tests[0].call?.longrepr : null;
      const output = `${summary.passed || 0} passed, ${summary.failed || 0} failed`;

      return {
        passed,
        test_name: testName,
        error,
        output,
      };
    } catch (error) {
      return {
        passed: false,
        test_name: null,
        error: `Failed to parse test report: ${error}`,
        output: "",
      };
    }
  }
}

// Lab Test Runner
// Runs setup scripts and check scripts to verify a lab works correctly

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getCheckConfigs, moduleExists, getLabsPath, getDraftsPath } from "./module-loader";

export interface CheckResult {
  checkId: string;
  script: string;
  passed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number; // ms
}

export interface TestRunResult {
  moduleId: string;
  setupPassed: boolean;
  setupOutput: string;
  setupError: string;
  setupDuration: number;
  checks: CheckResult[];
  allPassed: boolean;
  totalDuration: number;
}

// Get the base path for this package
function getBasePath(): string {
  return path.resolve(path.dirname(import.meta.path), "../..");
}

/**
 * Run all tests for a lab module
 */
export async function runModuleTests(
  moduleId: string,
  options: {
    setupOnly?: boolean;
    checkName?: string;
    verbose?: boolean;
    dockerImage?: string;
  } = {}
): Promise<TestRunResult> {
  const {
    setupOnly = false,
    checkName,
    verbose = false,
    dockerImage = "canvas-lab:latest",
  } = options;

  const startTime = Date.now();

  const result: TestRunResult = {
    moduleId,
    setupPassed: false,
    setupOutput: "",
    setupError: "",
    setupDuration: 0,
    checks: [],
    allPassed: false,
    totalDuration: 0,
  };

  // Verify module exists
  const { exists, location } = moduleExists(moduleId);
  if (!exists) {
    result.setupError = `Module not found: ${moduleId}`;
    result.totalDuration = Date.now() - startTime;
    return result;
  }

  // Verify Docker is running
  const dockerCheck = spawnSync("docker", ["info"], { stdio: "pipe" });
  if (dockerCheck.status !== 0) {
    result.setupError = "Docker is not running";
    result.totalDuration = Date.now() - startTime;
    return result;
  }

  // Test setup script
  const setupResult = await testSetupScript(moduleId, dockerImage, verbose);
  result.setupPassed = setupResult.passed;
  result.setupOutput = setupResult.stdout;
  result.setupError = setupResult.stderr;
  result.setupDuration = setupResult.duration;

  if (!result.setupPassed) {
    result.totalDuration = Date.now() - startTime;
    return result;
  }

  if (setupOnly) {
    result.allPassed = result.setupPassed;
    result.totalDuration = Date.now() - startTime;
    return result;
  }

  // Get check scripts
  const checks = getCheckConfigs(moduleId);

  // Filter to specific check if requested
  const checksToRun = checkName
    ? checks.filter((c) => c.script === checkName || c.stepId === checkName)
    : checks;

  // Run each check script
  for (const check of checksToRun) {
    const checkResult = await runCheck(moduleId, check.script, dockerImage, verbose);
    result.checks.push({
      checkId: check.stepId,
      script: check.script,
      ...checkResult,
    });
  }

  // Determine overall pass/fail
  result.allPassed =
    result.setupPassed && result.checks.every((c) => c.passed);

  result.totalDuration = Date.now() - startTime;
  return result;
}

/**
 * Test the setup script
 */
async function testSetupScript(
  moduleId: string,
  dockerImage: string,
  verbose: boolean
): Promise<{
  passed: boolean;
  stdout: string;
  stderr: string;
  duration: number;
}> {
  const startTime = Date.now();

  // Run the setup script inside Docker
  // Scripts are in /opt/lab/modules/<moduleId>/
  const setupCmd = `source /opt/lab/modules/${moduleId}/setup.sh 2>&1 && echo "SETUP_SUCCESS"`;

  const result = spawnSync("docker", [
    "run",
    "--rm",
    "--entrypoint", "/bin/bash",
    "-e", `LAB_MODULE_ID=${moduleId}`,
    dockerImage,
    "-c",
    setupCmd,
  ], {
    stdio: "pipe",
    encoding: "utf-8",
    timeout: 60000, // 60 second timeout
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const passed = result.status === 0 && stdout.includes("SETUP_SUCCESS");

  return {
    passed,
    stdout,
    stderr,
    duration: Date.now() - startTime,
  };
}

/**
 * Run a single check script
 */
export async function runCheck(
  moduleId: string,
  checkScript: string,
  dockerImage: string = "canvas-lab:latest",
  verbose: boolean = false
): Promise<{
  passed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}> {
  const startTime = Date.now();

  // Run the check script inside Docker after setup
  // Scripts are in /opt/lab/modules/<moduleId>/
  const cmd = `source /opt/lab/modules/${moduleId}/setup.sh 2>/dev/null; /opt/lab/modules/${moduleId}/checks/${checkScript}`;

  const result = spawnSync("docker", [
    "run",
    "--rm",
    "--entrypoint", "/bin/bash",
    "-e", `LAB_MODULE_ID=${moduleId}`,
    dockerImage,
    "-c",
    cmd,
  ], {
    stdio: "pipe",
    encoding: "utf-8",
    timeout: 30000, // 30 second timeout
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const exitCode = result.status ?? -1;
  const passed = exitCode === 0;

  return {
    passed,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
    duration: Date.now() - startTime,
  };
}

/**
 * Format test results for CLI output
 */
export function formatTestResult(result: TestRunResult, verbose: boolean = false): string {
  const lines: string[] = [];

  lines.push(`Testing: ${result.moduleId}`);
  lines.push("─".repeat(40));
  lines.push("");

  // Setup result
  lines.push("Setup Script:");
  if (result.setupPassed) {
    lines.push(`  ✓ Setup completed successfully (${result.setupDuration}ms)`);
  } else {
    lines.push(`  ✗ Setup failed (exit code)`);
    if (result.setupError) {
      lines.push("");
      lines.push("  Error output:");
      for (const line of result.setupError.split("\n").slice(0, 10)) {
        lines.push(`  > ${line}`);
      }
    }
  }
  lines.push("");

  // Check results
  if (result.checks.length > 0) {
    lines.push("Check Scripts:");
    for (const check of result.checks) {
      const icon = check.passed ? "✓" : "✗";
      const status = check.passed ? "Passed" : "Failed";
      lines.push(`  ${icon} ${check.script.padEnd(30)} - ${status}`);

      if (!check.passed || verbose) {
        if (check.stdout) {
          lines.push("");
          lines.push("    Output:");
          for (const line of check.stdout.split("\n").slice(0, 5)) {
            lines.push(`    > ${line}`);
          }
        }
        if (check.stderr && !check.passed) {
          lines.push("");
          lines.push("    Error:");
          for (const line of check.stderr.split("\n").slice(0, 5)) {
            lines.push(`    > ${line}`);
          }
        }
      }
    }
    lines.push("");
  }

  // Summary
  const passedChecks = result.checks.filter((c) => c.passed).length;
  const totalChecks = result.checks.length;

  lines.push(`Summary: ${passedChecks}/${totalChecks} checks passed`);
  lines.push(`Duration: ${result.totalDuration}ms`);

  if (result.allPassed) {
    lines.push("");
    lines.push("Status: READY FOR USE ✓");
  } else {
    lines.push("");
    lines.push("Status: NEEDS FIXES ✗");
  }

  return lines.join("\n");
}

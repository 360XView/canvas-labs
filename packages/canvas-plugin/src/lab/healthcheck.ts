// Lab Environment Healthcheck
// Verifies lab setup completed successfully before allowing user interaction

import { spawnSync } from "child_process";

export interface HealthcheckConfig {
  files?: FileCheck[];
  directories?: string[];
  commands?: CommandCheck[];
  timeout?: number; // milliseconds, default 10000
  isCanvasLab?: boolean; // Whether this is a canvas lab container (default true)
}

export interface FileCheck {
  path: string;
  minSize?: number; // minimum file size in bytes
  contains?: string; // string that must be present in file
}

export interface CommandCheck {
  command: string;
  expectExitCode?: number; // default 0
  expectOutput?: string; // substring that must be in output
}

export interface HealthcheckResult {
  passed: boolean;
  checks: CheckResult[];
  duration: number; // milliseconds
}

export interface CheckResult {
  type: "file" | "directory" | "command";
  target: string;
  passed: boolean;
  message: string;
}

/**
 * Run healthcheck against a Docker container
 */
export async function runHealthcheck(
  containerId: string,
  config: HealthcheckConfig
): Promise<HealthcheckResult> {
  const startTime = Date.now();
  const timeout = config.timeout ?? 10000;
  const isCanvasLab = config.isCanvasLab ?? true;
  const checks: CheckResult[] = [];

  // Wait for container to be ready (setup script might still be running)
  const ready = await waitForContainer(containerId, timeout, isCanvasLab);
  if (!ready) {
    return {
      passed: false,
      checks: [{
        type: "command",
        target: "container",
        passed: false,
        message: `Container not ready within ${timeout}ms`,
      }],
      duration: Date.now() - startTime,
    };
  }

  // Check directories
  for (const dir of config.directories ?? []) {
    const expandedPath = expandPath(dir);
    const result = execInContainer(containerId, `test -d "${expandedPath}" && echo "exists"`);
    const passed = result.stdout.trim() === "exists";
    checks.push({
      type: "directory",
      target: dir,
      passed,
      message: passed ? `Directory exists: ${dir}` : `Directory missing: ${dir}`,
    });
  }

  // Check files
  for (const file of config.files ?? []) {
    const expandedPath = expandPath(file.path);
    const checkResult = checkFile(containerId, expandedPath, file);
    checks.push({
      type: "file",
      target: file.path,
      ...checkResult,
    });
  }

  // Check commands
  for (const cmd of config.commands ?? []) {
    const result = execInContainer(containerId, cmd.command);
    const expectedCode = cmd.expectExitCode ?? 0;
    let passed = result.exitCode === expectedCode;
    let message = "";

    if (!passed) {
      message = `Command '${cmd.command}' exited with ${result.exitCode}, expected ${expectedCode}`;
    } else if (cmd.expectOutput && !result.stdout.includes(cmd.expectOutput)) {
      passed = false;
      message = `Command '${cmd.command}' output missing expected: "${cmd.expectOutput}"`;
    } else {
      message = `Command passed: ${cmd.command}`;
    }

    checks.push({
      type: "command",
      target: cmd.command,
      passed,
      message,
    });
  }

  const allPassed = checks.every((c) => c.passed);

  return {
    passed: allPassed,
    checks,
    duration: Date.now() - startTime,
  };
}

/**
 * Wait for container to be running and setup to complete
 */
async function waitForContainer(containerId: string, timeout: number, isCanvasLab: boolean = true): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeout) {
    // Check if container is running
    const inspectResult = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", containerId], {
      encoding: "utf-8",
    });

    if (inspectResult.stdout?.trim() !== "true") {
      await sleep(pollInterval);
      continue;
    }

    // For canvas lab containers, wait for orchestrator to finish setup
    if (isCanvasLab) {
      const logResult = execInContainer(containerId, "cat /var/log/lab-commands/orchestrator.log 2>/dev/null || echo ''");
      if (logResult.stdout.includes("Lab environment ready")) {
        return true;
      }
    } else {
      // For non-canvas containers (e.g., in tests), just check that we can exec into it
      const testResult = execInContainer(containerId, "echo ready");
      if (testResult.exitCode === 0 && testResult.stdout.includes("ready")) {
        return true;
      }
    }

    await sleep(pollInterval);
  }

  return false;
}

/**
 * Check a file exists and meets requirements
 */
function checkFile(
  containerId: string,
  path: string,
  file: FileCheck
): { passed: boolean; message: string } {
  // Check file exists
  const existsResult = execInContainer(containerId, `test -f "${path}" && echo "exists"`);
  if (existsResult.stdout.trim() !== "exists") {
    return { passed: false, message: `File missing: ${file.path}` };
  }

  // Check minimum size
  if (file.minSize !== undefined) {
    const sizeResult = execInContainer(containerId, `stat -c%s "${path}" 2>/dev/null || stat -f%z "${path}"`);
    const size = parseInt(sizeResult.stdout.trim(), 10);
    if (isNaN(size) || size < file.minSize) {
      return {
        passed: false,
        message: `File ${file.path} too small: ${size} bytes (min: ${file.minSize})`,
      };
    }
  }

  // Check contains string
  if (file.contains) {
    const grepResult = execInContainer(containerId, `grep -q "${file.contains}" "${path}" && echo "found"`);
    if (grepResult.stdout.trim() !== "found") {
      return {
        passed: false,
        message: `File ${file.path} missing expected content: "${file.contains}"`,
      };
    }
  }

  return { passed: true, message: `File OK: ${file.path}` };
}

/**
 * Execute command in container and return result
 */
function execInContainer(
  containerId: string,
  command: string
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("docker", ["exec", containerId, "bash", "-c", command], {
    encoding: "utf-8",
    timeout: 5000,
  });

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? 1,
  };
}

/**
 * Expand ~ to /home/student
 */
function expandPath(path: string): string {
  return path.replace(/^~/, "/home/student");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format healthcheck results for display
 */
export function formatHealthcheckResult(result: HealthcheckResult): string {
  const lines: string[] = [];

  if (result.passed) {
    lines.push(`✓ Healthcheck passed (${result.duration}ms)`);
  } else {
    lines.push(`✗ Healthcheck FAILED (${result.duration}ms)`);
  }

  lines.push("");

  for (const check of result.checks) {
    const icon = check.passed ? "✓" : "✗";
    lines.push(`  ${icon} [${check.type}] ${check.message}`);
  }

  return lines.join("\n");
}

/**
 * Default healthcheck configs for known modules
 */
export const MODULE_HEALTHCHECKS: Record<string, HealthcheckConfig> = {
  "shell-file-operations": {
    directories: ["~/data"],
    files: [
      { path: "~/data/sample.txt", minSize: 100, contains: "test" },
      { path: "~/data/long.txt", minSize: 200 },
      { path: "~/data/logs.txt", contains: "ERROR" },
    ],
    timeout: 15000,
  },

  "shell-text-processing": {
    directories: ["~/data"],
    files: [
      { path: "~/data/names.txt" },
      { path: "~/data/duplicates.txt" },
      { path: "~/data/data.csv" },
      { path: "~/data/errors.txt", contains: "error" },
    ],
    timeout: 15000,
  },

  "shell-navigation": {
    directories: ["~/practice"],
    timeout: 10000,
  },

  "shell-find-files": {
    directories: ["~/project"],
    timeout: 15000,
  },

  "shell-bash-scripting": {
    directories: ["~/scripts"],
    timeout: 10000,
  },

  "shell-log-analysis": {
    directories: ["~/logs"],
    files: [
      { path: "~/logs/access.log", minSize: 500 },
      { path: "~/logs/auth.log", minSize: 200 },
    ],
    timeout: 15000,
  },

  "linux-user-management": {
    // This module doesn't need setup files - just verify the container works
    commands: [
      { command: "id student", expectExitCode: 0 },
      { command: "sudo -n true", expectExitCode: 0 },
    ],
    timeout: 10000,
  },
};

/**
 * Get healthcheck config for a module, with fallback to basic checks
 */
export function getModuleHealthcheck(moduleId: string): HealthcheckConfig {
  return MODULE_HEALTHCHECKS[moduleId] ?? {
    commands: [
      { command: "whoami", expectExitCode: 0 },
    ],
    timeout: 10000,
  };
}

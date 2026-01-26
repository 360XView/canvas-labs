// Healthcheck Tests
// Tests for lab environment pre-flight checks

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import {
  runHealthcheck,
  getModuleHealthcheck,
  formatHealthcheckResult,
  MODULE_HEALTHCHECKS,
  type HealthcheckConfig,
} from "../healthcheck";

// These tests require Docker - skip if not available
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "pipe" }).status === 0;

describe("Healthcheck Configuration", () => {
  test("MODULE_HEALTHCHECKS has configs for all shell-mastery labs", () => {
    const expectedModules = [
      "shell-file-operations",
      "shell-text-processing",
      "shell-navigation",
      "shell-find-files",
      "shell-bash-scripting",
      "shell-log-analysis",
      "linux-user-management",
    ];

    for (const moduleId of expectedModules) {
      expect(MODULE_HEALTHCHECKS[moduleId]).toBeDefined();
    }
  });

  test("getModuleHealthcheck returns config for known module", () => {
    const config = getModuleHealthcheck("shell-file-operations");
    expect(config.files).toBeDefined();
    expect(config.directories).toContain("~/data");
  });

  test("getModuleHealthcheck returns fallback for unknown module", () => {
    const config = getModuleHealthcheck("unknown-module");
    expect(config.commands).toBeDefined();
    expect(config.timeout).toBe(10000);
  });

  test("shell-file-operations healthcheck config is correct", () => {
    const config = MODULE_HEALTHCHECKS["shell-file-operations"];
    expect(config.directories).toContain("~/data");
    expect(config.files).toContainEqual(
      expect.objectContaining({ path: "~/data/sample.txt", minSize: 100 })
    );
    expect(config.files).toContainEqual(
      expect.objectContaining({ path: "~/data/logs.txt", contains: "ERROR" })
    );
  });

  test("shell-log-analysis healthcheck config is correct", () => {
    const config = MODULE_HEALTHCHECKS["shell-log-analysis"];
    expect(config.directories).toContain("~/logs");
    expect(config.files).toContainEqual(
      expect.objectContaining({ path: "~/logs/access.log", minSize: 500 })
    );
  });
});

describe("formatHealthcheckResult", () => {
  test("formats passing result", () => {
    const result = {
      passed: true,
      checks: [
        { type: "directory" as const, target: "~/data", passed: true, message: "Directory exists: ~/data" },
        { type: "file" as const, target: "~/data/sample.txt", passed: true, message: "File OK: ~/data/sample.txt" },
      ],
      duration: 1500,
    };

    const formatted = formatHealthcheckResult(result);
    expect(formatted).toContain("✓ Healthcheck passed");
    expect(formatted).toContain("1500ms");
    expect(formatted).toContain("Directory exists");
    expect(formatted).toContain("File OK");
  });

  test("formats failing result", () => {
    const result = {
      passed: false,
      checks: [
        { type: "directory" as const, target: "~/data", passed: true, message: "Directory exists: ~/data" },
        { type: "file" as const, target: "~/data/sample.txt", passed: false, message: "File missing: ~/data/sample.txt" },
      ],
      duration: 2000,
    };

    const formatted = formatHealthcheckResult(result);
    expect(formatted).toContain("✗ Healthcheck FAILED");
    expect(formatted).toContain("2000ms");
    expect(formatted).toContain("File missing");
  });
});

// Integration tests that require Docker
describe.skipIf(!dockerAvailable)("Healthcheck Integration", () => {
  let containerId: string | null = null;

  beforeAll(async () => {
    // Start a test container
    const result = spawnSync("docker", [
      "run", "-d", "--rm",
      "ubuntu:22.04",
      "tail", "-f", "/dev/null"
    ], { encoding: "utf-8" });

    if (result.status === 0) {
      containerId = result.stdout.trim();
      // Wait for container to be ready
      await new Promise((r) => setTimeout(r, 1000));
    }
  });

  afterAll(() => {
    if (containerId) {
      spawnSync("docker", ["kill", containerId], { stdio: "pipe" });
    }
  });

  test("runHealthcheck detects missing directory", async () => {
    if (!containerId) return;

    const config: HealthcheckConfig = {
      directories: ["/nonexistent/dir"],
      timeout: 5000,
      isCanvasLab: false,
    };

    const result = await runHealthcheck(containerId, config);
    expect(result.passed).toBe(false);
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].message).toContain("missing");
  });

  test("runHealthcheck detects existing directory", async () => {
    if (!containerId) return;

    const config: HealthcheckConfig = {
      directories: ["/tmp"],
      timeout: 5000,
      isCanvasLab: false,
    };

    const result = await runHealthcheck(containerId, config);
    expect(result.passed).toBe(true);
    expect(result.checks[0].passed).toBe(true);
  });

  test("runHealthcheck detects missing file", async () => {
    if (!containerId) return;

    const config: HealthcheckConfig = {
      files: [{ path: "/nonexistent/file.txt" }],
      timeout: 5000,
      isCanvasLab: false,
    };

    const result = await runHealthcheck(containerId, config);
    expect(result.passed).toBe(false);
    expect(result.checks[0].message).toContain("missing");
  });

  test("runHealthcheck validates file size", async () => {
    if (!containerId) return;

    // Create a small file
    spawnSync("docker", ["exec", containerId, "bash", "-c", "echo 'small' > /tmp/small.txt"]);

    const config: HealthcheckConfig = {
      files: [{ path: "/tmp/small.txt", minSize: 1000 }],
      timeout: 5000,
      isCanvasLab: false,
    };

    const result = await runHealthcheck(containerId, config);
    expect(result.passed).toBe(false);
    expect(result.checks[0].message).toContain("too small");
  });

  test("runHealthcheck validates file content", async () => {
    if (!containerId) return;

    // Create a file with specific content
    spawnSync("docker", ["exec", containerId, "bash", "-c", "echo 'ERROR: something failed' > /tmp/test.log"]);

    const config: HealthcheckConfig = {
      files: [{ path: "/tmp/test.log", contains: "ERROR" }],
      timeout: 5000,
      isCanvasLab: false,
    };

    const result = await runHealthcheck(containerId, config);
    expect(result.passed).toBe(true);
  });

  test("runHealthcheck validates command execution", async () => {
    if (!containerId) return;

    const config: HealthcheckConfig = {
      commands: [
        { command: "whoami", expectExitCode: 0 },
        { command: "echo hello", expectOutput: "hello" },
      ],
      timeout: 5000,
      isCanvasLab: false,
    };

    const result = await runHealthcheck(containerId, config);
    expect(result.passed).toBe(true);
    expect(result.checks.length).toBe(2);
  });

  test("runHealthcheck detects command failure", async () => {
    if (!containerId) return;

    const config: HealthcheckConfig = {
      commands: [
        { command: "false", expectExitCode: 0 },
      ],
      timeout: 5000,
      isCanvasLab: false,
    };

    const result = await runHealthcheck(containerId, config);
    expect(result.passed).toBe(false);
  });

  test("runHealthcheck returns duration", async () => {
    if (!containerId) return;

    const config: HealthcheckConfig = {
      directories: ["/tmp"],
      timeout: 5000,
      isCanvasLab: false,
    };

    const result = await runHealthcheck(containerId, config);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.duration).toBeLessThan(5000);
  });
});

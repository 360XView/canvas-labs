// Integration test for headless scenario runner
// Requires Docker with canvas-lab:latest image

import { describe, test, expect } from "bun:test";
import { rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { runScenarioHeadless } from "../scenario-runner";
import { linuxUserMgmtBaseline } from "../scenarios/linux-user-mgmt-baseline";
import { validateArtifacts } from "../artifact-validator";

// Check if Docker is available and image exists
function dockerAvailable(): boolean {
  const result = spawnSync("docker", ["image", "inspect", "canvas-lab:latest"], {
    timeout: 5000,
  });
  return result.status === 0;
}

describe("headless scenario runner", () => {
  const skipReason = !dockerAvailable()
    ? "Docker not available or canvas-lab:latest not built"
    : undefined;

  test.skipIf(!!skipReason)("runs baseline scenario and produces valid artifacts", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "eval-test-"));

    try {
      const result = await runScenarioHeadless(linuxUserMgmtBaseline, {
        outputDir,
        verbose: true,
      });

      // Scenario should complete successfully
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // All task steps should be completed
      expect(result.completedSteps).toContain("become-root");
      expect(result.completedSteps).toContain("create-user");
      expect(result.completedSteps).toContain("set-permissions");
      expect(result.completedSteps).toContain("add-to-group");

      // Validate artifacts
      const validation = validateArtifacts(result.logDir);
      expect(validation.valid).toBe(true);
      expect(validation.missing).toHaveLength(0);

      // Telemetry should contain expected event types
      expect(validation.telemetryEventTypes).toContain("session_started");
      expect(validation.telemetryEventTypes).toContain("step_started");
      expect(validation.telemetryEventTypes).toContain("hint_requested");
      expect(validation.telemetryEventTypes).toContain("solution_viewed");
      expect(validation.telemetryEventTypes).toContain("session_ended");

      // State should have steps
      expect(validation.stateStepCount).toBe(6); // 6 steps in module
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 90_000); // 90s timeout — Docker + check polling + waits
});

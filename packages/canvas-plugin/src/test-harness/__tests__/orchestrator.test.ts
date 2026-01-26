// Orchestrator Tests

import { describe, test, expect } from "bun:test";
import { TestOrchestrator, runScriptedTest, runScenarioWithActions } from "../orchestrator/orchestrator";
import { ScriptedDriver, createLinuxUserMgmtHappyPath } from "../drivers/scripted-driver";
import { createScenario, stepCheckpoint, loadScenario } from "../scenarios/loader";
import type { StudentAction } from "../types";

describe("TestOrchestrator", () => {
  describe("basic execution", () => {
    test("should run a simple scripted test", async () => {
      const scenario = createScenario({
        id: "simple-test",
        name: "Simple Test",
        moduleId: "linux-user-management",
        checkpoints: [stepCheckpoint("become-root")],
        successCriteria: {
          allCheckpoints: true,
        },
      });

      const driver = new ScriptedDriver([{ type: "command", command: "sudo su" }]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      expect(result.passed).toBe(true);
      expect(result.allCheckpointsPassed).toBe(true);
      expect(result.checkpointResults[0].passed).toBe(true);
    });

    test("should fail when checkpoint not reached", async () => {
      const scenario = createScenario({
        id: "fail-test",
        name: "Fail Test",
        moduleId: "linux-user-management",
        checkpoints: [
          stepCheckpoint("become-root"),
          stepCheckpoint("create-user"),
        ],
        successCriteria: {
          allCheckpoints: true,
        },
      });

      // Only execute first step
      const driver = new ScriptedDriver([{ type: "command", command: "sudo su" }]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      expect(result.passed).toBe(false);
      expect(result.allCheckpointsPassed).toBe(false);
      expect(result.checkpointResults[0].passed).toBe(true);
      expect(result.checkpointResults[1].passed).toBe(false);
    });
  });

  describe("happy path scenario", () => {
    test("should pass linux-user-management happy path", async () => {
      const scenario = createScenario({
        id: "happy-path",
        name: "Happy Path",
        moduleId: "linux-user-management",
        checkpoints: [
          stepCheckpoint("become-root"),
          stepCheckpoint("create-user"),
          stepCheckpoint("set-permissions"),
          stepCheckpoint("add-to-group"),
        ],
        successCriteria: {
          allCheckpoints: true,
          minScore: 0.7,
        },
      });

      const driver = createLinuxUserMgmtHappyPath();

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      expect(result.passed).toBe(true);
      expect(result.allCheckpointsPassed).toBe(true);
      expect(result.score).toBeGreaterThan(0.7);
      expect(result.actions.length).toBe(4);

      // All checkpoints should be reached
      for (const cp of result.checkpointResults) {
        expect(cp.passed).toBe(true);
      }
    });
  });

  describe("scoring", () => {
    test("should calculate score correctly", async () => {
      const scenario = createScenario({
        id: "score-test",
        name: "Score Test",
        moduleId: "linux-user-management",
        checkpoints: [stepCheckpoint("become-root")],
      });

      const driver = new ScriptedDriver([{ type: "command", command: "sudo su" }]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      expect(result.labProgress).toBeDefined();
      expect(result.labProgress!.tasks["become-root"]).toBeDefined();
      expect(result.labProgress!.tasks["become-root"].confidence).toBe(1.0);
    });

    test("should penalize hints", async () => {
      const scenario = createScenario({
        id: "hint-test",
        name: "Hint Test",
        moduleId: "linux-user-management",
        checkpoints: [stepCheckpoint("become-root")],
      });

      const driver = new ScriptedDriver([
        { type: "hint", stepId: "become-root", hintIndex: 0 },
        { type: "command", command: "sudo su" },
      ]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      // Score should be reduced due to hint
      const task = result.labProgress!.tasks["become-root"];
      expect(task.confidence).toBeLessThan(1.0);
      expect(task.modifiers.some((m) => m.kind === "hint_used")).toBe(true);
    });

    test("should penalize solution viewing", async () => {
      const scenario = createScenario({
        id: "solution-test",
        name: "Solution Test",
        moduleId: "linux-user-management",
        checkpoints: [stepCheckpoint("become-root")],
      });

      const driver = new ScriptedDriver([
        { type: "solution", stepId: "become-root" },
        { type: "command", command: "sudo su" },
      ]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      // Score should be reduced due to solution viewing
      const task = result.labProgress!.tasks["become-root"];
      expect(task.confidence).toBeLessThan(1.0);
      expect(task.modifiers.some((m) => m.kind === "solution_viewed")).toBe(true);
    });
  });

  describe("success criteria", () => {
    test("should enforce minScore criteria", async () => {
      const scenario = createScenario({
        id: "min-score-test",
        name: "Min Score Test",
        moduleId: "linux-user-management",
        checkpoints: [stepCheckpoint("become-root")],
        successCriteria: {
          allCheckpoints: true,
          minScore: 0.99, // Very high threshold - requires perfect score
        },
      });

      // Use hint to reduce score (hint penalty is -0.15, but first try bonus is +0.10, so net = 0.95)
      const driver = new ScriptedDriver([
        { type: "hint", stepId: "become-root", hintIndex: 0 },
        { type: "command", command: "sudo su" },
      ]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      // Should fail due to low score (0.95 < 0.99)
      expect(result.passed).toBe(false);
      expect(result.criteriaResults.some((c) => c.criterion === "minScore" && !c.passed)).toBe(true);
    });

    test("should enforce maxHints criteria", async () => {
      const scenario = createScenario({
        id: "max-hints-test",
        name: "Max Hints Test",
        moduleId: "linux-user-management",
        checkpoints: [stepCheckpoint("become-root")],
        successCriteria: {
          allCheckpoints: true,
          maxHints: 0, // No hints allowed
        },
      });

      const driver = new ScriptedDriver([
        { type: "hint", stepId: "become-root", hintIndex: 0 },
        { type: "command", command: "sudo su" },
      ]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      // Should fail due to hint usage
      expect(result.passed).toBe(false);
      expect(result.criteriaResults.some((c) => c.criterion === "maxHints" && !c.passed)).toBe(true);
    });
  });

  describe("convenience functions", () => {
    test("runScriptedTest should work", async () => {
      const scenario = createScenario({
        id: "convenience-test",
        name: "Convenience Test",
        moduleId: "linux-user-management",
        checkpoints: [stepCheckpoint("become-root")],
      });

      const result = await runScriptedTest({
        scenario,
        actions: [{ type: "command", command: "sudo su" }],
      });

      expect(result.passed).toBe(true);
    });

    test("runScenarioWithActions should use scenario actions", async () => {
      const scenario = createScenario({
        id: "actions-test",
        name: "Actions Test",
        moduleId: "linux-user-management",
        checkpoints: [
          stepCheckpoint("become-root"),
          stepCheckpoint("create-user"),
        ],
        actions: [
          { type: "command", command: "sudo su" },
          { type: "command", command: "useradd -m devuser" },
        ],
      });

      const result = await runScenarioWithActions({ scenario });

      expect(result.passed).toBe(true);
      expect(result.actions.length).toBe(2);
    });
  });

  describe("telemetry events", () => {
    test("should collect telemetry events", async () => {
      const scenario = createScenario({
        id: "telemetry-test",
        name: "Telemetry Test",
        moduleId: "linux-user-management",
        checkpoints: [stepCheckpoint("become-root")],
      });

      const driver = new ScriptedDriver([{ type: "command", command: "sudo su" }]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      // Should have events
      expect(result.events.length).toBeGreaterThan(0);

      // Should have session_started
      expect(result.events.some((e) => e.event_type === "session_started")).toBe(true);

      // Should have command events
      expect(result.events.some((e) => e.event_type === "command_executed")).toBe(true);

      // Should have step completion
      expect(result.events.some((e) => e.event_type === "step_completed")).toBe(true);
    });
  });

  describe("error handling", () => {
    test("should handle missing module", async () => {
      const scenario = createScenario({
        id: "missing-module",
        name: "Missing Module",
        moduleId: "nonexistent-module",
        checkpoints: [],
      });

      const driver = new ScriptedDriver([]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "mock",
      });

      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("nonexistent-module");
    });

    test("should report unsupported environment", async () => {
      const scenario = createScenario({
        id: "docker-test",
        name: "Docker Test",
        moduleId: "linux-user-management",
        checkpoints: [],
      });

      const driver = new ScriptedDriver([]);

      const orchestrator = new TestOrchestrator();
      const result = await orchestrator.run({
        driver,
        scenario,
        environment: "docker", // Not implemented in Phase 1
      });

      expect(result.passed).toBe(false);
      expect(result.error).toContain("not yet implemented");
    });
  });
});

describe("Integration with YAML scenarios", () => {
  test("should load and run YAML scenario", async () => {
    // This tests the full integration with YAML scenario loading
    const scenario = await loadScenario("linux-user-mgmt-happy-path");

    expect(scenario.id).toBe("linux-user-mgmt-happy-path");
    expect(scenario.moduleId).toBe("linux-user-management");
    expect(scenario.checkpoints.length).toBe(4);

    // Run with scenario's built-in actions
    const result = await runScenarioWithActions({ scenario });

    expect(result.passed).toBe(true);
    expect(result.allCheckpointsPassed).toBe(true);
  });
});

// Scripted Driver Tests

import { describe, test, expect, beforeEach } from "bun:test";
import {
  ScriptedDriver,
  createScriptedDriver,
  createLinuxUserMgmtHappyPath,
} from "../drivers/scripted-driver";
import type { StudentAction, ActionResult, LabState } from "../types";
import type { DriverContext } from "../drivers/types";
import type { Scenario } from "../scenarios/types";
import type { Module } from "../../canvases/vta/types";

// Mock lab state
const mockLabState: LabState = {
  moduleId: "test-module",
  labType: "linux_cli",
  sessionId: "test-session",
  studentId: "test-student",
  currentUser: "student",
  currentWorkingDirectory: "/home/student",
  environment: {},
  currentStepIndex: 0,
  completedSteps: [],
  events: [],
  module: {
    id: "test-module",
    title: "Test Module",
    steps: [],
  },
  stepIds: [],
};

// Mock driver context
const mockContext: DriverContext = {
  scenario: {
    id: "test-scenario",
    name: "Test Scenario",
    moduleId: "test-module",
    checkpoints: [],
    successCriteria: {},
    timeoutMs: 60000,
    maxActions: 50,
  },
  module: {
    id: "test-module",
    title: "Test Module",
    steps: [],
  },
  sessionId: "test-session",
  studentId: "test-student",
};

describe("ScriptedDriver", () => {
  describe("construction", () => {
    test("should create with array of actions", () => {
      const actions: StudentAction[] = [
        { type: "command", command: "whoami" },
        { type: "command", command: "pwd" },
      ];

      const driver = new ScriptedDriver(actions);

      expect(driver.type).toBe("scripted");
      expect(driver.id).toMatch(/^scripted-/);
      expect(driver.getActionCount()).toBe(2);
    });

    test("should create with options object", () => {
      const driver = new ScriptedDriver({
        id: "custom-driver",
        actions: [{ type: "command", command: "whoami" }],
        stopOnError: true,
      });

      expect(driver.id).toBe("custom-driver");
      expect(driver.getActionCount()).toBe(1);
    });
  });

  describe("action sequencing", () => {
    test("should return actions in order", async () => {
      const actions: StudentAction[] = [
        { type: "command", command: "first" },
        { type: "command", command: "second" },
        { type: "command", command: "third" },
      ];

      const driver = new ScriptedDriver(actions);
      await driver.initialize(mockContext);

      const action1 = await driver.nextAction(mockLabState);
      expect(action1).toEqual({ type: "command", command: "first" });

      const action2 = await driver.nextAction(mockLabState);
      expect(action2).toEqual({ type: "command", command: "second" });

      const action3 = await driver.nextAction(mockLabState);
      expect(action3).toEqual({ type: "command", command: "third" });
    });

    test("should return null when exhausted", async () => {
      const actions: StudentAction[] = [{ type: "command", command: "only" }];

      const driver = new ScriptedDriver(actions);
      await driver.initialize(mockContext);

      await driver.nextAction(mockLabState);
      const nextAction = await driver.nextAction(mockLabState);

      expect(nextAction).toBeNull();
    });

    test("should track current index", async () => {
      const actions: StudentAction[] = [
        { type: "command", command: "first" },
        { type: "command", command: "second" },
      ];

      const driver = new ScriptedDriver(actions);
      await driver.initialize(mockContext);

      expect(driver.getCurrentIndex()).toBe(0);

      await driver.nextAction(mockLabState);
      expect(driver.getCurrentIndex()).toBe(1);

      await driver.nextAction(mockLabState);
      expect(driver.getCurrentIndex()).toBe(2);
    });
  });

  describe("action results", () => {
    test("should collect results", async () => {
      const actions: StudentAction[] = [
        { type: "command", command: "first" },
        { type: "command", command: "second" },
      ];

      const driver = new ScriptedDriver(actions);
      await driver.initialize(mockContext);

      const action1 = await driver.nextAction(mockLabState);
      await driver.onActionResult(action1!, {
        action: action1!,
        success: true,
        timestamp: new Date().toISOString(),
      });

      const action2 = await driver.nextAction(mockLabState);
      await driver.onActionResult(action2!, {
        action: action2!,
        success: false,
        exitCode: 1,
        timestamp: new Date().toISOString(),
      });

      const results = driver.getResults();
      expect(results.length).toBe(2);
      expect(results[0].result.success).toBe(true);
      expect(results[1].result.success).toBe(false);
    });

    test("should stop on error when configured", async () => {
      const actions: StudentAction[] = [
        { type: "command", command: "first" },
        { type: "command", command: "second" },
      ];

      const driver = new ScriptedDriver({
        actions,
        stopOnError: true,
      });
      await driver.initialize(mockContext);

      const action1 = await driver.nextAction(mockLabState);
      await driver.onActionResult(action1!, {
        action: action1!,
        success: false,
        exitCode: 1,
        timestamp: new Date().toISOString(),
      });

      // Should return null because previous action failed
      const action2 = await driver.nextAction(mockLabState);
      expect(action2).toBeNull();
    });
  });

  describe("reset", () => {
    test("should reset to beginning", async () => {
      const actions: StudentAction[] = [
        { type: "command", command: "first" },
        { type: "command", command: "second" },
      ];

      const driver = new ScriptedDriver(actions);
      await driver.initialize(mockContext);

      await driver.nextAction(mockLabState);
      await driver.nextAction(mockLabState);

      expect(driver.isComplete()).toBe(true);

      driver.reset();

      expect(driver.getCurrentIndex()).toBe(0);
      expect(driver.isComplete()).toBe(false);
      expect(driver.getResults().length).toBe(0);
    });
  });

  describe("factory functions", () => {
    test("createScriptedDriver should work", () => {
      const driver = createScriptedDriver([{ type: "command", command: "test" }]);

      expect(driver.type).toBe("scripted");
      expect(driver.getActionCount()).toBe(1);
    });

    test("createLinuxUserMgmtHappyPath should create correct sequence", async () => {
      const driver = createLinuxUserMgmtHappyPath();
      await driver.initialize(mockContext);

      const action1 = await driver.nextAction(mockLabState);
      expect(action1).toEqual({ type: "command", command: "sudo su" });

      const action2 = await driver.nextAction(mockLabState);
      expect(action2).toEqual({ type: "command", command: "useradd -m devuser" });

      const action3 = await driver.nextAction(mockLabState);
      expect(action3).toEqual({ type: "command", command: "chmod 750 /home/devuser" });

      const action4 = await driver.nextAction(mockLabState);
      expect(action4).toEqual({ type: "command", command: "usermod -aG developers devuser" });

      const action5 = await driver.nextAction(mockLabState);
      expect(action5).toBeNull();
    });
  });

  describe("different action types", () => {
    test("should handle hint actions", async () => {
      const driver = new ScriptedDriver([
        { type: "hint", stepId: "step-1", hintIndex: 0 },
      ]);
      await driver.initialize(mockContext);

      const action = await driver.nextAction(mockLabState);
      expect(action).toEqual({ type: "hint", stepId: "step-1", hintIndex: 0 });
    });

    test("should handle solution actions", async () => {
      const driver = new ScriptedDriver([{ type: "solution", stepId: "step-1" }]);
      await driver.initialize(mockContext);

      const action = await driver.nextAction(mockLabState);
      expect(action).toEqual({ type: "solution", stepId: "step-1" });
    });

    test("should handle wait actions", async () => {
      const driver = new ScriptedDriver([{ type: "wait", durationMs: 1000 }]);
      await driver.initialize(mockContext);

      const action = await driver.nextAction(mockLabState);
      expect(action).toEqual({ type: "wait", durationMs: 1000 });
    });

    test("should handle question actions", async () => {
      const driver = new ScriptedDriver([
        { type: "question", stepId: "step-1", selectedOptions: ["a", "b"] },
      ]);
      await driver.initialize(mockContext);

      const action = await driver.nextAction(mockLabState);
      expect(action).toEqual({
        type: "question",
        stepId: "step-1",
        selectedOptions: ["a", "b"],
      });
    });
  });
});

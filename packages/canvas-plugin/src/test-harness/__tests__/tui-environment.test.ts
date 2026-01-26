// TUI Environment Tests
// These tests spawn real shell processes, so they're slower than mock tests

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTUIEnvironment, type TUIEnvironment } from "../environment/tui-environment";
import type { Module } from "../../canvases/vta/types";
import type { StudentAction } from "../types";

// Test module definition
const testModule: Module = {
  id: "test-module",
  title: "Test Module",
  description: "Test module for TUI environment",
  labType: "linux_cli",
  steps: [
    {
      id: "step-1",
      title: "Step 1",
      type: "task",
      content: {
        instructions: "Run a command",
        tasks: [{ text: "Run whoami" }],
      },
    },
  ],
};

describe("TUIEnvironment", () => {
  let env: TUIEnvironment;

  beforeEach(async () => {
    env = createTUIEnvironment({
      moduleId: "test-module",
      studentId: "test-student",
      // Use bash -i for interactive mode
      shellCommand: "bash -i",
      // No ready indicator needed
      readyIndicator: "",
      readyTimeoutMs: 5000,
      commandTimeoutMs: 10000,
      verbose: false,
    });
    await env.initialize(testModule);
  }, 15000); // 15 second timeout for beforeEach

  afterEach(async () => {
    await env.dispose();
  }, 5000); // 5 second timeout for afterEach

  describe("initialization", () => {
    test("should initialize with shell process", () => {
      expect(env.getAdapter()).not.toBeNull();
    });

    test("should detect current user", () => {
      const user = env.getCurrentUser();
      expect(typeof user).toBe("string");
      expect(user.length).toBeGreaterThan(0);
    });

    test("should have initial state", () => {
      const state = env.getState();

      expect(state.moduleId).toBe("test-module");
      expect(state.studentId).toBe("test-student");
      expect(state.labType).toBe("linux_cli");
      expect(state.sessionId).toBeDefined();
    });
  });

  describe("command execution", () => {
    test("should execute simple command", async () => {
      const action: StudentAction = { type: "command", command: "echo hello" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("hello");
    });

    test("should capture exit code for failed commands", async () => {
      const action: StudentAction = { type: "command", command: "false" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    test("should execute pwd", async () => {
      const action: StudentAction = { type: "command", command: "pwd" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);
      expect(result.output).toContain("/");
    });

    test("should execute whoami", async () => {
      const action: StudentAction = { type: "command", command: "whoami" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);
      expect(result.output!.length).toBeGreaterThan(0);
    });
  });

  describe("telemetry", () => {
    test("should log commands to telemetry", async () => {
      await env.executeAction({ type: "command", command: "echo test" });

      const events = env.getEvents();
      expect(events.length).toBeGreaterThan(0);

      // Should have session_started and command_executed events
      expect(events.some((e) => e.event_type === "session_started")).toBe(true);
      expect(events.some((e) => e.event_type === "command_executed")).toBe(true);
    });

    test("should log hint requests", async () => {
      await env.executeAction({
        type: "hint",
        stepId: "step-1",
        hintIndex: 0,
      });

      const events = env.getEvents();
      expect(events.some((e) => e.event_type === "hint_requested")).toBe(true);
    });

    test("should log solution views", async () => {
      await env.executeAction({
        type: "solution",
        stepId: "step-1",
      });

      const events = env.getEvents();
      expect(events.some((e) => e.event_type === "solution_viewed")).toBe(true);
    });
  });

  describe("raw output", () => {
    test("should capture raw terminal output", async () => {
      await env.executeAction({ type: "command", command: "echo captured" });

      const output = env.getRawOutput();
      expect(output).toContain("captured");
    });
  });
});

describe("TUIEnvironment with orchestrator", () => {
  test("should work with TestOrchestrator", async () => {
    const { TestOrchestrator } = await import("../orchestrator/orchestrator");
    const { ScriptedDriver } = await import("../drivers/scripted-driver");
    const { createScenario, stepCheckpoint } = await import("../scenarios/loader");

    const scenario = createScenario({
      id: "tui-test",
      name: "TUI Test",
      // Use linux-user-management which exists
      moduleId: "linux-user-management",
      checkpoints: [stepCheckpoint("become-root")],
      successCriteria: {},
      timeoutMs: 30000,
    });

    // Create a simple driver that just runs echo
    const driver = new ScriptedDriver([
      { type: "command", command: "echo hello" },
    ]);

    const orchestrator = new TestOrchestrator();

    const result = await orchestrator.run({
      driver,
      scenario,
      environment: "tui",
      tuiOptions: {
        shellCommand: "bash -i",
        readyIndicator: "",
        commandTimeoutMs: 10000,
      },
    });

    // The test ran without error
    expect(result.actions.length).toBe(1);
    expect(result.actions[0].result.success).toBe(true);
    expect(result.events.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout
});

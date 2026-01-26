// Mock Environment Tests

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createMockEnvironment, type MockEnvironment } from "../environment/mock-environment";
import type { Module } from "../../canvases/vta/types";
import type { StudentAction } from "../types";

// Test module definition
const testModule: Module = {
  id: "linux-user-management",
  title: "Linux User Management",
  description: "Test module for mock environment",
  labType: "linux_cli",
  steps: [
    {
      id: "become-root",
      title: "Become Root",
      type: "task",
      content: {
        instructions: "Become root",
        tasks: [{ text: "Run sudo su" }],
        hints: [{ id: "hint-1", text: "Use sudo" }],
      },
    },
    {
      id: "create-user",
      title: "Create User",
      type: "task",
      content: {
        instructions: "Create devuser",
        tasks: [{ text: "Create user" }],
      },
    },
    {
      id: "set-permissions",
      title: "Set Permissions",
      type: "task",
      content: {
        instructions: "Set permissions to 750",
        tasks: [{ text: "Use chmod" }],
      },
    },
    {
      id: "add-to-group",
      title: "Add to Group",
      type: "task",
      content: {
        instructions: "Add to developers group",
        tasks: [{ text: "Use usermod" }],
      },
    },
  ],
};

describe("MockEnvironment", () => {
  let env: MockEnvironment;

  beforeEach(async () => {
    env = createMockEnvironment({
      moduleId: "linux-user-management",
      studentId: "test-student",
    });
    await env.initialize(testModule);
  });

  afterEach(() => {
    env.dispose();
  });

  describe("initialization", () => {
    test("should initialize with default state", () => {
      const state = env.getState();

      expect(state.moduleId).toBe("linux-user-management");
      expect(state.studentId).toBe("test-student");
      expect(state.currentUser).toBe("student");
      expect(state.currentWorkingDirectory).toBe("/home/student");
      expect(state.completedSteps).toEqual([]);
    });

    test("should create default users", () => {
      expect(env.userExists("root")).toBe(true);
      expect(env.userExists("student")).toBe(true);
      expect(env.userExists("devuser")).toBe(false);
    });
  });

  describe("command execution", () => {
    test("should execute whoami", async () => {
      const action: StudentAction = { type: "command", command: "whoami" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBe("student");
    });

    test("should execute sudo su", async () => {
      const action: StudentAction = { type: "command", command: "sudo su" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(env.getCurrentUser()).toBe("root");
    });

    test("should mark become-root step as completed after sudo su", async () => {
      await env.executeAction({ type: "command", command: "sudo su" });

      const state = env.getState();
      expect(state.completedSteps).toContain("become-root");
    });

    test("should execute useradd -m", async () => {
      // First become root
      await env.executeAction({ type: "command", command: "sudo su" });

      // Then create user
      const action: StudentAction = { type: "command", command: "useradd -m devuser" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(env.userExists("devuser")).toBe(true);
    });

    test("should fail useradd without root", async () => {
      const action: StudentAction = { type: "command", command: "useradd -m devuser" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(env.userExists("devuser")).toBe(false);
    });

    test("should execute chmod", async () => {
      // Setup: become root and create user
      await env.executeAction({ type: "command", command: "sudo su" });
      await env.executeAction({ type: "command", command: "useradd -m devuser" });

      // Verify initial permissions
      const initialPerms = env.getFilePermissions("/home/devuser");
      expect(initialPerms).toBe(0o755);

      // Change permissions
      const action: StudentAction = { type: "command", command: "chmod 750 /home/devuser" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);
      expect(env.getFilePermissions("/home/devuser")).toBe(0o750);
    });

    test("should execute usermod -aG", async () => {
      // Setup
      await env.executeAction({ type: "command", command: "sudo su" });
      await env.executeAction({ type: "command", command: "useradd -m devuser" });

      // Add to group
      const action: StudentAction = { type: "command", command: "usermod -aG developers devuser" };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);
      expect(env.isUserInGroup("devuser", "developers")).toBe(true);
    });
  });

  describe("step completion detection", () => {
    test("should detect all steps in happy path", async () => {
      // Execute happy path
      await env.executeAction({ type: "command", command: "sudo su" });
      await env.executeAction({ type: "command", command: "useradd -m devuser" });
      await env.executeAction({ type: "command", command: "chmod 750 /home/devuser" });
      await env.executeAction({ type: "command", command: "usermod -aG developers devuser" });

      const state = env.getState();
      expect(state.completedSteps).toContain("become-root");
      expect(state.completedSteps).toContain("create-user");
      expect(state.completedSteps).toContain("set-permissions");
      expect(state.completedSteps).toContain("add-to-group");
    });
  });

  describe("hint and solution actions", () => {
    test("should log hint request", async () => {
      const action: StudentAction = {
        type: "hint",
        stepId: "become-root",
        hintIndex: 0,
      };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);

      // Check telemetry
      const events = env.getEvents();
      const hintEvent = events.find((e) => e.event_type === "hint_requested");
      expect(hintEvent).toBeDefined();
    });

    test("should log solution viewed", async () => {
      const action: StudentAction = {
        type: "solution",
        stepId: "become-root",
      };
      const result = await env.executeAction(action);

      expect(result.success).toBe(true);

      // Check telemetry
      const events = env.getEvents();
      const solutionEvent = events.find((e) => e.event_type === "solution_viewed");
      expect(solutionEvent).toBeDefined();
    });
  });

  describe("telemetry", () => {
    test("should log commands to telemetry", async () => {
      await env.executeAction({ type: "command", command: "whoami" });

      const events = env.getEvents();
      expect(events.length).toBeGreaterThan(0);

      // Should have session_started and command_executed events
      expect(events.some((e) => e.event_type === "session_started")).toBe(true);
      expect(events.some((e) => e.event_type === "command_executed")).toBe(true);
    });

    test("should log step completion to telemetry", async () => {
      await env.executeAction({ type: "command", command: "sudo su" });

      const events = env.getEvents();
      const checkPassedEvent = events.find((e) => e.event_type === "check_passed");
      const stepCompletedEvent = events.find((e) => e.event_type === "step_completed");

      expect(checkPassedEvent).toBeDefined();
      expect(stepCompletedEvent).toBeDefined();
    });
  });
});

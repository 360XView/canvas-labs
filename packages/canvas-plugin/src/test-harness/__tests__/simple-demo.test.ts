// Simple Demo Test
// Demonstrates the test harness with minimal complexity

import { describe, test, expect } from "bun:test";
import { createTUIEnvironment } from "../environment/tui-environment";
import { createMockEnvironment } from "../environment/mock-environment";
import { loadModule } from "../../lab/module-loader";

const testModule = loadModule("linux-user-management");

describe("Simple Demo - Mock Environment", () => {
  test("load module and check initial state", async () => {
    const env = createMockEnvironment({
      moduleId: "linux-user-management",
      studentId: "demo-student",
    });

    await env.initialize(testModule);

    const state = env.getState();
    console.log("\n=== Initial State ===");
    console.log(`Module: ${state.moduleId}`);
    console.log(`Steps: ${state.stepIds.join(", ")}`);
    console.log(`Current user: ${state.currentUser}`);
    console.log(`Completed: ${state.completedSteps.length} steps`);

    expect(state.moduleId).toBe("linux-user-management");
    expect(state.stepIds.length).toBeGreaterThan(0);
  });

  test("execute one command and see result", async () => {
    const env = createMockEnvironment({
      moduleId: "linux-user-management",
      studentId: "demo-student",
    });

    await env.initialize(testModule);

    console.log("\n=== Executing: sudo su ===");
    const result = await env.executeAction({
      type: "command",
      command: "sudo su",
    });

    console.log(`Success: ${result.success}`);
    console.log(`Exit code: ${result.exitCode}`);
    console.log(`Completed steps: ${result.completedSteps?.join(", ") || "none"}`);

    expect(result.success).toBe(true);
  });

  test("request a hint and see telemetry", async () => {
    const env = createMockEnvironment({
      moduleId: "linux-user-management",
      studentId: "demo-student",
    });

    await env.initialize(testModule);

    console.log("\n=== Requesting hint for step: become-root ===");
    await env.executeAction({
      type: "hint",
      stepId: "become-root",
      hintIndex: 0,
    });

    const events = env.getEvents();
    const hintEvent = events.find((e) => e.event_type === "hint_requested");

    console.log(`Hint event logged: ${hintEvent ? "yes" : "no"}`);
    if (hintEvent) {
      console.log(`Step: ${hintEvent.payload.step_id}`);
      console.log(`Hint index: ${hintEvent.payload.hint_index}`);
    }

    expect(hintEvent).toBeDefined();
  });
});

describe("Simple Demo - TUI Environment (Real Shell)", () => {
  test("execute real shell commands", async () => {
    const env = createTUIEnvironment({
      moduleId: "linux-user-management",
      studentId: "demo-student",
      shellCommand: "/bin/bash",
      commandTimeoutMs: 5000,
    });

    await env.initialize(testModule);

    console.log("\n=== Real Shell Test ===");

    // Run whoami
    console.log("Running: whoami");
    const whoami = await env.executeAction({
      type: "command",
      command: "whoami",
    });
    console.log(`Output: ${whoami.output}`);
    console.log(`Exit code: ${whoami.exitCode}`);

    // Run pwd
    console.log("\nRunning: pwd");
    const pwd = await env.executeAction({
      type: "command",
      command: "pwd",
    });
    console.log(`Output: ${pwd.output}`);

    // Run echo
    console.log("\nRunning: echo 'Hello from test harness!'");
    const echo = await env.executeAction({
      type: "command",
      command: "echo 'Hello from test harness!'",
    });
    console.log(`Output: ${echo.output}`);

    await env.dispose();

    expect(whoami.success).toBe(true);
    expect(pwd.success).toBe(true);
    expect(echo.output).toContain("Hello from test harness!");
  }, 15000);
});

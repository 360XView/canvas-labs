// Lab Simulation Test - End-to-end test for lab environment
// Runs a Docker container, executes student commands, and verifies:
// 1. Command logging works
// 2. Check scripts detect completions
// 3. Monitor picks up check results
// 4. IPC messages are sent correctly

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, unlinkSync, appendFileSync } from "fs";
import { join, resolve } from "path";
import { createTestIPCServer, writeTestCommand } from "./helpers";
import { createMonitor } from "../monitor";

// Base directory for the canvas project
const BASE_DIR = resolve(import.meta.dir, "../../..");

describe("Lab simulation", () => {
  let logDir: string;
  let socketPath: string;
  let containerId: string;
  let monitor: Awaited<ReturnType<typeof createMonitor>>;
  let ipcServer: Awaited<ReturnType<typeof createTestIPCServer>>;
  const completedSteps: string[] = [];

  beforeAll(async () => {
    // 1. Setup temp directories
    logDir = mkdtempSync("/tmp/lab-sim-");
    socketPath = `/tmp/lab-sim-${Date.now()}.sock`;
    writeFileSync(`${logDir}/commands.log`, "");
    writeFileSync(`${logDir}/checks.log`, "");

    // 2. Start mock IPC server
    ipcServer = await createTestIPCServer(socketPath);

    // 3. Start monitor (watching logs, sending to IPC)
    monitor = await createMonitor({
      logPath: `${logDir}/commands.log`,
      socketPath,
      moduleId: "linux-user-management",
      checksLogPath: `${logDir}/checks.log`,
      onTaskCompleted: (stepId) => {
        completedSteps.push(stepId);
      },
      onLog: (msg) => {
        // Uncomment for debugging:
        // console.log(`[Monitor] ${msg}`);
      },
      onError: (err) => {
        console.error(`[Monitor Error] ${err.message}`);
      },
    });

    await monitor.start();

    // 4. Start container in background (non-interactive mode)
    // Override entrypoint to use sleep, run orchestrator via docker exec
    const result = spawnSync("docker", [
      "run",
      "-d",
      "--rm",
      "--entrypoint",
      "/bin/bash",
      "-e",
      "LAB_MODULE_ID=linux-user-management",
      "-v",
      `${logDir}:/var/log/lab-commands`,
      "canvas-lab:latest",
      "-c",
      "sleep 300",
    ]);

    if (result.status !== 0) {
      throw new Error(`Failed to start container: ${result.stderr?.toString()}`);
    }

    containerId = result.stdout.toString().trim();

    // Start orchestrator in background (runs setup and starts check polling)
    const orchResult = spawnSync("docker", [
      "exec",
      "-d",
      containerId,
      "/usr/local/bin/lab-orchestrator.sh",
    ]);

    if (orchResult.status !== 0) {
      console.warn(`Orchestrator start warning: ${orchResult.stderr?.toString()}`);
    }

    // Wait for orchestrator to initialize and checks to start polling
    await Bun.sleep(3000);
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    // Cleanup in order
    if (containerId) {
      spawnSync("docker", ["stop", containerId]);
    }

    if (monitor) {
      monitor.stop();
    }

    if (ipcServer) {
      ipcServer.close();
    }

    if (existsSync(logDir)) {
      rmSync(logDir, { recursive: true, force: true });
    }

    try {
      unlinkSync(socketPath);
    } catch {
      // Socket may already be cleaned up
    }
  });

  test("become-root triggers command validation", async () => {
    // Simulate the 'sudo su' command that switches to root
    // The command is logged by the student user before switching
    writeTestCommand(
      `${logDir}/commands.log`,
      "sudo su",
      "student",  // user is still student executing the command
      "/home/student"
    );

    // Wait for monitor to process
    await Bun.sleep(2000);

    const commands = readFileSync(`${logDir}/commands.log`, "utf-8");
    expect(commands).toContain('"command":"sudo su"');

    // Monitor should have detected become-root step
    expect(completedSteps).toContain("become-root");
  });

  test("create-user triggers check script", async () => {
    // Create the devuser - the check script polls for this
    spawnSync("docker", ["exec", containerId, "useradd", "-m", "devuser"]);

    // Wait for check script to detect and log result
    await Bun.sleep(4000);

    const checks = readFileSync(`${logDir}/checks.log`, "utf-8");
    expect(checks).toContain('"stepId":"create-user"');
    expect(checks).toContain('"status":"passed"');
  }, 10000);

  test("set-permissions triggers check script", async () => {
    // Set permissions on devuser's home directory
    spawnSync("docker", ["exec", containerId, "chmod", "750", "/home/devuser"]);

    // Wait for check script to detect and log result
    await Bun.sleep(4000);

    const checks = readFileSync(`${logDir}/checks.log`, "utf-8");
    expect(checks).toContain('"stepId":"set-permissions"');
  }, 10000);

  test("add-to-group triggers check script", async () => {
    // Add devuser to developers group
    spawnSync("docker", [
      "exec",
      containerId,
      "usermod",
      "-aG",
      "developers",
      "devuser",
    ]);

    // Wait for check script to detect and log result
    await Bun.sleep(4000);

    const checks = readFileSync(`${logDir}/checks.log`, "utf-8");
    expect(checks).toContain('"stepId":"add-to-group"');
  }, 10000);

  test("monitor received all check completions", async () => {
    // Give monitor time to process all check results
    await Bun.sleep(2000);

    // Check that monitor callback received completions
    expect(completedSteps).toContain("create-user");
    expect(completedSteps).toContain("set-permissions");
    expect(completedSteps).toContain("add-to-group");
  });

  test("IPC server received task completion messages", async () => {
    // The monitor should have sent messages to the IPC server
    await Bun.sleep(1000);

    const taskCompletedMessages = ipcServer.received.filter(
      (m: any) => m.type === "taskCompleted"
    );

    const stepIds = taskCompletedMessages.map((m: any) => m.stepId);

    expect(stepIds).toContain("create-user");
    expect(stepIds).toContain("set-permissions");
    expect(stepIds).toContain("add-to-group");

    // Verify message structure
    for (const msg of taskCompletedMessages) {
      expect(msg).toHaveProperty("type", "taskCompleted");
      expect(msg).toHaveProperty("stepId");
      expect(msg).toHaveProperty("taskId");
      // Source is "check" for check-script validations, "command" for command-based validation
      expect(["check", "command"]).toContain((msg as any).source);
    }
  });
});

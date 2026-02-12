// Headless Scenario Runner
// Executes a scripted scenario using Docker + monitor + IPC mock
// No tmux, no VTA canvas, no tutor — produces telemetry artifacts only

import { spawnSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  appendFileSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createMonitor } from "../lab/monitor";
import type { LabMessage } from "../ipc/types";
import type { ScenarioDefinition, ScenarioAction, ScenarioResult } from "./types";

export interface RunOptions {
  outputDir?: string;
  dockerImage?: string;
  verbose?: boolean;
}

/**
 * Run a scenario headlessly: Docker container + monitor + mock IPC
 * Returns ScenarioResult with all artifacts in logDir
 */
export async function runScenarioHeadless(
  scenario: ScenarioDefinition,
  options: RunOptions = {}
): Promise<ScenarioResult> {
  const startTime = new Date();
  const errors: string[] = [];
  const completedSteps: string[] = [];
  const dockerImage = options.dockerImage ?? "canvas-lab:latest";
  const verbose = options.verbose ?? false;
  const vlog = (msg: string) => { if (verbose) console.log(`  ${msg}`); };

  // 1. Create log directory
  const logDir = options.outputDir ?? join(tmpdir(), `eval-${Date.now()}`);
  mkdirSync(logDir, { recursive: true });

  // Pre-initialize log files
  writeFileSync(join(logDir, "commands.log"), "");
  writeFileSync(join(logDir, "checks.log"), "");

  // Pre-initialize state.json with step IDs
  const initialState = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    steps: scenario.stepIds.map((id) => ({
      id,
      completed: false,
      source: "module",
    })),
  };
  writeFileSync(join(logDir, "state.json"), JSON.stringify(initialState, null, 2));

  // 2. Create IPC server (mock VTA)
  const socketPath = join(logDir, "eval.sock");
  let hubSocket: { write: (data: string | Uint8Array) => number } | null = null;

  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        hubSocket = socket;
        vlog("[ipc] Hub connected to mock VTA server");
      },
      data(_socket, data) {
        // Receive messages from hub (taskCompleted, labStatus, etc.)
        const lines = data.toString().split("\n").filter((l) => l.trim());
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === "taskCompleted") {
              vlog(`[ipc] Received taskCompleted: ${msg.stepId}`);
            }
          } catch {}
        }
      },
      close() {
        hubSocket = null;
      },
      error() {},
    },
  });

  // 3. Start monitor (creates EventHub with adapter, connects to IPC server)
  const monitor = await createMonitor({
    logPath: join(logDir, "commands.log"),
    socketPath,
    moduleId: scenario.moduleId,
    studentId: "eval-baseline",
    checksLogPath: join(logDir, "checks.log"),
    onTaskCompleted: (stepId) => {
      if (!completedSteps.includes(stepId)) {
        completedSteps.push(stepId);
        vlog(`[monitor] Step completed: ${stepId}`);
      }
    },
    onLog: verbose ? (msg) => console.log(`  [monitor] ${msg}`) : undefined,
    onError: (err) => {
      errors.push(err.message);
      if (verbose) console.error(`  [error] ${err.message}`);
    },
  });

  await monitor.start();

  // Wait for hub to connect to IPC server
  const connectDeadline = Date.now() + 5000;
  while (!hubSocket && Date.now() < connectDeadline) {
    await Bun.sleep(50);
  }

  if (!hubSocket) {
    vlog("[warn] Hub did not connect to IPC server within 5s, continuing without IPC");
  }

  // 4. Start Docker container
  let containerId: string | null = null;
  try {
    containerId = startDockerContainer(logDir, scenario.moduleId, dockerImage, vlog);
    startOrchestrator(containerId, vlog);
    // Wait for orchestrator to initialize and start check polling
    await Bun.sleep(3000);
  } catch (err: any) {
    errors.push(`Docker setup failed: ${err.message}`);
    // Clean up and return early
    monitor.stop();
    server.stop();
    try { unlinkSync(socketPath); } catch {}
    const endTime = new Date();
    return {
      scenarioId: scenario.id,
      moduleId: scenario.moduleId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationSeconds: Math.round((endTime.getTime() - startTime.getTime()) / 1000),
      logDir,
      success: false,
      errors,
      completedSteps,
    };
  }

  // 5. Execute scenario actions
  vlog(`\nExecuting ${scenario.actions.length} actions...`);

  for (let i = 0; i < scenario.actions.length; i++) {
    const action = scenario.actions[i];
    try {
      await executeAction(action, {
        logDir,
        containerId,
        hubSocket,
        completedSteps,
        verbose,
      });
    } catch (err: any) {
      errors.push(`Action ${i} (${action.type}) failed: ${err.message}`);
      if (verbose) console.error(`  [error] Action ${i} failed: ${err.message}`);
    }
  }

  // 6. Stop monitor (triggers session_ended telemetry)
  monitor.stop();

  // 7. Stop Docker container
  if (containerId) {
    vlog("[docker] Stopping container...");
    spawnSync("docker", ["stop", containerId], { timeout: 10000 });
  }

  // 8. Clean up IPC
  server.stop();
  try { unlinkSync(socketPath); } catch {}

  const endTime = new Date();
  vlog(`\nScenario complete. Duration: ${Math.round((endTime.getTime() - startTime.getTime()) / 1000)}s`);
  vlog(`Completed steps: ${completedSteps.join(", ")}`);
  if (errors.length > 0) vlog(`Errors: ${errors.join("; ")}`);

  return {
    scenarioId: scenario.id,
    moduleId: scenario.moduleId,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationSeconds: Math.round((endTime.getTime() - startTime.getTime()) / 1000),
    logDir,
    success: errors.length === 0,
    errors,
    completedSteps,
  };
}

// --- Docker helpers ---

function startDockerContainer(
  logDir: string,
  moduleId: string,
  dockerImage: string,
  vlog: (msg: string) => void
): string {
  vlog("[docker] Starting container...");
  const result = spawnSync("docker", [
    "run",
    "-d",
    "--rm",
    "--entrypoint",
    "/bin/bash",
    "-e",
    `LAB_MODULE_ID=${moduleId}`,
    "-v",
    `${logDir}:/var/log/lab-commands`,
    dockerImage,
    "-c",
    "sleep 300",
  ]);

  if (result.status !== 0) {
    throw new Error(`Failed to start container: ${result.stderr?.toString()}`);
  }

  const containerId = result.stdout.toString().trim();
  vlog(`[docker] Container started: ${containerId.substring(0, 12)}`);
  return containerId;
}

function startOrchestrator(containerId: string, vlog: (msg: string) => void): void {
  vlog("[docker] Starting orchestrator...");
  const result = spawnSync("docker", [
    "exec",
    "-d",
    containerId,
    "/usr/local/bin/lab-orchestrator.sh",
  ]);

  if (result.status !== 0) {
    vlog(`[warn] Orchestrator start warning: ${result.stderr?.toString()}`);
  }
}

// --- Action execution ---

interface ActionContext {
  logDir: string;
  containerId: string;
  hubSocket: { write: (data: string | Uint8Array) => number } | null;
  completedSteps: string[];
  verbose: boolean;
}

async function executeAction(action: ScenarioAction, ctx: ActionContext): Promise<void> {
  const vlog = (msg: string) => { if (ctx.verbose) console.log(`  ${msg}`); };

  switch (action.type) {
    case "command": {
      vlog(`[action] command: ${action.command} (${action.description})`);

      // Write to commands.log so the adapter can detect patterns
      const entry = {
        timestamp: new Date().toISOString(),
        user: "student",
        pwd: "/home/student",
        command: action.command,
        exitCode: 0,
      };
      appendFileSync(join(ctx.logDir, "commands.log"), JSON.stringify(entry) + "\n");

      // Also execute in Docker for real side effects (check scripts need actual changes)
      const parts = action.command.split(/\s+/);
      const result = spawnSync("docker", ["exec", ctx.containerId, ...parts], {
        timeout: 10000,
      });
      if (result.status !== 0 && ctx.verbose) {
        vlog(`[docker] Command exit ${result.status}: ${result.stderr?.toString().trim()}`);
      }

      // Small delay for adapter to process
      await Bun.sleep(500);
      break;
    }

    case "vta_hint": {
      vlog(`[action] vta_hint: step=${action.stepId} hint=${action.hintIndex}`);
      sendVTAMessage(ctx.hubSocket, {
        type: "hintRequested",
        stepId: action.stepId,
        hintIndex: action.hintIndex,
        totalHints: action.totalHints,
      });
      await Bun.sleep(100);
      break;
    }

    case "vta_solution": {
      vlog(`[action] vta_solution: step=${action.stepId}`);
      sendVTAMessage(ctx.hubSocket, {
        type: "solutionViewed",
        stepId: action.stepId,
      });
      await Bun.sleep(100);
      break;
    }

    case "vta_step_view": {
      vlog(`[action] vta_step_view: step=${action.stepId} (${action.stepType})`);
      sendVTAMessage(ctx.hubSocket, {
        type: "stepViewed",
        stepId: action.stepId,
        stepType: action.stepType,
      });
      await Bun.sleep(100);
      break;
    }

    case "wait": {
      vlog(`[action] wait: ${action.seconds}s (${action.description})`);
      await Bun.sleep(action.seconds * 1000);
      break;
    }

    case "wait_for_step": {
      vlog(`[action] wait_for_step: ${action.stepId} (timeout: ${action.timeoutSeconds}s)`);
      const deadline = Date.now() + action.timeoutSeconds * 1000;

      while (Date.now() < deadline) {
        if (ctx.completedSteps.includes(action.stepId)) {
          vlog(`[action] Step ${action.stepId} completed`);
          return;
        }

        // Also check state.json as a fallback
        try {
          const state = JSON.parse(readFileSync(join(ctx.logDir, "state.json"), "utf-8"));
          const step = state.steps?.find((s: any) => s.id === action.stepId);
          if (step?.completed) {
            if (!ctx.completedSteps.includes(action.stepId)) {
              ctx.completedSteps.push(action.stepId);
            }
            vlog(`[action] Step ${action.stepId} completed (from state.json)`);
            return;
          }
        } catch {}

        await Bun.sleep(500);
      }

      vlog(`[warn] Timeout waiting for step ${action.stepId}`);
      break;
    }
  }
}

function sendVTAMessage(
  hubSocket: { write: (data: string | Uint8Array) => number } | null,
  msg: LabMessage
): void {
  if (!hubSocket) return;
  hubSocket.write(JSON.stringify(msg) + "\n");
}

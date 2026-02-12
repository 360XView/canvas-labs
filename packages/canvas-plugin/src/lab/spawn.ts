// Lab Environment Spawner
// Sets up tmux with vTA on top and Docker container below

import { spawn, spawnSync } from "child_process";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { loadModule, generateTutorPrompt } from "./module-loader";
import { getWorkspaceDir, getProgress, getCurrentProfile, touchProfile } from "../tutor/profile-manager";
import { getProfileDir, getMemoryDir } from "../tutor/defaults";
import { generateTutorCLAUDEmd } from "../tutor/prompts/tutor-prompt";
import { runHealthcheck, getModuleHealthcheck, formatHealthcheckResult } from "./healthcheck";
import type { Progress } from "../tutor/types";
import type { LabType } from "./telemetry/types";

export interface LabSpawnOptions {
  moduleId: string;
  dockerImage?: string;
  sessionName?: string;
  vtaHeight?: number; // Percentage of screen for vTA (default 40)
  tutor?: boolean; // Whether to start Claude Code tutor (default: true)
  profileName?: string; // Profile for progress tracking (default: current profile)
  skipHealthcheck?: boolean; // Skip pre-flight healthcheck (default: false)
  labType?: LabType;  // NEW: Lab type (defaults to module's labType or "linux_cli")
  courseId?: string;  // NEW: Course ID if module is part of a course
}

export interface LabSpawnResult {
  sessionName: string;
  logPath: string;
  socketPath: string;
  containerId?: string;
  tutorEnabled: boolean; // Whether tutor was started
  healthcheckPassed?: boolean;
  healthcheckMessage?: string;
}

// Get the base path for this package
function getBasePath(): string {
  // Resolve relative to this file's location
  return resolve(dirname(import.meta.path), "../..");
}

export async function spawnLabEnvironment(
  options: LabSpawnOptions
): Promise<LabSpawnResult> {
  const {
    moduleId,
    dockerImage = "canvas-lab:latest",
    sessionName = `lab-${moduleId}-${Date.now()}`,
    vtaHeight = 52,
    tutor = true, // Default to true
    profileName = getCurrentProfile().id,
    skipHealthcheck = false,
    labType: providedLabType,  // NEW: Optional lab type override
  } = options;

  // Load module to get labType (if not provided explicitly)
  const module = loadModule(moduleId);
  const labType = providedLabType ?? module.labType ?? "linux_cli";

  // Touch profile to update lastActiveAt
  touchProfile(profileName);

  const basePath = getBasePath();
  const labId = `${moduleId}-${Date.now()}`;
  const logDir = `/tmp/lab-logs-${labId}`;
  const logPath = `${logDir}/commands.log`;
  const socketPath = `/tmp/lab-${labId}.sock`;

  // Create log directory and log files
  mkdirSync(logDir, { recursive: true });
  writeFileSync(logPath, ""); // Create empty commands log file
  writeFileSync(`${logDir}/checks.log`, ""); // Create empty checks log file
  writeFileSync(`${logDir}/tutor-commands.json`, JSON.stringify({ commands: [] }, null, 2)); // Tutor control file
  writeFileSync(`${logDir}/tutor-speech.jsonl`, ""); // Tutor utterance capture (from Claude Code Stop hooks)
  writeFileSync(`${logDir}/state.json`, JSON.stringify({
    version: 1,
    lastUpdated: new Date().toISOString(),
    steps: [],
  }, null, 2)); // State sync file for tutor

  // Start Docker container in detached mode for healthcheck
  console.log(`Starting lab container for module: ${moduleId}...`);
  const containerId = startContainerDetached(dockerImage, logDir, moduleId);

  // Store containerId for cleanup during VTA exit
  if (containerId) {
    writeFileSync(join(logDir, "container.id"), containerId);
  }

  if (!containerId) {
    return {
      sessionName,
      logPath,
      socketPath,
      tutorEnabled: false,
      healthcheckPassed: false,
      healthcheckMessage: "Failed to start Docker container",
    };
  }

  // Run healthcheck unless skipped
  let healthcheckPassed = true;
  let healthcheckMessage = "Healthcheck skipped";

  if (!skipHealthcheck) {
    console.log("Running environment healthcheck...");
    const healthcheckConfig = getModuleHealthcheck(moduleId);
    const result = await runHealthcheck(containerId, healthcheckConfig);

    healthcheckPassed = result.passed;
    healthcheckMessage = formatHealthcheckResult(result);

    if (!result.passed) {
      console.error("\n" + healthcheckMessage);
      console.error("\nLab setup failed. Cleaning up...");

      // Kill the container
      spawnSync("docker", ["kill", containerId], { stdio: "pipe" });
      spawnSync("docker", ["rm", containerId], { stdio: "pipe" });

      return {
        sessionName,
        logPath,
        socketPath,
        containerId,
        tutorEnabled: false,
        healthcheckPassed: false,
        healthcheckMessage,
      };
    }

    console.log("Healthcheck passed!");
  }

  // Check if we're in tmux
  const inTmux = !!process.env.TMUX;

  // Pass moduleId to VTA (VTA will load the module itself)
  const vtaConfig = JSON.stringify({ moduleId });

  // Docker attach command (container already running)
  // Wrap with script to capture terminal output for tutor evaluation
  // Cleanup container when session ends
  // Note: macOS script syntax: script [-q] file command
  //       Linux script syntax: script [-q] -c 'command' file
  const isMacOS = process.platform === "darwin";
  const dockerExecCmd = `docker exec -it ${containerId} su - student`;
  const dockerAttachCmd = isMacOS
    ? `script -q ${logDir}/terminal.log ${dockerExecCmd}; docker stop ${containerId} 2>/dev/null`
    : `script -q -c '${dockerExecCmd}' ${logDir}/terminal.log; docker stop ${containerId} 2>/dev/null`;

  const vtaCmd = `cd ${basePath} && bun run src/cli.ts show vta --config '${vtaConfig}' --socket ${socketPath} --scenario lab`;

  // Layout with tutor:
  // ┌─────────────┬─────────────────────────────────────────┐
  // │             │  VTA Canvas (65% height)                │
  // │   Tutor     ├─────────────────────────────────────────┤
  // │   30%       │  Docker Container (35% height)          │
  // └─────────────┴─────────────────────────────────────────┘
  //
  // Layout without tutor:
  // ┌───────────────────────────────────────────────────────┐
  // │  VTA Canvas (65% height)                              │
  // ├───────────────────────────────────────────────────────┤
  // │  Docker Container (35% height)                        │
  // └───────────────────────────────────────────────────────┘

  // Get tutor workspace ready if tutor is enabled (needed for initial layout)
  let tutorWorkspace: string | undefined;
  if (tutor) {
    tutorWorkspace = getWorkspaceDir(profileName);
    mkdirSync(tutorWorkspace, { recursive: true });

    // Create .claude directory for settings
    const claudeDir = join(tutorWorkspace, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    // Create settings.local.json with permissions for /tmp lab logs
    // Absolute paths use // prefix (like .gitignore syntax)
    // Use :* prefix matching for Bash commands
    const settingsPath = join(claudeDir, "settings.local.json");

    // Memory directory for tutor observations
    const memoryDir = getMemoryDir(profileName);

    // Build capture script command with env vars baked in
    const captureScriptPath = resolve(basePath, "scripts/capture-tutor-output.sh");
    const hookCommand = `LAB_LOG_DIR="${logDir}" LAB_SESSION_ID="${labId}" "${captureScriptPath}"`;

    const settings = {
      model: "haiku",
      permissions: {
        allow: [
          "Read(//tmp/**)",
          "Write(//tmp/**)",
          "Glob(//tmp/**)",
          `Read(${memoryDir}/**)`,
          `Write(${memoryDir}/**)`,
          "Bash(ls:*)",
          "Bash(cat:*)",
        ],
      },
      hooks: {
        Stop: [
          {
            // Stop hooks don't support matchers
            hooks: [
              {
                type: "command",
                command: hookCommand,
              },
            ],
          },
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Get profile progress for context
    const progress = getProgress(profileName);
    const tutorPrompt = generateTutorCLAUDEmd({
      moduleId,
      logDir,
      profileName,
      progress,
    });
    writeFileSync(join(tutorWorkspace, "CLAUDE.md"), tutorPrompt);
  }

  if (!inTmux) {
    if (tutor && tutorWorkspace) {
      // Create new tmux session with Tutor (Claude) in the main pane
      spawnSync("tmux", [
        "new-session",
        "-d",
        "-s", sessionName,
        "-x", "200",
        "-y", "50",
        "-c", tutorWorkspace,
        "claude",
      ]);

      await sleep(200);

      // Split horizontally (left/right) - new right pane is 70%, Tutor stays at 30%
      spawnSync("tmux", [
        "split-window",
        "-t", sessionName,
        "-h",           // Horizontal split (side by side)
        "-p", "70",     // New pane (right) gets 70%
        vtaCmd,
      ]);

      await sleep(200);

      // Target the right pane (VTA, pane 1) and split vertically for Docker
      // New bottom pane is 35%, VTA keeps 65%
      spawnSync("tmux", [
        "split-window",
        "-t", `${sessionName}:0.1`,  // Target VTA pane
        "-v",           // Vertical split (top/bottom)
        "-p", "35",     // New pane (Docker) gets 35%
        dockerAttachCmd,
      ]);

      // Select the Docker pane (bottom right, pane 2)
      spawnSync("tmux", ["select-pane", "-t", `${sessionName}:0.2`]);

    } else {
      // No tutor - simpler layout with VTA on top, Docker on bottom
      spawnSync("tmux", [
        "new-session",
        "-d",
        "-s", sessionName,
        "-x", "200",
        "-y", "50",
        vtaCmd,
      ]);

      await sleep(200);

      // Split vertically - Docker below (35%), VTA keeps 65%
      spawnSync("tmux", [
        "split-window",
        "-t", sessionName,
        "-v",
        "-p", "35",
        dockerAttachCmd,
      ]);

      // Select the Docker pane
      spawnSync("tmux", ["select-pane", "-t", sessionName, "-D"]);
    }

    // Attach to session (this blocks until session ends)
    spawnSync("tmux", ["attach-session", "-t", sessionName], {
      stdio: "inherit",
    });

  } else {
    // Already in tmux - create new window
    if (tutor && tutorWorkspace) {
      // Create new window with Tutor (Claude)
      spawnSync("tmux", [
        "new-window",
        "-n", `lab-${moduleId}`,
        "-c", tutorWorkspace,
        "claude",
      ]);

      await sleep(200);

      // Split horizontally - new right pane is 70%, Tutor stays at 30%
      spawnSync("tmux", [
        "split-window",
        "-h",
        "-p", "70",
        vtaCmd,
      ]);

      await sleep(200);

      // Split the right pane (VTA) vertically for Docker
      // New bottom pane is 35%, VTA keeps 65%
      spawnSync("tmux", [
        "split-window",
        "-v",
        "-p", "35",
        dockerAttachCmd,
      ]);

      // Select the Docker pane (bottom right)
      spawnSync("tmux", ["select-pane", "-D"]);

    } else {
      // No tutor - VTA on top, Docker on bottom
      spawnSync("tmux", ["new-window", "-n", `lab-${moduleId}`, vtaCmd]);

      await sleep(200);

      spawnSync("tmux", ["split-window", "-v", "-p", "35", dockerAttachCmd]);

      // Select the Docker pane
      spawnSync("tmux", ["select-pane", "-D"]);
    }
  }

  // Start the monitor in the background
  // Pass labType via environment variable
  const monitorProcess = spawn(
    "bun",
    ["run", `${basePath}/src/lab/monitor.ts`, logPath, socketPath, moduleId, labType],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        LAB_TYPE: labType,  // Also pass as env var for safety
      },
    }
  );
  if (monitorProcess.pid) {
    writeFileSync(join(logDir, "monitor.pid"), String(monitorProcess.pid));
  }
  monitorProcess.unref();

  // Start progress updater in background (pass socketPath for heartbeat)
  const progressUpdaterProcess = spawn(
    "bun",
    ["run", `${basePath}/src/tutor/progress-updater.ts`, logDir, profileName, moduleId, socketPath],
    {
      detached: true,
      stdio: "ignore",
    }
  );
  if (progressUpdaterProcess.pid) {
    writeFileSync(join(logDir, "progress-updater.pid"), String(progressUpdaterProcess.pid));
  }
  progressUpdaterProcess.unref();

  // Start tutor watcher if tutor is enabled
  if (tutor) {
    // Tutor pane target for watcher
    // When in tmux, target the window by name (window.pane format)
    // When not in tmux, target by session name (session:pane format)
    const tutorTarget = inTmux ? `lab-${moduleId}.0` : `${sessionName}:0.0`;

    // Start tutor watcher in background (pass socketPath for heartbeat)
    const watcherProcess = spawn(
      "bun",
      ["run", `${basePath}/src/lab/tutor-watcher.ts`, logDir, tutorTarget, socketPath],
      {
        detached: true,
        stdio: "ignore",
      }
    );
    if (watcherProcess.pid) {
      writeFileSync(join(logDir, "tutor-watcher.pid"), String(watcherProcess.pid));
    }
    watcherProcess.unref();
  }

  return {
    sessionName,
    logPath,
    socketPath,
    containerId,
    tutorEnabled: tutor,
    healthcheckPassed,
    healthcheckMessage,
  };
}

/**
 * Start Docker container in detached mode and return container ID
 */
function startContainerDetached(image: string, logDir: string, moduleId: string): string | null {
  // Run Docker container in detached mode
  // The entrypoint runs orchestrator in background and keeps container alive
  const result = spawnSync("docker", [
    "run",
    "-d",                                    // Detached mode
    "--rm",                                  // Auto-cleanup when stopped
    "-e", `LAB_MODULE_ID=${moduleId}`,       // Module ID for orchestrator
    "-v", `${logDir}:/var/log/lab-commands`, // Volume mount for logs
    image,
  ], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    console.error("Failed to start container:", result.stderr);
    return null;
  }

  return result.stdout.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Check if Docker image exists, build if not
export async function ensureDockerImage(imageName: string = "canvas-lab:latest", quiet: boolean = false): Promise<boolean> {
  const result = spawnSync("docker", ["image", "inspect", imageName], {
    stdio: "pipe",
  });

  if (result.status !== 0) {
    if (!quiet) {
      console.log(`Building Docker image '${imageName}'...`);
    }

    const basePath = getBasePath();
    const buildScriptPath = `${basePath}/docker/lab-environment/build.sh`;

    if (!existsSync(buildScriptPath)) {
      console.error(`Build script not found at ${buildScriptPath}`);
      return false;
    }

    // Use build.sh which properly copies labs into the Docker context
    const buildResult = spawnSync(
      "bash",
      [buildScriptPath],
      {
        cwd: `${basePath}/docker/lab-environment`,
        stdio: quiet ? "pipe" : "inherit",
      }
    );

    return buildResult.status === 0;
  }

  return true;
}

/**
 * Spawn a lab environment as part of a course
 * Wraps spawnLabEnvironment and stores course context
 */
export async function spawnCourseLabEnvironment(
  courseId: string,
  moduleId: string,
  studentId: string,
  options: Omit<LabSpawnOptions, "moduleId" | "courseId"> = {}
): Promise<LabSpawnResult> {
  // Call spawnLabEnvironment with courseId
  const result = await spawnLabEnvironment({
    ...options,
    moduleId,
    courseId,
  });

  // Write course.json metadata to log directory for progress tracking
  const fs = await import("fs");
  const courseJsonPath = result.logPath.replace("commands.log", "course.json");
  fs.writeFileSync(
    courseJsonPath,
    JSON.stringify(
      {
        courseId,
        moduleId,
        studentId,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  return result;
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const moduleId = args[0] || "linux-user-management";

  console.log(`Starting lab environment for module: ${moduleId}`);

  // Ensure Docker image exists
  const imageReady = await ensureDockerImage();
  if (!imageReady) {
    console.error("Failed to prepare Docker image");
    process.exit(1);
  }

  // Spawn the lab environment
  const result = await spawnLabEnvironment({ moduleId });
  console.log("Lab environment started:");
  console.log(`  Session: ${result.sessionName}`);
  console.log(`  Logs: ${result.logPath}`);
  console.log(`  Socket: ${result.socketPath}`);
}

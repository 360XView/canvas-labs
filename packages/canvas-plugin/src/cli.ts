#!/usr/bin/env bun
import { program } from "commander";
import { detectTerminal, spawnCanvas } from "./terminal";
import {
  createProfile,
  listProfiles,
  setCurrentProfile,
  getCurrentProfile,
  getCurrentProgress,
  formatDuration,
  profileExists,
} from "./tutor/profile-manager";

// Set window title via ANSI escape codes
function setWindowTitle(title: string) {
  process.stdout.write(`\x1b]0;${title}\x07`);
}

program
  .name("claude-canvas")
  .description("Interactive terminal canvases for Claude")
  .version("1.0.0");

program
  .command("show [kind]")
  .description("Show a canvas in the current terminal")
  .option("--id <id>", "Canvas ID")
  .option("--config <json>", "Canvas configuration (JSON)")
  .option("--socket <path>", "Unix socket path for IPC")
  .option("--scenario <name>", "Scenario name (e.g., display, meeting-picker)")
  .action(async (kind = "demo", options) => {
    const id = options.id || `${kind}-1`;
    const config = options.config ? JSON.parse(options.config) : undefined;
    const socketPath = options.socket;
    const scenario = options.scenario || "display";

    // Set window title
    setWindowTitle(`canvas: ${kind}`);

    // Dynamically import and render the canvas
    const { renderCanvas } = await import("./canvases");
    await renderCanvas(kind, id, config, { socketPath, scenario });
  });

program
  .command("spawn [kind]")
  .description("Spawn a canvas in a new terminal window")
  .option("--id <id>", "Canvas ID")
  .option("--config <json>", "Canvas configuration (JSON)")
  .option("--socket <path>", "Unix socket path for IPC")
  .option("--scenario <name>", "Scenario name (e.g., display, meeting-picker)")
  .action(async (kind = "demo", options) => {
    const id = options.id || `${kind}-1`;
    const result = await spawnCanvas(kind, id, options.config, {
      socketPath: options.socket,
      scenario: options.scenario,
    });
    console.log(`Spawned ${kind} canvas '${id}' via ${result.method}`);
  });

program
  .command("env")
  .description("Show detected terminal environment")
  .action(() => {
    const env = detectTerminal();
    console.log("Terminal Environment:");
    console.log(`  In tmux: ${env.inTmux}`);
    console.log(`\nSummary: ${env.summary}`);
  });

program
  .command("update <id>")
  .description("Send updated config to a running canvas via IPC")
  .option("--config <json>", "New canvas configuration (JSON)")
  .action(async (id: string, options) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = getSocketPath(id);
    const config = options.config ? JSON.parse(options.config) : {};

    try {
      const socket = await Bun.connect({
        unix: socketPath,
        socket: {
          data(socket, data) {
            // Ignore responses
          },
          open(socket) {
            const msg = JSON.stringify({ type: "update", config });
            socket.write(msg + "\n");
            socket.end();
          },
          close() {},
          error(socket, error) {
            console.error("Socket error:", error);
          },
        },
      });
      console.log(`Sent update to canvas '${id}'`);
    } catch (err) {
      console.error(`Failed to connect to canvas '${id}':`, err);
    }
  });

program
  .command("selection <id>")
  .description("Get the current selection from a running document canvas")
  .action(async (id: string) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = getSocketPath(id);

    try {
      let resolved = false;
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error("Timeout waiting for response"));
          }
        }, 2000);

        Bun.connect({
          unix: socketPath,
          socket: {
            data(socket, data) {
              if (resolved) return;
              clearTimeout(timeout);
              resolved = true;
              const response = JSON.parse(data.toString().trim());
              if (response.type === "selection") {
                resolve(JSON.stringify(response.data));
              } else {
                resolve(JSON.stringify(null));
              }
              socket.end();
            },
            open(socket) {
              const msg = JSON.stringify({ type: "getSelection" });
              socket.write(msg + "\n");
            },
            close() {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(JSON.stringify(null));
              }
            },
            error(socket, error) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(error);
              }
            },
          },
        });
      });
      console.log(result);
    } catch (err) {
      console.error(`Failed to get selection from canvas '${id}':`, err);
      process.exit(1);
    }
  });

program
  .command("content <id>")
  .description("Get the current content from a running document canvas")
  .action(async (id: string) => {
    const { getSocketPath } = await import("./ipc/types");
    const socketPath = getSocketPath(id);

    try {
      let resolved = false;
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error("Timeout waiting for response"));
          }
        }, 2000);

        Bun.connect({
          unix: socketPath,
          socket: {
            data(socket, data) {
              if (resolved) return;
              clearTimeout(timeout);
              resolved = true;
              const response = JSON.parse(data.toString().trim());
              if (response.type === "content") {
                resolve(JSON.stringify(response.data));
              } else {
                resolve(JSON.stringify(null));
              }
              socket.end();
            },
            open(socket) {
              const msg = JSON.stringify({ type: "getContent" });
              socket.write(msg + "\n");
            },
            close() {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(JSON.stringify(null));
              }
            },
            error(socket, error) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(error);
              }
            },
          },
        });
      });
      console.log(result);
    } catch (err) {
      console.error(`Failed to get content from canvas '${id}':`, err);
      process.exit(1);
    }
  });

program
  .command("labs")
  .description("Browse and launch available labs interactively")
  .option("--no-assistant", "Disable Claude Code assistant pane")
  .option("--dev", "Start in developer mode (admin assistant)")
  .action(async (options) => {
    const { spawnSync } = await import("child_process");
    const { setupAdminWorkspace } = await import("./tutor/prompts/admin-prompt");
    const { setupMentorWorkspace } = await import("./tutor/prompts/mentor-prompt");

    // Check prerequisites silently
    const prereqErrors: string[] = [];

    // Check tmux
    const tmuxCheck = spawnSync("which", ["tmux"], { stdio: "pipe" });
    if (tmuxCheck.status !== 0) {
      prereqErrors.push("tmux not installed (brew install tmux)");
    }

    // Check docker
    const dockerCheck = spawnSync("docker", ["info"], { stdio: "pipe" });
    if (dockerCheck.status !== 0) {
      prereqErrors.push("Docker not running (start Docker Desktop)");
    }

    if (prereqErrors.length > 0) {
      console.error("Prerequisites missing:");
      prereqErrors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

    // Determine mode and set up appropriate workspace
    const isDev = options.dev === true;
    const launcherMode = isDev ? "developer" : "user";

    // Set up workspace based on mode:
    // User mode -> mentor workspace (learning advisor)
    // Dev mode -> admin workspace (system management)
    const workspaceDir = isDev
      ? setupAdminWorkspace()
      : setupMentorWorkspace();

    // Check if in tmux
    const inTmux = !!process.env.TMUX;
    // Get the canvas plugin directory (parent of src/ where this script lives)
    const { dirname, join } = await import("path");
    const { fileURLToPath } = await import("url");
    const canvasDir = join(dirname(fileURLToPath(import.meta.url)), "..");
    const sessionName = `labs-${Date.now()}`;

    // Build launcher command with mode config
    const launcherConfig = JSON.stringify({ mode: launcherMode });
    const launcherCmd = `bun run src/cli.ts show lab-launcher --config '${launcherConfig}'`;

    if (!inTmux) {
      if (options.assistant !== false) {
        // Not in tmux - start new session with split panes:
        // Left (60%): lab-launcher canvas
        // Right (40%): Claude Code assistant

        // Create tmux session with lab-launcher in left pane
        const createResult = spawnSync("tmux", [
          "new-session",
          "-d",
          "-s", sessionName,
          "-c", canvasDir,
          launcherCmd,
        ], { stdio: "pipe", encoding: "utf-8" });

        if (createResult.status !== 0) {
          console.error("Failed to create tmux session:", createResult.stderr);
          process.exit(1);
        }

        // Split vertically for Claude Code (40% on right)
        const splitResult = spawnSync("tmux", [
          "split-window",
          "-t", sessionName,
          "-h",
          "-p", "40",
          "-c", workspaceDir,
          "claude",
        ], { stdio: "pipe", encoding: "utf-8" });

        if (splitResult.status !== 0) {
          console.error("Failed to split window:", splitResult.stderr);
        }

        // Focus the lab-launcher pane (left)
        spawnSync("tmux", [
          "select-pane",
          "-t", `${sessionName}:0.0`,
        ], { stdio: "pipe" });

        // Attach to the session
        spawnSync("tmux", [
          "attach-session",
          "-t", sessionName,
        ], { stdio: "inherit" });
      } else {
        // No assistant - just launch lab-launcher
        spawnSync("tmux", [
          "new-session",
          "-s", sessionName,
          "-c", canvasDir,
          "sh", "-c", launcherCmd,
        ], { stdio: "inherit" });
      }
    } else {
      // Already in tmux
      if (options.assistant !== false) {
        // Create a new window with split panes

        // Create new window with lab-launcher
        spawnSync("tmux", [
          "new-window",
          "-n", isDev ? "lab-launcher-dev" : "lab-launcher",
          "-c", canvasDir,
          "sh", "-c", launcherCmd,
        ], { stdio: "pipe" });

        // Small delay
        spawnSync("sleep", ["0.1"], { stdio: "pipe" });

        // Split for Claude Code
        spawnSync("tmux", [
          "split-window",
          "-h",
          "-p", "40",
          "-c", workspaceDir,
          "sh", "-c", "claude",
        ], { stdio: "pipe" });

        // Focus lab-launcher pane (left)
        spawnSync("tmux", [
          "select-pane",
          "-L",
        ], { stdio: "pipe" });
      } else {
        // No assistant - show lab-launcher directly
        const { renderCanvas } = await import("./canvases");
        await renderCanvas("lab-launcher", sessionName, { mode: launcherMode });
      }
    }
  });

program
  .command("present [presentationId]")
  .description("View a presentation in the terminal")
  .option("--list", "List available presentations")
  .action(async (presentationId: string | undefined, options) => {
    const { loadPresentation, listPresentations } = await import("./presentation/loader");

    // List mode
    if (options.list || !presentationId) {
      const presentations = listPresentations();
      if (presentations.length === 0) {
        console.log("No presentations found in presentations/ directory");
        return;
      }
      console.log("Available presentations:\n");
      for (const pres of presentations) {
        console.log(`  ${pres.id}`);
        console.log(`    ${pres.title} (${pres.slideCount} slides)`);
        if (pres.description) {
          console.log(`    ${pres.description}`);
        }
        console.log();
      }
      return;
    }

    // Load and display presentation
    try {
      const module = loadPresentation(presentationId);
      const { renderCanvas } = await import("./canvases");
      await renderCanvas("vta", presentationId, { module }, { scenario: "presentation" });
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

program
  .command("lab-list")
  .description("List available lab modules")
  .action(async () => {
    const { listModules } = await import("./lab/module-loader");
    const modules = listModules();

    if (modules.length === 0) {
      console.log("No lab modules found in labs/ directory");
      return;
    }

    console.log("Available lab modules:\n");
    for (const mod of modules) {
      console.log(`  ${mod.id}`);
      console.log(`    ${mod.title}`);
      if (mod.description) {
        console.log(`    ${mod.description}`);
      }
      console.log();
    }
  });

program
  .command("lab-validate <moduleId>")
  .description("Validate a lab module's YAML configuration")
  .action(async (moduleId: string) => {
    const { loadModule, getValidationRules, getCheckConfigs } = await import("./lab/module-loader");

    try {
      const module = loadModule(moduleId);
      const rules = getValidationRules(moduleId);
      const checks = getCheckConfigs(moduleId);

      console.log(`Module: ${module.title}`);
      console.log(`Steps: ${module.steps.length}`);
      console.log(`Validation rules: ${rules.length}`);
      console.log(`Check scripts: ${checks.length}`);
      console.log("\nSteps:");
      for (const step of module.steps) {
        const marker = step.type === "task" ? "[ ]" : "   ";
        console.log(`  ${marker} ${step.id}: ${step.title} (${step.type})`);
      }
      console.log("\n✓ Module is valid");
    } catch (error) {
      console.error(`✗ Validation failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command("lab-test <moduleId>")
  .description("Run automated tests for a lab module")
  .option("--check <name>", "Run specific check script only")
  .option("--setup-only", "Only test the setup script")
  .option("--verbose", "Show full output including stdout/stderr")
  .option("--image <name>", "Docker image to use", "canvas-lab:latest")
  .action(async (moduleId: string, options) => {
    const { spawnSync } = await import("child_process");
    const { runModuleTests, formatTestResult } = await import("./lab/test-runner");
    const { validateModule, formatValidationResult } = await import("./lab/validator");

    // First validate the module structure
    console.log("Validating module structure...\n");
    const validationResult = await validateModule(moduleId);

    if (!validationResult.valid) {
      console.log(formatValidationResult(validationResult, moduleId));
      console.log("\n✗ Fix validation errors before running tests");
      process.exit(1);
    }

    if (validationResult.warnings.length > 0) {
      console.log("Warnings:");
      for (const warning of validationResult.warnings) {
        console.log(`  ⚠ [${warning.field}] ${warning.message}`);
      }
      console.log();
    }

    console.log("✓ Module structure is valid\n");

    // Check Docker is running
    const dockerCheck = spawnSync("docker", ["info"], { stdio: "pipe" });
    if (dockerCheck.status !== 0) {
      console.error("Docker is not running. Start Docker Desktop and try again.");
      process.exit(1);
    }

    // Run the tests
    console.log("Running tests...\n");
    const result = await runModuleTests(moduleId, {
      setupOnly: options.setupOnly,
      checkName: options.check,
      verbose: options.verbose,
      dockerImage: options.image,
    });

    // Print results
    console.log(formatTestResult(result, options.verbose));

    // Exit with appropriate code
    process.exit(result.allPassed ? 0 : 1);
  });

program
  .command("lab-edit [moduleId]")
  .description("Edit a lab module in developer mode")
  .option("--new", "Create a new lab from template")
  .option("--template <name>", "Template to use for new labs", "basic")
  .action(async (moduleId: string | undefined, options) => {
    const { spawnSync } = await import("child_process");
    const { spawnLabEditor } = await import("./lab/editor");
    const { createDraftFromTemplate, moduleExists } = await import("./lab/module-loader");

    // Check prerequisites
    const prereqErrors: string[] = [];

    const tmuxCheck = spawnSync("which", ["tmux"], { stdio: "pipe" });
    if (tmuxCheck.status !== 0) {
      prereqErrors.push("tmux not installed (brew install tmux)");
    }

    if (prereqErrors.length > 0) {
      console.error("Prerequisites missing:");
      prereqErrors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

    // Handle new lab creation
    if (options.new || !moduleId) {
      if (!moduleId) {
        console.error("Please provide a module ID for the new lab:");
        console.error("  bun run src/cli.ts lab-edit my-new-lab --new");
        process.exit(1);
      }

      const { exists, location } = moduleExists(moduleId);
      if (exists) {
        console.error(`Module '${moduleId}' already exists (${location})`);
        process.exit(1);
      }

      console.log(`Creating new lab: ${moduleId} (template: ${options.template})`);
      try {
        createDraftFromTemplate(moduleId, options.template);
        console.log(`Draft created at labs/.drafts/${moduleId}/`);
      } catch (error) {
        console.error(`Failed to create draft: ${error}`);
        process.exit(1);
      }
    }

    // Check if in tmux
    const inTmux = !!process.env.TMUX;

    if (!inTmux) {
      console.log(`Starting lab editor for: ${moduleId}`);
    }

    try {
      await spawnLabEditor({ moduleId: moduleId || "new" });
    } catch (error) {
      console.error(`Failed to start lab editor: ${error}`);
      process.exit(1);
    }
  });

program
  .command("course-picker [studentId]")
  .description("Launch interactive course selection and start first available lab")
  .option("--no-tutor", "Disable AI tutor pane")
  .option("--image <name>", "Docker image to use", "canvas-lab:latest")
  .option("--vta-height <percent>", "Height percentage for vTA pane", "40")
  .action(async (studentId = "default-student", options) => {
    const { spawnSync } = await import("child_process");
    const { showCoursePicker } = await import("./cli/course-picker");
    const { spawnCourseLabEnvironment, ensureDockerImage } = await import("./lab/spawn");

    // Check prerequisites silently
    const prereqErrors: string[] = [];

    // Check tmux
    const tmuxCheck = spawnSync("which", ["tmux"], { stdio: "pipe" });
    if (tmuxCheck.status !== 0) {
      prereqErrors.push("tmux not installed (brew install tmux)");
    }

    // Check docker
    const dockerCheck = spawnSync("docker", ["info"], { stdio: "pipe" });
    if (dockerCheck.status !== 0) {
      prereqErrors.push("Docker not running (start Docker Desktop)");
    }

    if (prereqErrors.length > 0) {
      console.error("Prerequisites missing:");
      prereqErrors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

    try {
      // Show course picker interface
      const result = await showCoursePicker(studentId);
      console.log(`\nStarting course: ${result.courseId}`);
      console.log(`First module: ${result.startingModuleId}\n`);

      // Ensure Docker image exists
      const imageReady = await ensureDockerImage(options.image);
      if (!imageReady) {
        console.error("Failed to build Docker image.");
        process.exit(1);
      }

      // Check if in tmux
      const inTmux = !!process.env.TMUX;

      if (!inTmux) {
        // Not in tmux - start new session and run lab inside it
        const basePath = process.cwd();
        const coursePickerCmd = `bun run src/cli.ts course-picker ${studentId}${options.tutor === false ? " --no-tutor" : ""}`;

        // Create tmux session and run course picker inside
        spawnSync("tmux", [
          "new-session",
          "-s", `course-${Date.now()}`,
          "-c", basePath,
          coursePickerCmd,
        ], { stdio: "inherit" });
      } else {
        // Already in tmux - spawn the lab environment directly
        await spawnCourseLabEnvironment(
          result.courseId,
          result.startingModuleId,
          studentId,
          {
            tutor: options.tutor !== false,
            dockerImage: options.image,
            vtaHeight: parseInt(options.vtaHeight),
          }
        );
      }
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command("lab [moduleId]")
  .description("Start a lab environment with vTA and Docker container")
  .option("--image <name>", "Docker image to use", "canvas-lab:latest")
  .option("--vta-height <percent>", "Height percentage for vTA pane", "40")
  .option("--no-tutor", "Disable AI tutor pane")
  .option("--profile <name>", "Profile to use for progress tracking")
  .action(async (moduleId = "linux-user-management", options) => {
    const { spawnSync } = await import("child_process");
    const { spawnLabEnvironment, ensureDockerImage } = await import("./lab/spawn");

    // Check prerequisites silently
    const prereqErrors: string[] = [];

    // Check tmux
    const tmuxCheck = spawnSync("which", ["tmux"], { stdio: "pipe" });
    if (tmuxCheck.status !== 0) {
      prereqErrors.push("tmux not installed (brew install tmux)");
    }

    // Check docker
    const dockerCheck = spawnSync("docker", ["info"], { stdio: "pipe" });
    if (dockerCheck.status !== 0) {
      prereqErrors.push("Docker not running (start Docker Desktop)");
    }

    if (prereqErrors.length > 0) {
      console.error("Prerequisites missing:");
      prereqErrors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

    // Check if in tmux
    const inTmux = !!process.env.TMUX;

    // Ensure Docker image exists (silently if already built)
    const imageReady = await ensureDockerImage(options.image);
    if (!imageReady) {
      console.error("Failed to build Docker image.");
      process.exit(1);
    }

    // Resolve profile - use specified or current
    const profileName = options.profile || getCurrentProfile().id;
    console.log(`Using profile: ${profileName}`);

    if (!inTmux) {
      // Not in tmux - start new session and run lab inside it
      console.log(`Starting lab: ${moduleId}`);
      const basePath = process.cwd();
      const profileFlag = options.profile ? ` --profile ${options.profile}` : "";
      const labCmd = `bun run src/cli.ts lab ${moduleId}${options.tutor === false ? " --no-tutor" : ""}${profileFlag}`;

      // Create tmux session and run lab command inside
      spawnSync("tmux", [
        "new-session",
        "-s", `lab-${Date.now()}`,
        "-c", basePath,
        labCmd,
      ], { stdio: "inherit" });
    } else {
      // Already in tmux - spawn the lab environment directly
      console.log(`Starting lab: ${moduleId}`);
      await spawnLabEnvironment({
        moduleId,
        dockerImage: options.image,
        vtaHeight: parseInt(options.vtaHeight),
        tutor: options.tutor !== false,
        profileName,
      });
    }
  });

// Profile management commands
program
  .command("profile-list")
  .description("List all tutor profiles")
  .action(() => {
    const profiles = listProfiles();
    const currentId = getCurrentProfile().id;

    if (profiles.length === 0) {
      console.log("No profiles found. Create one with: profile-create <name>");
      return;
    }

    console.log("Profiles:\n");
    for (const profile of profiles) {
      const marker = profile.id === currentId ? "* " : "  ";
      const lastActive = new Date(profile.lastActiveAt).toLocaleDateString();
      console.log(`${marker}${profile.id} (${profile.name})`);
      console.log(`    Last active: ${lastActive}`);
    }
    console.log("\n* = current profile");
  });

program
  .command("profile-create <id>")
  .description("Create a new tutor profile")
  .option("-n, --name <name>", "Display name for the profile")
  .action((id: string, options) => {
    if (profileExists(id)) {
      console.error(`Profile '${id}' already exists`);
      process.exit(1);
    }

    const profile = createProfile(id, options.name || id);
    console.log(`Created profile: ${profile.id} (${profile.name})`);
    console.log(`\nTo use this profile:`);
    console.log(`  bun run src/cli.ts profile-use ${id}`);
    console.log(`  bun run src/cli.ts lab linux-user-management --profile ${id}`);
  });

program
  .command("profile-use <id>")
  .description("Switch to a different profile")
  .action((id: string) => {
    if (!profileExists(id)) {
      console.error(`Profile '${id}' does not exist`);
      console.log("Available profiles:");
      listProfiles().forEach(p => console.log(`  ${p.id}`));
      process.exit(1);
    }

    setCurrentProfile(id);
    console.log(`Switched to profile: ${id}`);
  });

program
  .command("profile-stats")
  .description("Show stats for the current profile")
  .option("--profile <id>", "Show stats for a specific profile")
  .action((options) => {
    const profile = options.profile
      ? listProfiles().find(p => p.id === options.profile)
      : getCurrentProfile();

    if (!profile) {
      console.error(`Profile not found`);
      process.exit(1);
    }

    const progress = getCurrentProgress();

    console.log(`Profile: ${profile.name} (${profile.id})`);
    console.log(`Created: ${new Date(profile.createdAt).toLocaleDateString()}`);
    console.log(`Last active: ${new Date(profile.lastActiveAt).toLocaleDateString()}`);
    console.log();
    console.log("Overall Stats:");
    console.log(`  Labs completed: ${progress.aggregate.totalLabsCompleted}`);
    console.log(`  Total time: ${formatDuration(progress.aggregate.totalTimeSpent)}`);
    console.log(`  Total attempts: ${progress.aggregate.totalAttempts}`);
    console.log(`  Hints used: ${progress.aggregate.totalHintsUsed}`);

    // Show per-lab stats
    const labIds = Object.keys(progress.labs);
    if (labIds.length > 0) {
      console.log("\nLab Progress:");
      for (const labId of labIds) {
        const lab = progress.labs[labId];
        const bestTime = lab.bestTime ? formatDuration(lab.bestTime) : "N/A";
        console.log(`  ${labId}: ${lab.status} (${lab.attempts.length} attempts, best: ${bestTime})`);
      }
    }
  });

program.parse();

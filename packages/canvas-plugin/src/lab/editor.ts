// Lab Editor Orchestration
// Sets up tmux layout for editing labs: Claude Code (developer) on left, VTA Preview on right

import { spawnSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { setupDeveloperWorkspace } from "../tutor/prompts/developer-prompt";
import { createDraftFromTemplate, moduleExists } from "./module-loader";

export interface LabEditorOptions {
  moduleId: string;        // Existing lab ID or ID for new lab
  isNew?: boolean;         // If true, create new lab from template
  templateId?: string;     // For new labs (default: "basic")
  sessionName?: string;    // tmux session name
}

export interface LabEditorResult {
  sessionName: string;
  workspaceDir: string;
}

// Get the base path for this package
function getBasePath(): string {
  return resolve(dirname(import.meta.path), "../..");
}

/**
 * Spawn the lab editor environment
 * Layout:
 * - Left (50%): Claude Code with developer workspace
 * - Right (50%): VTA Preview showing the module
 */
export async function spawnLabEditor(
  options: LabEditorOptions
): Promise<LabEditorResult> {
  const {
    moduleId,
    isNew = false,
    templateId = "basic",
    sessionName = `lab-edit-${moduleId}-${Date.now()}`,
  } = options;

  const basePath = getBasePath();
  const inTmux = !!process.env.TMUX;

  // If creating a new lab, create the draft from template
  if (isNew) {
    const { exists } = moduleExists(moduleId);
    if (exists) {
      throw new Error(`Module '${moduleId}' already exists`);
    }
    createDraftFromTemplate(moduleId, templateId);
  }

  // Set up developer workspace with context about the module being edited
  const workspaceDir = setupDeveloperWorkspace({
    moduleId,
    isNewLab: isNew,
  });

  // Build VTA Preview command
  const previewConfig = JSON.stringify({ moduleId });
  const previewCmd = `cd ${basePath} && bun run src/cli.ts show vta-preview --config '${previewConfig}'`;

  if (!inTmux) {
    // Not in tmux - start new session with split panes

    // Create tmux session with Claude Code on the left
    const createResult = spawnSync("tmux", [
      "new-session",
      "-d",
      "-s", sessionName,
      "-c", workspaceDir,
      "claude",
    ], { stdio: "pipe", encoding: "utf-8" });

    if (createResult.status !== 0) {
      throw new Error(`Failed to create tmux session: ${createResult.stderr}`);
    }

    // Wait for session to initialize
    await sleep(200);

    // Split vertically for VTA Preview (50% on right)
    spawnSync("tmux", [
      "split-window",
      "-t", sessionName,
      "-h",
      "-p", "50",
      "-c", basePath,
      previewCmd,
    ], { stdio: "pipe" });

    // Focus the Claude Code pane (left)
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
    // Already in tmux - create new window with split panes

    // Create new window with Claude Code
    spawnSync("tmux", [
      "new-window",
      "-n", `edit-${moduleId}`,
      "-c", workspaceDir,
      "claude",
    ], { stdio: "pipe" });

    // Wait for window to initialize
    await sleep(200);

    // Split for VTA Preview
    spawnSync("tmux", [
      "split-window",
      "-h",
      "-p", "50",
      "-c", basePath,
      previewCmd,
    ], { stdio: "pipe" });

    // Focus Claude Code pane (left)
    spawnSync("tmux", [
      "select-pane",
      "-L",
    ], { stdio: "pipe" });
  }

  return {
    sessionName,
    workspaceDir,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// CLI entry point for testing
if (import.meta.main) {
  const args = process.argv.slice(2);
  const moduleId = args[0] || "linux-user-management";

  console.log(`Starting lab editor for module: ${moduleId}`);

  spawnLabEditor({ moduleId })
    .then((result) => {
      console.log("Lab editor started:");
      console.log(`  Session: ${result.sessionName}`);
      console.log(`  Workspace: ${result.workspaceDir}`);
    })
    .catch((err) => {
      console.error("Failed to start lab editor:", err);
      process.exit(1);
    });
}

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { LabModule, SessionConfig, AuthConfig } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Manages lab discovery, scaffolding, and initialization
 */
export class LabManager {
  private canvasRepoPath: string;

  constructor(canvasRepoPath?: string) {
    // Default to Canvas repo at ~/.claude/plugins/cache/claude-canvas/canvas/0.1.0
    this.canvasRepoPath =
      canvasRepoPath ||
      path.join(
        process.env.HOME || process.env.USERPROFILE || "~",
        ".claude/plugins/cache/claude-canvas/canvas/0.1.0"
      );
  }

  /**
   * Discover available Python lab modules
   */
  async discoverLabs(): Promise<LabModule[]> {
    const labsDir = path.join(this.canvasRepoPath, "labs");

    if (!fs.existsSync(labsDir)) {
      vscode.window.showErrorMessage(`Labs directory not found: ${labsDir}`);
      return [];
    }

    const labs: LabModule[] = [];

    try {
      const entries = fs.readdirSync(labsDir);

      for (const entry of entries) {
        const labPath = path.join(labsDir, entry);
        const stat = fs.statSync(labPath);

        if (!stat.isDirectory() || entry.startsWith(".")) {
          continue;
        }

        const moduleYamlPath = path.join(labPath, "module.yaml");
        if (!fs.existsSync(moduleYamlPath)) {
          continue;
        }

        // Read YAML to get title and check if it's a Python lab
        const yamlContent = fs.readFileSync(moduleYamlPath, "utf-8");
        if (yamlContent.includes("labType: python")) {
          // Extract title from YAML (simple parsing)
          const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
          const descriptionMatch = yamlContent.match(/^description:\s*(.+)$/m);

          labs.push({
            id: entry,
            title: titleMatch ? titleMatch[1] : entry,
            description: descriptionMatch ? descriptionMatch[1] : "",
            path: labPath,
          });
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to discover labs: ${error}`);
    }

    return labs;
  }

  /**
   * Create a new lab instance
   */
  async createLab(lab: LabModule, studentId: string): Promise<boolean> {
    const labsBaseDir = path.join(
      process.env.HOME || process.env.USERPROFILE || "~",
      "canvas-labs"
    );
    const projectPath = path.join(labsBaseDir, lab.id);

    try {
      // Check if project already exists
      if (fs.existsSync(projectPath)) {
        const choice = await vscode.window.showQuickPick(
          ["Open existing", "Delete and recreate"],
          { placeHolder: "Project already exists" }
        );

        if (choice === "Delete and recreate") {
          fs.rmSync(projectPath, { recursive: true, force: true });
        } else {
          // Open existing project
          await vscode.commands.executeCommand(
            "vscode.openFolder",
            vscode.Uri.file(projectPath)
          );
          return true;
        }
      }

      // Create project directory
      fs.mkdirSync(projectPath, { recursive: true });

      // Copy starter files
      const starterPath = path.join(lab.path, "starter");
      if (fs.existsSync(starterPath)) {
        await this.copyDirectory(starterPath, projectPath);
      }

      // Create .canvas/session.json
      const canvasDir = path.join(projectPath, ".canvas");
      fs.mkdirSync(canvasDir, { recursive: true });

      const session: SessionConfig = {
        session_id: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        lab_id: lab.id,
        started_at: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(canvasDir, "session.json"),
        JSON.stringify(session, null, 2)
      );

      // Create /tmp/canvas-{lab-id} directory
      const logDir = `/tmp/canvas-${lab.id}`;
      fs.mkdirSync(logDir, { recursive: true });

      // Create virtual environment and install dependencies
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Setting up Python environment...",
        },
        async () => {
          try {
            // Create venv using python3
            await execFileAsync("python3", ["-m", "venv", ".venv"], {
              cwd: projectPath,
            });

            // Install dependencies if requirements.txt exists
            const reqFile = path.join(projectPath, "requirements.txt");
            if (fs.existsSync(reqFile)) {
              const venvPython = path.join(projectPath, ".venv/bin/python");
              await execFileAsync(venvPython, ["-m", "pip", "install", "-q", "-r", "requirements.txt"], {
                cwd: projectPath,
              });
            }
          } catch (error) {
            throw new Error(`Failed to setup Python environment: ${error}`);
          }
        }
      );

      // Open in VS Code
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(projectPath)
      );

      vscode.window.showInformationMessage(
        `Canvas lab created: ${lab.title}`
      );

      return true;
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create lab: ${error}`
      );
      return false;
    }
  }

  /**
   * Recursively copy directory
   */
  private async copyDirectory(src: string, dst: string): Promise<void> {
    fs.mkdirSync(dst, { recursive: true });
    const entries = fs.readdirSync(src);

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const dstPath = path.join(dst, entry);
      const stat = fs.statSync(srcPath);

      if (stat.isDirectory()) {
        await this.copyDirectory(srcPath, dstPath);
      } else {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }
}

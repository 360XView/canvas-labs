import * as vscode from "vscode";
import { AuthManager } from "./authManager";
import { LabManager } from "./labManager";
import { FileWatcher } from "./fileWatcher";
import { TestRunner } from "./testRunner";
import { SubmissionWriter } from "./submissionWriter";

let authManager: AuthManager;
let labManager: LabManager;
let fileWatcher: FileWatcher | null = null;
let testRunner: TestRunner | null = null;
let submissionWriter: SubmissionWriter | null = null;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Canvas Python Labs extension activated');

  // Initialize managers
  authManager = new AuthManager();
  labManager = new LabManager();

  // Check authentication on startup
  if (!authManager.isAuthenticated()) {
    const authenticated = await authManager.promptForAuth();
    if (!authenticated) {
      vscode.window.showWarningMessage(
        "Canvas authentication required to use this extension"
      );
      return;
    }
  }

  // Get the workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  // If we're in a Canvas lab workspace, set up file watching
  if (workspaceFolder) {
    const canvasDir = vscode.Uri.joinPath(workspaceFolder.uri, ".canvas", "session.json");
    if (await fileExists(canvasDir)) {
      // Extract lab ID from workspace folder name
      const labId = workspaceFolder.name;
      setupFileWatching(labId, context);
    }
  }

  // Register the "Create Python Lab" command
  const createLabCmd = vscode.commands.registerCommand(
    "canvas.createLab",
    async () => {
      // Get list of available labs
      const labs = await labManager.discoverLabs();

      if (labs.length === 0) {
        vscode.window.showErrorMessage(
          "No Python labs found. Check your Canvas installation."
        );
        return;
      }

      // Show quick pick
      const selected = await vscode.window.showQuickPick(
        labs.map((lab) => ({
          label: lab.title,
          description: lab.description,
          detail: `ID: ${lab.id}`,
          lab,
        })),
        { placeHolder: "Select a lab to start" }
      );

      if (!selected) {
        return;
      }

      // Create the lab
      const studentId = authManager.getStudentId() || "unknown";
      const success = await labManager.createLab(selected.lab, studentId);

      if (success) {
        // Set up file watching after a brief delay to let VS Code open the folder
        setTimeout(() => {
          setupFileWatching(selected.lab.id, context);
        }, 2000);
      }
    }
  );

  context.subscriptions.push(createLabCmd);

  vscode.window.showInformationMessage("Canvas Python Labs ready");
}

/**
 * Set up file watching for a lab workspace
 */
function setupFileWatching(
  projectPathOrLabId: string,
  context: vscode.ExtensionContext
): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const projectPath = workspaceFolder.uri.fsPath;
  const labId = projectPathOrLabId;

  // Initialize test runner and submission writer
  testRunner = new TestRunner();
  submissionWriter = new SubmissionWriter(labId);

  // Start file watching
  fileWatcher = new FileWatcher();
  const watcher = fileWatcher.watch(projectPath, testRunner, submissionWriter, labId);

  context.subscriptions.push(watcher);

  console.log(`File watching started for lab: ${labId}`);
}

/**
 * Check if a file exists
 */
async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  if (fileWatcher) {
    fileWatcher.stop();
  }
  console.log('Canvas Python Labs extension deactivated');
}

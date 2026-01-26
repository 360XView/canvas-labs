// Mock Environment
// In-memory simulation of lab environment for fast testing without Docker

import type { Module, Step } from "../../canvases/vta/types";
import type { StudentAction, ActionResult, LabState } from "../types";
import type { TelemetryEvent, LabType } from "../../lab/telemetry/types";
import { getValidationRules, validateCommand } from "../../lab/validation-rules";
import { createEventLogger, type EventLogger } from "../../lab/telemetry/event-logger";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ============================================================================
// SIMULATED FILESYSTEM
// ============================================================================

interface FileSystemNode {
  type: "file" | "directory";
  permissions: number; // octal, e.g., 0o750
  owner: string;
  group: string;
  content?: string;
}

interface SimulatedFileSystem {
  nodes: Map<string, FileSystemNode>;
}

// ============================================================================
// SIMULATED USERS & GROUPS
// ============================================================================

interface SimulatedUser {
  username: string;
  uid: number;
  gid: number;
  homeDir: string;
  groups: string[];
}

interface SimulatedGroup {
  name: string;
  gid: number;
  members: string[];
}

// ============================================================================
// MOCK ENVIRONMENT
// ============================================================================

export interface MockEnvironmentOptions {
  moduleId: string;
  studentId?: string;
  labType?: LabType;
  onLog?: (message: string) => void;
}

export interface MockEnvironment {
  // State access
  getState(): LabState;
  getEventLogger(): EventLogger;
  getEvents(): TelemetryEvent[];

  // Action execution
  executeAction(action: StudentAction): Promise<ActionResult>;

  // Lifecycle
  initialize(module: Module): Promise<void>;
  dispose(): void;

  // State inspection (for testing)
  getCurrentUser(): string;
  userExists(username: string): boolean;
  getFilePermissions(path: string): number | null;
  isUserInGroup(username: string, groupName: string): boolean;
}

export function createMockEnvironment(options: MockEnvironmentOptions): MockEnvironment {
  const { moduleId, studentId = "test-student", labType = "linux_cli", onLog } = options;

  // State
  let currentUser = "student";
  let cwd = "/home/student";
  let module: Module | null = null;
  let sessionId: string | null = null;
  let tempDir: string | null = null;
  let eventLogger: EventLogger | null = null;

  // Simulated system
  const users = new Map<string, SimulatedUser>();
  const groups = new Map<string, SimulatedGroup>();
  const fs: SimulatedFileSystem = { nodes: new Map() };

  // Completed steps tracking
  const completedSteps = new Set<string>();

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function initializeDefaultState() {
    // Create default users
    users.set("root", {
      username: "root",
      uid: 0,
      gid: 0,
      homeDir: "/root",
      groups: ["root"],
    });

    users.set("student", {
      username: "student",
      uid: 1000,
      gid: 1000,
      homeDir: "/home/student",
      groups: ["student"],
    });

    // Create default groups
    groups.set("root", { name: "root", gid: 0, members: ["root"] });
    groups.set("student", { name: "student", gid: 1000, members: ["student"] });
    groups.set("developers", { name: "developers", gid: 1001, members: [] });

    // Create default directories
    fs.nodes.set("/", { type: "directory", permissions: 0o755, owner: "root", group: "root" });
    fs.nodes.set("/home", { type: "directory", permissions: 0o755, owner: "root", group: "root" });
    fs.nodes.set("/home/student", { type: "directory", permissions: 0o755, owner: "student", group: "student" });
    fs.nodes.set("/root", { type: "directory", permissions: 0o700, owner: "root", group: "root" });
  }

  // ============================================================================
  // COMMAND SIMULATION
  // ============================================================================

  function simulateCommand(command: string): { exitCode: number; output: string } {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    // Log command
    onLog?.(`[mock] Executing: ${command} (user: ${currentUser})`);

    switch (cmd) {
      case "sudo":
        return handleSudo(args);
      case "su":
        return handleSu(args);
      case "useradd":
        return handleUseradd(args);
      case "usermod":
        return handleUsermod(args);
      case "chmod":
        return handleChmod(args);
      case "whoami":
        return { exitCode: 0, output: currentUser };
      case "id":
        return handleId(args);
      case "pwd":
        return { exitCode: 0, output: cwd };
      case "cd":
        return handleCd(args);
      case "ls":
        return handleLs(args);
      case "cat":
        return handleCat(args);
      case "echo":
        return { exitCode: 0, output: args.join(" ") };
      default:
        // Unknown command - simulate success for non-destructive commands
        return { exitCode: 0, output: "" };
    }
  }

  function handleSudo(args: string[]): { exitCode: number; output: string } {
    if (args.length === 0) {
      return { exitCode: 1, output: "sudo: no command specified" };
    }

    // Simulate sudo execution
    const previousUser = currentUser;
    currentUser = "root";

    // Execute the sub-command
    const subCommand = args.join(" ");
    const result = simulateCommand(subCommand);

    // For 'sudo su', we stay as root
    if (!(args[0] === "su" || args[0] === "-i")) {
      currentUser = previousUser;
    }

    return result;
  }

  function handleSu(args: string[]): { exitCode: number; output: string } {
    // Default to root if no user specified
    let targetUser = "root";

    // Handle flags and user argument
    for (const arg of args) {
      if (arg === "-" || arg === "-l" || arg === "--login") {
        continue; // Login shell flag, ignored in simulation
      }
      if (!arg.startsWith("-")) {
        targetUser = arg;
        break;
      }
    }

    if (!users.has(targetUser)) {
      return { exitCode: 1, output: `su: user ${targetUser} does not exist` };
    }

    currentUser = targetUser;
    const user = users.get(targetUser)!;
    cwd = user.homeDir;

    return { exitCode: 0, output: "" };
  }

  function handleUseradd(args: string[]): { exitCode: number; output: string } {
    if (currentUser !== "root") {
      return { exitCode: 1, output: "useradd: Permission denied" };
    }

    let createHome = false;
    let username = "";

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "-m" || arg === "--create-home") {
        createHome = true;
      } else if (!arg.startsWith("-")) {
        username = arg;
      }
    }

    if (!username) {
      return { exitCode: 1, output: "useradd: no username specified" };
    }

    if (users.has(username)) {
      return { exitCode: 9, output: `useradd: user '${username}' already exists` };
    }

    // Create the user
    const uid = 1000 + users.size;
    const gid = uid;
    const homeDir = `/home/${username}`;

    users.set(username, {
      username,
      uid,
      gid,
      homeDir,
      groups: [username],
    });

    // Create user's primary group
    groups.set(username, { name: username, gid, members: [username] });

    // Create home directory if requested
    if (createHome) {
      fs.nodes.set(homeDir, {
        type: "directory",
        permissions: 0o755,
        owner: username,
        group: username,
      });
    }

    return { exitCode: 0, output: "" };
  }

  function handleUsermod(args: string[]): { exitCode: number; output: string } {
    if (currentUser !== "root") {
      return { exitCode: 1, output: "usermod: Permission denied" };
    }

    let appendGroups = false;
    let newGroups: string[] = [];
    let username = "";

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "-a" || arg === "--append") {
        appendGroups = true;
      } else if (arg === "-G" || arg === "--groups") {
        if (i + 1 < args.length) {
          newGroups = args[i + 1].split(",");
          i++;
        }
      } else if (arg === "-aG") {
        // Combined flag
        appendGroups = true;
        if (i + 1 < args.length) {
          newGroups = args[i + 1].split(",");
          i++;
        }
      } else if (!arg.startsWith("-")) {
        username = arg;
      }
    }

    if (!username) {
      return { exitCode: 1, output: "usermod: no username specified" };
    }

    if (!users.has(username)) {
      return { exitCode: 6, output: `usermod: user '${username}' does not exist` };
    }

    const user = users.get(username)!;

    // Add user to new groups
    for (const groupName of newGroups) {
      if (!groups.has(groupName)) {
        return { exitCode: 6, output: `usermod: group '${groupName}' does not exist` };
      }

      const group = groups.get(groupName)!;
      if (!group.members.includes(username)) {
        group.members.push(username);
      }
      if (!user.groups.includes(groupName)) {
        user.groups.push(groupName);
      }
    }

    return { exitCode: 0, output: "" };
  }

  function handleChmod(args: string[]): { exitCode: number; output: string } {
    if (args.length < 2) {
      return { exitCode: 1, output: "chmod: missing operand" };
    }

    const mode = args[0];
    const path = args[1];

    // Parse numeric mode
    const numericMode = parseInt(mode, 8);
    if (isNaN(numericMode)) {
      return { exitCode: 1, output: `chmod: invalid mode: '${mode}'` };
    }

    const node = fs.nodes.get(path);
    if (!node) {
      return { exitCode: 1, output: `chmod: cannot access '${path}': No such file or directory` };
    }

    // Check permissions (only root or owner can chmod)
    if (currentUser !== "root" && node.owner !== currentUser) {
      return { exitCode: 1, output: "chmod: Operation not permitted" };
    }

    node.permissions = numericMode;

    return { exitCode: 0, output: "" };
  }

  function handleId(args: string[]): { exitCode: number; output: string } {
    const targetUser = args[0] || currentUser;
    const user = users.get(targetUser);

    if (!user) {
      return { exitCode: 1, output: `id: '${targetUser}': no such user` };
    }

    const groupsList = user.groups
      .map((g) => {
        const grp = groups.get(g);
        return grp ? `${grp.gid}(${g})` : g;
      })
      .join(",");

    return {
      exitCode: 0,
      output: `uid=${user.uid}(${user.username}) gid=${user.gid}(${user.username}) groups=${groupsList}`,
    };
  }

  function handleCd(args: string[]): { exitCode: number; output: string } {
    const target = args[0] || users.get(currentUser)?.homeDir || "/";
    const resolvedPath = resolvePath(target);

    const node = fs.nodes.get(resolvedPath);
    if (!node) {
      return { exitCode: 1, output: `cd: ${target}: No such file or directory` };
    }
    if (node.type !== "directory") {
      return { exitCode: 1, output: `cd: ${target}: Not a directory` };
    }

    cwd = resolvedPath;
    return { exitCode: 0, output: "" };
  }

  function handleLs(args: string[]): { exitCode: number; output: string } {
    const target = args.find((a) => !a.startsWith("-")) || cwd;
    const resolvedPath = resolvePath(target);

    const entries: string[] = [];
    const prefix = resolvedPath === "/" ? "/" : resolvedPath + "/";

    for (const [path] of fs.nodes) {
      if (path.startsWith(prefix) && path !== resolvedPath) {
        const relativePath = path.slice(prefix.length);
        if (!relativePath.includes("/")) {
          entries.push(relativePath);
        }
      }
    }

    return { exitCode: 0, output: entries.join("\n") };
  }

  function handleCat(args: string[]): { exitCode: number; output: string } {
    if (args.length === 0) {
      return { exitCode: 1, output: "cat: missing operand" };
    }

    const path = resolvePath(args[0]);
    const node = fs.nodes.get(path);

    if (!node) {
      return { exitCode: 1, output: `cat: ${args[0]}: No such file or directory` };
    }
    if (node.type !== "file") {
      return { exitCode: 1, output: `cat: ${args[0]}: Is a directory` };
    }

    return { exitCode: 0, output: node.content || "" };
  }

  function resolvePath(path: string): string {
    if (path.startsWith("/")) {
      return path;
    }
    if (path.startsWith("~")) {
      const user = users.get(currentUser);
      return user ? path.replace("~", user.homeDir) : path;
    }
    return join(cwd, path);
  }

  // ============================================================================
  // CHECK SIMULATION
  // ============================================================================

  function simulateCheckScript(stepId: string): boolean {
    // Simulate check scripts based on step ID
    switch (stepId) {
      case "become-root":
        return currentUser === "root";

      case "create-user":
        return users.has("devuser") && fs.nodes.has("/home/devuser");

      case "set-permissions": {
        const node = fs.nodes.get("/home/devuser");
        return node !== undefined && node.permissions === 0o750;
      }

      case "add-to-group": {
        const user = users.get("devuser");
        return user !== undefined && user.groups.includes("developers");
      }

      default:
        return false;
    }
  }

  // ============================================================================
  // ACTION EXECUTION
  // ============================================================================

  async function executeAction(action: StudentAction): Promise<ActionResult> {
    const timestamp = new Date().toISOString();

    switch (action.type) {
      case "command": {
        const { exitCode, output } = simulateCommand(action.command);
        const success = exitCode === 0;

        // Log command to telemetry
        eventLogger?.logCommand(action.command, exitCode, cwd);

        // Validate command against rules
        const rules = getValidationRules(moduleId);
        const validationResult = validateCommand(
          { timestamp, user: currentUser, pwd: cwd, command: action.command, exitCode },
          rules
        );

        const completedFromCommand: string[] = [];
        if (validationResult) {
          completedFromCommand.push(validationResult.stepId);
        }

        // Also check if any check scripts pass
        const passedChecks: string[] = [];
        const stepIds = module?.steps.map((s) => s.id) || [];

        for (const stepId of stepIds) {
          if (!completedSteps.has(stepId) && simulateCheckScript(stepId)) {
            passedChecks.push(stepId);
            completedSteps.add(stepId);

            // Log check passed
            eventLogger?.logCheckPassed(stepId, "command");
            eventLogger?.logStepCompleted(stepId, "command");
          }
        }

        return {
          action,
          success,
          exitCode,
          output,
          timestamp,
          completedSteps: [...completedFromCommand, ...passedChecks],
          passedChecks,
        };
      }

      case "hint": {
        const step = module?.steps.find((s) => s.id === action.stepId);
        const totalHints = step?.content.hints?.length || 0;

        eventLogger?.logHintRequested(action.stepId, action.hintIndex, totalHints);

        return {
          action,
          success: true,
          timestamp,
        };
      }

      case "solution": {
        eventLogger?.logSolutionViewed(action.stepId);

        return {
          action,
          success: true,
          timestamp,
        };
      }

      case "wait": {
        // Just wait
        await new Promise((resolve) => setTimeout(resolve, action.durationMs));
        return {
          action,
          success: true,
          timestamp,
        };
      }

      case "question": {
        const step = module?.steps.find((s) => s.id === action.stepId);
        const question = step?.content.question;

        if (!question) {
          return {
            action,
            success: false,
            error: "No question found for step",
            timestamp,
          };
        }

        // Check if answer is correct
        const correctOptions = question.options
          .filter((o) => o.correct)
          .map((o) => o.id);

        const isCorrect =
          action.selectedOptions.length === correctOptions.length &&
          action.selectedOptions.every((opt) => correctOptions.includes(opt));

        eventLogger?.logQuestionAnswered(
          action.stepId,
          isCorrect,
          action.selectedOptions,
          correctOptions,
          1 // attempt number
        );

        if (isCorrect && !completedSteps.has(action.stepId)) {
          completedSteps.add(action.stepId);
          eventLogger?.logStepCompleted(action.stepId, "question");
        }

        return {
          action,
          success: true,
          timestamp,
          completedSteps: isCorrect ? [action.stepId] : [],
        };
      }

      default:
        return {
          action,
          success: false,
          error: `Unknown action type: ${(action as StudentAction).type}`,
          timestamp,
        };
    }
  }

  // ============================================================================
  // PUBLIC INTERFACE
  // ============================================================================

  return {
    async initialize(mod: Module) {
      module = mod;
      initializeDefaultState();

      // Create temp directory for telemetry
      tempDir = mkdtempSync(join(tmpdir(), "test-harness-"));

      // Create event logger
      eventLogger = createEventLogger({
        logDir: tempDir,
        moduleId,
        studentId,
        labType,
        onLog,
      });

      // Start session
      eventLogger.startSession(1);
      sessionId = eventLogger.getSessionId();

      onLog?.(`[mock] Initialized mock environment for module: ${moduleId}`);
    },

    dispose() {
      if (eventLogger) {
        eventLogger.endSession("completed", 0);
      }
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true });
      }
    },

    executeAction,

    getState(): LabState {
      if (!module || !sessionId) {
        throw new Error("Environment not initialized");
      }

      return {
        moduleId,
        labType,
        sessionId,
        studentId,
        currentUser,
        currentWorkingDirectory: cwd,
        environment: {},
        currentStepIndex: 0,
        completedSteps: Array.from(completedSteps),
        events: eventLogger?.getEvents() || [],
        module,
        stepIds: module.steps.map((s) => s.id),
      };
    },

    getEventLogger(): EventLogger {
      if (!eventLogger) {
        throw new Error("Environment not initialized");
      }
      return eventLogger;
    },

    getEvents(): TelemetryEvent[] {
      return eventLogger?.getEvents() || [];
    },

    getCurrentUser(): string {
      return currentUser;
    },

    userExists(username: string): boolean {
      return users.has(username);
    },

    getFilePermissions(path: string): number | null {
      const node = fs.nodes.get(path);
      return node ? node.permissions : null;
    },

    isUserInGroup(username: string, groupName: string): boolean {
      const user = users.get(username);
      return user ? user.groups.includes(groupName) : false;
    },
  };
}

// Workspace Manager for Role-Based Claude Code Contexts
// Manages workspaces for different Claude Code roles: mentor, admin, tutor, developer

import { homedir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { TUTOR_BASE_DIR } from "./defaults";

// Role types
export type Role = "mentor" | "admin" | "tutor" | "developer";

// Context passed to prompt generators
export interface RoleContext {
  // Common context
  profileId?: string;

  // Mentor context
  skills?: {
    mastered: string[];
    inProgress: string[];
    notStarted: string[];
  };
  recommendedLabs?: string[];

  // Admin context
  allProfiles?: Array<{
    id: string;
    name: string;
    labsCompleted: number;
    lastActive: string;
  }>;

  // Tutor context
  moduleId?: string;
  logDir?: string;

  // Developer context
  labBeingEdited?: string;
  labStatus?: "draft" | "published";
}

// Workspace configuration
export interface WorkspaceConfig {
  role: Role;
  workspaceDir: string;
  contextGenerator: (context: RoleContext) => string;
}

// Workspace base directories
const WORKSPACES_DIR = join(TUTOR_BASE_DIR, "workspaces");

/**
 * Get the workspace directory for a specific role
 */
export function getWorkspaceDir(role: Role): string {
  return join(WORKSPACES_DIR, role);
}

/**
 * Ensure workspace directory exists
 */
export function ensureWorkspaceDir(role: Role): string {
  const workspaceDir = getWorkspaceDir(role);
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  return workspaceDir;
}

/**
 * Set up a workspace by creating the directory and writing CLAUDE.md
 * Returns the workspace directory path
 */
export function setupWorkspace(
  role: Role,
  context: RoleContext,
  generator: (context: RoleContext) => string
): string {
  const workspaceDir = ensureWorkspaceDir(role);

  // Generate and write CLAUDE.md
  const claudeMdPath = join(workspaceDir, "CLAUDE.md");
  const content = generator(context);
  writeFileSync(claudeMdPath, content);

  return workspaceDir;
}

/**
 * Get the CLAUDE.md path for a role workspace
 */
export function getClaudeMdPath(role: Role): string {
  return join(getWorkspaceDir(role), "CLAUDE.md");
}

/**
 * Check if a workspace exists and has a CLAUDE.md
 */
export function workspaceExists(role: Role): boolean {
  const claudeMdPath = getClaudeMdPath(role);
  return existsSync(claudeMdPath);
}

/**
 * Role descriptions for documentation
 */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  mentor: "Learning advisor who assesses skills and recommends labs",
  admin: "System administrator who manages profiles, labs, and configuration",
  tutor: "In-lab assistant who provides hints, encouragement, and guidance",
  developer: "Lab content creator who generates modules, scripts, and tests",
};

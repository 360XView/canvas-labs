// Lab Launcher Canvas - Type Definitions

// Launcher mode: user (learning) or developer (content creation)
export type LauncherMode = "user" | "developer";

export interface LabInfo {
  id: string;
  title: string;
  description?: string;
  stepCount: number;
  taskCount: number;
  status?: "draft" | "published";  // For dev mode
  author?: string;                  // For dev mode
  modified?: string;                // For dev mode (ISO date)
}

export interface LabLauncherConfig {
  title?: string;
  labs?: LabInfo[]; // Optional pre-loaded labs, otherwise loads from module-loader
  mode?: LauncherMode;  // Initial mode (default: "user")
}

export interface LabLauncherResult {
  action: "launch" | "edit" | "new";
  selectedLab?: LabInfo;  // Optional for "new" action
  mode: LauncherMode;
}

// Lab launcher color palette
export const LAB_COLORS = {
  primary: "cyan",           // Primary accent, selected items
  secondary: "magenta",      // Secondary accent, headers
  success: "green",          // Success states
  warning: "yellow",         // Warnings, prerequisites
  error: "red",              // Errors
  dim: "gray",               // Inactive/muted text
  text: "white",             // Normal text
} as const;

// Focus mode for keyboard navigation
export type FocusMode = "list" | "profiles";

// Profile with stats for display
export interface ProfileWithStats {
  profile: import("../../tutor/types").Profile;
  progress: import("../../tutor/types").Progress | null;
}

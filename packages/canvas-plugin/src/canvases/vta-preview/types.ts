// VTA Preview Canvas Types
// Read-only preview for lab editing

export interface VTAPreviewConfig {
  moduleId: string;
  modulePath?: string;  // Path to module.yaml (for drafts)
}

export interface VTAPreviewResult {
  action: "test" | "save" | "quit";
  moduleId: string;
}

// Color palette for VTA Preview (slightly different to indicate edit mode)
export const PREVIEW_COLORS = {
  primary: "yellow",      // Yellow to indicate edit/preview mode
  secondary: "blue",
  success: "green",
  warning: "yellow",
  error: "red",
  muted: "gray",
  highlight: "magenta",
  bg: "black",
} as const;

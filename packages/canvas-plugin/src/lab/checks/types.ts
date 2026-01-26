// Check result types for result-based lab validation
// Check scripts write these entries to checks.log when conditions are met

export interface CheckLogEntry {
  stepId: string;
  status: "passed" | "failed" | "error";
  timestamp: string;
  taskIndex?: number;
  message?: string;
}

export interface CheckConfig {
  stepId: string;
  script: string;
  pollIntervalMs?: number; // Default: 2000
  description?: string;
}

// Parse a JSON line from checks.log
export function parseCheckLogEntry(line: string): CheckLogEntry | null {
  try {
    const entry = JSON.parse(line) as CheckLogEntry;
    // Validate required fields
    if (
      typeof entry.stepId === "string" &&
      (entry.status === "passed" || entry.status === "failed" || entry.status === "error") &&
      typeof entry.timestamp === "string"
    ) {
      return entry;
    }
    return null;
  } catch {
    return null;
  }
}

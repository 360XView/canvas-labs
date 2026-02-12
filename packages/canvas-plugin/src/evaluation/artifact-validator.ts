// Artifact validator for evaluation scenario runs
// Checks that a log directory contains the expected output files

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { EXPECTED_ARTIFACTS } from "./types";

export interface ArtifactValidationResult {
  valid: boolean;
  missing: string[];
  empty: string[];
  telemetryEventTypes: string[];
  telemetryEventCount: number;
  stateStepCount: number;
}

export function validateArtifacts(logDir: string): ArtifactValidationResult {
  const missing: string[] = [];
  const empty: string[] = [];
  let telemetryEventTypes: string[] = [];
  let telemetryEventCount = 0;
  let stateStepCount = 0;

  for (const artifact of EXPECTED_ARTIFACTS) {
    const path = join(logDir, artifact);
    if (!existsSync(path)) {
      missing.push(artifact);
      continue;
    }
    const stat = statSync(path);
    // checks.log can legitimately be empty
    if (stat.size === 0 && artifact !== "checks.log") {
      empty.push(artifact);
    }
  }

  // Parse telemetry for event type validation
  const telemetryPath = join(logDir, "telemetry.jsonl");
  if (existsSync(telemetryPath)) {
    const content = readFileSync(telemetryPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim());
    telemetryEventCount = lines.length;
    const types = new Set<string>();
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.event_type) types.add(event.event_type);
      } catch {}
    }
    telemetryEventTypes = [...types];
  }

  // Parse state.json
  const statePath = join(logDir, "state.json");
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf-8"));
      stateStepCount = state.steps?.length ?? 0;
    } catch {}
  }

  return {
    valid: missing.length === 0 && empty.length === 0,
    missing,
    empty,
    telemetryEventTypes,
    telemetryEventCount,
    stateStepCount,
  };
}

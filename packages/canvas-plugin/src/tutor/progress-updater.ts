// Progress Updater - Background process that tracks lab progress for a profile
// Usage: bun run src/tutor/progress-updater.ts <logs-dir> <profile-id> <module-id>

import { watch, existsSync, statSync, readFileSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import type { Progress, LabAttempt, StepProgress, Mistake } from "./types";
import { getProgress, saveProgress, touchProfile } from "./profile-manager";
import { loadModule } from "../lab/module-loader";

interface UpdaterState {
  commandsSize: number;
  checksSize: number;
  attemptId: string;
  startedAt: string;
  stepsCompleted: Set<string>;
  hintsUsed: number;
  stepTimers: Map<string, number>; // stepId -> start timestamp
}

// Get CLI arguments
const logsDir = process.argv[2];
const profileId = process.argv[3];
const moduleId = process.argv[4];

if (!logsDir || !profileId || !moduleId) {
  console.error("Usage: bun run progress-updater.ts <logs-dir> <profile-id> <module-id>");
  process.exit(1);
}

const commandsLog = `${logsDir}/commands.log`;
const checksLog = `${logsDir}/checks.log`;

// Generate UUID for this attempt
function generateAttemptId(): string {
  // Simple UUID v4 implementation if uuid package not available
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const state: UpdaterState = {
  commandsSize: 0,
  checksSize: 0,
  attemptId: generateAttemptId(),
  startedAt: new Date().toISOString(),
  stepsCompleted: new Set(),
  hintsUsed: 0,
  stepTimers: new Map(),
};

// Get or create current attempt in progress
function getOrCreateAttempt(progress: Progress): LabAttempt {
  if (!progress.labs[moduleId]) {
    progress.labs[moduleId] = {
      status: "in_progress",
      attempts: [],
    };
  }

  const labProgress = progress.labs[moduleId];

  // Find or create current attempt
  let attempt = labProgress.attempts.find(a => a.id === state.attemptId);
  if (!attempt) {
    attempt = {
      id: state.attemptId,
      startedAt: state.startedAt,
      hintsUsed: 0,
      steps: {},
      mistakes: [],
    };
    labProgress.attempts.push(attempt);
    labProgress.status = "in_progress";
  }

  return attempt;
}

// Parse command log entries
interface CommandLogEntry {
  timestamp: string;
  user: string;
  pwd: string;
  command: string;
}

// Parse check log entries
interface CheckLogEntry {
  stepId: string;
  status: "passed" | "failed";
  timestamp: string;
  message?: string;
}

// Process new commands from log
function processCommands(): void {
  if (!existsSync(commandsLog)) return;

  const stats = statSync(commandsLog);
  if (stats.size <= state.commandsSize) return;

  const content = readFileSync(commandsLog, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());

  // Process all lines (we track completion via checksLog)
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as CommandLogEntry;
      // Commands are tracked but completion is determined by checks
      console.log(`[progress-updater] Command: ${entry.command}`);
    } catch {
      // Skip invalid JSON
    }
  }

  state.commandsSize = stats.size;
}

// Process check results and update progress
function processChecks(): void {
  if (!existsSync(checksLog)) return;

  const stats = statSync(checksLog);
  if (stats.size <= state.checksSize) return;

  const content = readFileSync(checksLog, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());

  let hasNewCompletions = false;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as CheckLogEntry;

      if (entry.status === "passed" && !state.stepsCompleted.has(entry.stepId)) {
        state.stepsCompleted.add(entry.stepId);
        hasNewCompletions = true;
        console.log(`[progress-updater] Step completed: ${entry.stepId}`);
      }
    } catch {
      // Skip invalid JSON
    }
  }

  state.checksSize = stats.size;

  if (hasNewCompletions) {
    updateProgress();
  }
}

// Update progress.json with current state
function updateProgress(): void {
  try {
    const progress = getProgress(profileId);
    if (!progress) {
      console.error(`[progress-updater] Profile ${profileId} not found`);
      return;
    }

    const attempt = getOrCreateAttempt(progress);
    const now = new Date();

    // Update step progress
    for (const stepId of state.stepsCompleted) {
      if (!attempt.steps[stepId]) {
        attempt.steps[stepId] = {
          status: "completed",
        };
      } else {
        attempt.steps[stepId].status = "completed";
      }
    }

    // Calculate total time
    const startTime = new Date(state.startedAt).getTime();
    attempt.totalTime = Math.floor((now.getTime() - startTime) / 1000);

    // Check if lab is completed (all task steps done)
    const module = loadModule(moduleId);
    const taskSteps = module.steps.filter(s => s.type === "task");
    const allTasksCompleted = taskSteps.every(s => state.stepsCompleted.has(s.id));

    if (allTasksCompleted) {
      attempt.completedAt = now.toISOString();
      progress.labs[moduleId].status = "completed";

      // Update best time
      const labProgress = progress.labs[moduleId];
      if (!labProgress.bestTime || attempt.totalTime < labProgress.bestTime) {
        labProgress.bestTime = attempt.totalTime;
        labProgress.bestAttemptId = attempt.id;
      }

      // Update aggregate stats
      progress.aggregate.totalLabsCompleted++;
      console.log(`[progress-updater] Lab completed in ${attempt.totalTime}s`);
    }

    // Update aggregate time
    progress.aggregate.totalTimeSpent += attempt.totalTime;

    // Save progress
    saveProgress(profileId, progress);
    touchProfile(profileId);

    console.log(`[progress-updater] Progress saved for ${profileId}`);
  } catch (error) {
    console.error(`[progress-updater] Error updating progress:`, error);
  }
}

// Start watching log files
function startWatching(): void {
  console.log(`[progress-updater] Watching ${logsDir}`);
  console.log(`[progress-updater] Profile: ${profileId}, Module: ${moduleId}`);
  console.log(`[progress-updater] Attempt ID: ${state.attemptId}`);

  // Initialize file sizes
  if (existsSync(commandsLog)) {
    state.commandsSize = statSync(commandsLog).size;
  }
  if (existsSync(checksLog)) {
    state.checksSize = statSync(checksLog).size;
  }

  // Create initial attempt record
  updateProgress();

  // Watch the logs directory
  watch(logsDir, { persistent: true }, (eventType, filename) => {
    if (filename === "commands.log") {
      processCommands();
    } else if (filename === "checks.log") {
      processChecks();
    }
  });
}

// Handle shutdown - save final progress
function shutdown(): void {
  console.log("[progress-updater] Shutting down, saving final progress...");

  try {
    const progress = getProgress(profileId);
    if (progress && progress.labs[moduleId]) {
      const labProgress = progress.labs[moduleId];
      const attempt = labProgress.attempts[labProgress.attempts.length - 1];

      if (attempt && !attempt.completedAt) {
        // Mark incomplete attempts with abandonedAt timestamp
        attempt.abandonedAt = new Date().toISOString();

        // Calculate final time for the abandoned attempt
        const startTime = new Date(attempt.startedAt).getTime();
        const now = new Date().getTime();
        attempt.totalTime = Math.floor((now - startTime) / 1000);

        console.log(`[progress-updater] Marking attempt ${attempt.id} as abandoned after ${attempt.totalTime}s`);
      }
    }
  } catch (error) {
    console.error(`[progress-updater] Error marking attempt as abandoned:`, error);
  }

  updateProgress();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start the watcher
startWatching();

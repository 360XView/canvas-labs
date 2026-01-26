// Tutor Profile System Defaults

import { homedir } from "os";
import { join } from "path";
import type { Profile, Progress, TutorConfig, AggregateStats } from "./types";

// Base directory for all tutor data
export const TUTOR_BASE_DIR = join(homedir(), ".claude", "tutor");
export const PROFILES_DIR = join(TUTOR_BASE_DIR, "profiles");
export const CONFIG_FILE = join(TUTOR_BASE_DIR, "config.json");
export const CURRENT_PROFILE_FILE = join(TUTOR_BASE_DIR, "current");

export const DEFAULT_PROFILE_ID = "default";

export function createDefaultConfig(): TutorConfig {
  return {
    version: "1.0",
    defaultProfile: DEFAULT_PROFILE_ID,
  };
}

export function createDefaultProfile(id: string, name?: string): Profile {
  const now = new Date().toISOString();
  return {
    version: "1.0",
    id,
    name: name || id,
    createdAt: now,
    lastActiveAt: now,
  };
}

export function createDefaultProgress(profileId: string): Progress {
  return {
    version: "1.0",
    profileId,
    labs: {},
    aggregate: createDefaultAggregateStats(),
  };
}

export function createDefaultAggregateStats(): AggregateStats {
  return {
    totalLabsCompleted: 0,
    totalTimeSpent: 0,
    totalHintsUsed: 0,
    totalAttempts: 0,
  };
}

export function getProfileDir(profileId: string): string {
  return join(PROFILES_DIR, profileId);
}

export function getProfileFile(profileId: string): string {
  return join(getProfileDir(profileId), "profile.json");
}

export function getProgressFile(profileId: string): string {
  return join(getProfileDir(profileId), "progress.json");
}

export function getWorkspaceDir(profileId: string): string {
  return join(getProfileDir(profileId), "workspace");
}

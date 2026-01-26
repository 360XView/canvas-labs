// Tutor Profile Manager
// CRUD operations for profiles and progress tracking

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import type { Profile, Progress, TutorConfig } from "./types";
import {
  TUTOR_BASE_DIR,
  PROFILES_DIR,
  CONFIG_FILE,
  CURRENT_PROFILE_FILE,
  DEFAULT_PROFILE_ID,
  createDefaultConfig,
  createDefaultProfile,
  createDefaultProgress,
  getProfileDir,
  getProfileFile,
  getProgressFile,
  getWorkspaceDir,
} from "./defaults";

// Initialize the tutor directory structure
export function initTutorDir(): void {
  if (!existsSync(TUTOR_BASE_DIR)) {
    mkdirSync(TUTOR_BASE_DIR, { recursive: true });
  }
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(createDefaultConfig(), null, 2));
  }
}

// Get the global tutor config
export function getConfig(): TutorConfig {
  initTutorDir();
  if (existsSync(CONFIG_FILE)) {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  }
  return createDefaultConfig();
}

// Save the global tutor config
export function saveConfig(config: TutorConfig): void {
  initTutorDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Get the current profile name
export function getCurrentProfileId(): string {
  initTutorDir();
  if (existsSync(CURRENT_PROFILE_FILE)) {
    const id = readFileSync(CURRENT_PROFILE_FILE, "utf-8").trim();
    if (id && profileExists(id)) {
      return id;
    }
  }
  // Fall back to config default
  const config = getConfig();
  return config.defaultProfile;
}

// Set the current profile
export function setCurrentProfile(profileId: string): void {
  if (!profileExists(profileId)) {
    throw new Error(`Profile '${profileId}' does not exist`);
  }
  initTutorDir();
  writeFileSync(CURRENT_PROFILE_FILE, profileId);
}

// Check if a profile exists
export function profileExists(profileId: string): boolean {
  return existsSync(getProfileFile(profileId));
}

// Create a new profile
export function createProfile(profileId: string, name?: string): Profile {
  if (profileExists(profileId)) {
    throw new Error(`Profile '${profileId}' already exists`);
  }

  initTutorDir();

  const profileDir = getProfileDir(profileId);
  const workspaceDir = getWorkspaceDir(profileId);

  // Create directories
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });

  // Create profile
  const profile = createDefaultProfile(profileId, name);
  writeFileSync(getProfileFile(profileId), JSON.stringify(profile, null, 2));

  // Create empty progress
  const progress = createDefaultProgress(profileId);
  writeFileSync(getProgressFile(profileId), JSON.stringify(progress, null, 2));

  return profile;
}

// Get a profile by ID
export function getProfile(profileId: string): Profile | null {
  const profileFile = getProfileFile(profileId);
  if (!existsSync(profileFile)) {
    return null;
  }
  return JSON.parse(readFileSync(profileFile, "utf-8"));
}

// Update a profile's lastActiveAt timestamp
export function touchProfile(profileId: string): void {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`Profile '${profileId}' does not exist`);
  }
  profile.lastActiveAt = new Date().toISOString();
  writeFileSync(getProfileFile(profileId), JSON.stringify(profile, null, 2));
}

// List all profiles
export function listProfiles(): Profile[] {
  initTutorDir();
  if (!existsSync(PROFILES_DIR)) {
    return [];
  }

  const entries = readdirSync(PROFILES_DIR, { withFileTypes: true });
  const profiles: Profile[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const profile = getProfile(entry.name);
      if (profile) {
        profiles.push(profile);
      }
    }
  }

  return profiles.sort((a, b) =>
    new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  );
}

// Get progress for a profile
export function getProgress(profileId: string): Progress | null {
  const progressFile = getProgressFile(profileId);
  if (!existsSync(progressFile)) {
    return null;
  }
  return JSON.parse(readFileSync(progressFile, "utf-8"));
}

// Save progress for a profile
export function saveProgress(profileId: string, progress: Progress): void {
  if (!profileExists(profileId)) {
    throw new Error(`Profile '${profileId}' does not exist`);
  }
  writeFileSync(getProgressFile(profileId), JSON.stringify(progress, null, 2));
}

// Ensure default profile exists
export function ensureDefaultProfile(): Profile {
  if (!profileExists(DEFAULT_PROFILE_ID)) {
    return createProfile(DEFAULT_PROFILE_ID, "Default User");
  }
  return getProfile(DEFAULT_PROFILE_ID)!;
}

// Get the current profile, creating default if needed
export function getCurrentProfile(): Profile {
  const profileId = getCurrentProfileId();

  // Ensure default profile exists if that's what we're using
  if (profileId === DEFAULT_PROFILE_ID && !profileExists(DEFAULT_PROFILE_ID)) {
    return ensureDefaultProfile();
  }

  const profile = getProfile(profileId);
  if (!profile) {
    // Fall back to default
    return ensureDefaultProfile();
  }

  return profile;
}

// Get progress for the current profile
export function getCurrentProgress(): Progress {
  const profile = getCurrentProfile();
  const progress = getProgress(profile.id);
  if (!progress) {
    const newProgress = createDefaultProgress(profile.id);
    saveProgress(profile.id, newProgress);
    return newProgress;
  }
  return progress;
}

// Format time duration in human-readable form
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Re-export getWorkspaceDir for external use
export { getWorkspaceDir } from "./defaults";

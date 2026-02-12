// Tutor Memory System
// Cross-session student observations stored as markdown files

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  cpSync,
} from "fs";
import { join } from "path";
import type { SkillState, SkillDefinition } from "../lab/skills/types";

/**
 * Create memory/ and memory/sessions/ directories if they don't exist.
 * Accepts a profile directory path (not a profile ID) so it works in tests with temp dirs.
 */
export function ensureMemoryDir(profileDir: string): void {
  const sessionsDir = join(profileDir, "memory", "sessions");
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
}

/**
 * Delete session files beyond the N most recent (by filename sort).
 * Only deletes .md files. Called at session start during CLAUDE.md generation.
 */
export function pruneOldSessions(profileDir: string, keep: number = 5): void {
  const sessionsDir = join(profileDir, "memory", "sessions");

  if (!existsSync(sessionsDir)) {
    return;
  }

  const files = readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length <= keep) {
    return;
  }

  const toDelete = files.slice(0, files.length - keep);
  for (const file of toDelete) {
    rmSync(join(sessionsDir, file));
  }
}

/**
 * Read MEMORY.md and latest session file, format as context for CLAUDE.md injection.
 * Accepts a profile directory path (not a profile ID) so it works in tests with temp dirs.
 */
export function generateMemoryContext(
  profileDir: string,
  skillData?: { states: Record<string, SkillState>; catalog: SkillDefinition[] }
): string {
  const memoryDir = join(profileDir, "memory");
  const sessionsDir = join(memoryDir, "sessions");
  const memoryMdPath = join(memoryDir, "MEMORY.md");

  // Read MEMORY.md
  let memoryContent: string;
  if (existsSync(memoryMdPath)) {
    memoryContent = readFileSync(memoryMdPath, "utf-8").trim();
  } else {
    memoryContent = "No prior memory — this is a new student.";
  }

  // Read most recent session file (by filename sort)
  let lastSessionContent: string;
  if (existsSync(sessionsDir)) {
    const sessionFiles = readdirSync(sessionsDir)
      .filter((f) => f.endsWith(".md"))
      .sort();

    if (sessionFiles.length > 0) {
      const latestFile = sessionFiles[sessionFiles.length - 1];
      lastSessionContent = readFileSync(
        join(sessionsDir, latestFile),
        "utf-8"
      ).trim();
    } else {
      lastSessionContent = "No previous sessions.";
    }
  } else {
    lastSessionContent = "No previous sessions.";
  }

  let skillSnapshot = "";
  if (skillData) {
    skillSnapshot = generateSkillSnapshot(skillData.states, skillData.catalog);
  }

  return `## Student Memory

${memoryContent}

### Last Session

${lastSessionContent}
${skillSnapshot ? "\n" + skillSnapshot + "\n" : ""}`;
}

/**
 * Generate a brief skill snapshot for the tutor's context.
 * Returns top 3 strengths, top 3 weaknesses, and unassessed skills.
 * Returns empty string if no skill data exists.
 */
export function generateSkillSnapshot(
  states: Record<string, SkillState>,
  catalog: SkillDefinition[]
): string {
  const entries = Object.values(states);
  if (entries.length === 0) {
    return "";
  }

  const nameMap = new Map(catalog.map((s) => [s.id, s.name]));

  // Sort by demonstrated confidence descending
  const sorted = [...entries].sort((a, b) => b.demonstrated - a.demonstrated);

  // Top 3 strengths (highest confidence)
  const strengths = sorted
    .slice(0, 3)
    .map((s) => `${nameMap.get(s.skill_id) || s.skill_id} (${s.current_level})`);

  // Top 3 weaknesses (lowest confidence)
  const weaknesses = [...sorted]
    .reverse()
    .slice(0, 3)
    .map((s) => `${nameMap.get(s.skill_id) || s.skill_id} (${s.current_level})`);

  // Unassessed skills
  const assessedIds = new Set(entries.map((s) => s.skill_id));
  const unassessed = catalog
    .filter((s) => !assessedIds.has(s.id))
    .map((s) => s.name);

  let snapshot = `### Skill Snapshot

**Strengths:** ${strengths.join(", ")}
**Weaknesses:** ${weaknesses.join(", ")}`;

  if (unassessed.length > 0) {
    snapshot += `\n**Not yet assessed:** ${unassessed.join(", ")}`;
  }

  return snapshot;
}

/**
 * Snapshot memory directory to a destination.
 * Copies the entire memory/ subdirectory from the profile dir.
 */
export function snapshotMemory(profileDir: string, destDir: string): void {
  const memoryDir = join(profileDir, "memory");
  const destMemoryDir = join(destDir, "memory");

  if (!existsSync(memoryDir)) {
    ensureMemoryDir(destDir);
    return;
  }

  cpSync(memoryDir, destMemoryDir, { recursive: true });
}

/**
 * Restore memory directory from a snapshot.
 * Replaces the existing memory/ dir in the profile with the snapshot.
 */
export function restoreMemory(sourceDir: string, profileDir: string): void {
  const sourceMemoryDir = join(sourceDir, "memory");
  const destMemoryDir = join(profileDir, "memory");

  // Remove existing memory
  if (existsSync(destMemoryDir)) {
    rmSync(destMemoryDir, { recursive: true, force: true });
  }

  if (existsSync(sourceMemoryDir)) {
    cpSync(sourceMemoryDir, destMemoryDir, { recursive: true });
  } else {
    ensureMemoryDir(profileDir);
  }
}

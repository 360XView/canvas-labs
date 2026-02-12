// Skill Store
// Persist and load student skill profiles as JSON files

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { StudentSkillProfile } from "./types";

/**
 * Save a student's skill profile to disk.
 * Creates the directory if it doesn't exist.
 */
export function saveStudentProfile(
  profile: StudentSkillProfile,
  baseDir: string
): void {
  if (!existsSync(baseDir)) {
    mkdirSync(baseDir, { recursive: true });
  }

  const filePath = join(baseDir, `${profile.student_id}-skills.json`);
  writeFileSync(filePath, JSON.stringify(profile, null, 2), "utf-8");
}

/**
 * Load a student's skill profile from disk.
 * Returns null if no profile exists.
 */
export function loadStudentProfile(
  studentId: string,
  baseDir: string
): StudentSkillProfile | null {
  const filePath = join(baseDir, `${studentId}-skills.json`);

  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as StudentSkillProfile;
}

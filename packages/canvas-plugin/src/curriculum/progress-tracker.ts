/**
 * Progress tracking for students in courses
 * Stores progress to ~/.canvas/progress-{studentId}.json (file-based, no database)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import * as os from "os";
import type { Course, CourseModule, StudentProgress, CourseProgress, ModuleProgress } from "./types";
import { getNextModuleInCourse } from "./course-loader";

// For testing: allow overriding HOME directory
let homeDirectory = process.env.HOME || os.homedir();

/**
 * TESTING ONLY: Override home directory (for tests)
 * @internal
 */
export function _setHomeDirectory(dir: string): void {
  homeDirectory = dir;
}

/**
 * Get the progress file path for a student
 */
function getProgressFilePath(studentId: string): string {
  const canvasDir = join(homeDirectory, ".canvas");
  return join(canvasDir, `progress-${studentId}.json`);
}

/**
 * Load student progress from file
 * Returns empty progress if file doesn't exist
 */
export function loadStudentProgress(studentId: string, courseId: string): StudentProgress {
  const filePath = getProgressFilePath(studentId);

  if (!existsSync(filePath)) {
    return {
      studentId,
      courseId,
      completedModules: [],
      currentModule: null,
      score: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content) as StudentProgress;
    // Filter to just the requested course (in case student has multiple courses)
    if (data.courseId === courseId) {
      return data;
    }
    // If requesting different course, warn and return empty
    console.warn(
      `[Progress Tracker] Course mismatch: student ${studentId} has progress for ` +
      `"${data.courseId}", but requested "${courseId}". Returning empty progress.`
    );
    return {
      studentId,
      courseId,
      completedModules: [],
      currentModule: null,
      score: 0,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    // If file is corrupted, return empty progress
    return {
      studentId,
      courseId,
      completedModules: [],
      currentModule: null,
      score: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save student progress to file
 * Creates ~/.canvas directory if needed
 */
export function saveStudentProgress(progress: StudentProgress): void {
  const filePath = getProgressFilePath(progress.studentId);
  const dir = join(homeDirectory, ".canvas");

  // Create directory if needed
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write progress file (overwrites previous)
  writeFileSync(filePath, JSON.stringify(progress, null, 2), "utf-8");
}

/**
 * Mark a module as completed for a student
 * Updates score, current module, and saves to file
 * Returns updated progress, or null if module not found in course
 */
export function markModuleComplete(
  studentId: string,
  moduleId: string,
  moduleScore: number,
  course: Course
): StudentProgress | null {
  // Validate moduleScore is in valid range [0, 1]
  if (typeof moduleScore !== 'number' || isNaN(moduleScore) || moduleScore < 0 || moduleScore > 1) {
    throw new Error(
      `Invalid moduleScore: must be a number between 0 and 1, got ${moduleScore}`
    );
  }

  // Verify module exists in course
  const module = course.modules.find(m => m.id === moduleId);
  if (!module) {
    return null;
  }

  // Load current progress
  const progress = loadStudentProgress(studentId, course.id);

  // Check if module was already completed
  const isNewModule = !progress.completedModules.includes(moduleId);

  if (!isNewModule) {
    // Module already completed - just return current progress unchanged
    return progress;
  }

  // Add module to completed list
  progress.completedModules.push(moduleId);

  // Calculate new average score
  // Average all module scores that have been completed
  const moduleCount = progress.completedModules.length;
  const newScore = (progress.score * (moduleCount - 1) + moduleScore) / moduleCount;
  progress.score = newScore;

  // Set next current module based on prerequisites
  const nextModule = getNextModuleInCourse(course, progress.completedModules);
  progress.currentModule = nextModule?.id || null;

  // Update timestamp
  progress.lastUpdated = new Date().toISOString();

  // Save to file
  saveStudentProgress(progress);

  return progress;
}

/**
 * Get overall course progress for a student
 * Aggregates completion status and scores
 */
export function getCourseProgress(studentId: string, course: Course): CourseProgress {
  const progress = loadStudentProgress(studentId, course.id);

  // Build module progress array
  const moduleProgress: ModuleProgress[] = course.modules.map(module => {
    const isCompleted = progress.completedModules.includes(module.id);
    const isCurrent = module.id === progress.currentModule;

    let status: "not_started" | "in_progress" | "completed";
    if (isCompleted) {
      status = "completed";
    } else if (isCurrent) {
      status = "in_progress";
    } else {
      status = "not_started";
    }

    return {
      moduleId: module.id,
      status,
      score: isCompleted ? progress.score : 0, // Use overall score for completed modules
      completedAt: isCompleted ? progress.lastUpdated : null,
    };
  });

  // Calculate overall progress percentage (0-100)
  const completedCount = progress.completedModules.length;
  const totalCount = course.modules.length;
  const overallProgress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return {
    courseId: course.id,
    moduleProgress,
    overallProgress,
    overallScore: progress.score,
  };
}

/**
 * Get list of completed module IDs for a student
 */
export function getCompletedModules(studentId: string): string[] {
  // Load from any progress file for this student
  const filePath = getProgressFilePath(studentId);

  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const data = JSON.parse(content) as StudentProgress;
    return data.completedModules;
  } catch (error) {
    return [];
  }
}

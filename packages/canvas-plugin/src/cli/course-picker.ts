/**
 * Course Picker TUI
 * Interactive course selection interface for students
 */

import * as readline from "readline";
import { listAllCourses, loadCourse, _clearCourseRegistry } from "../curriculum/course-loader";
import { loadStudentProgress } from "../curriculum/progress-tracker";
import { readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

export interface CoursePickerResult {
  courseId: string;
  startingModuleId: string;
}

/**
 * Get the base path for course files
 */
function getBasePath(): string {
  return resolve(new URL(import.meta.url).pathname, "../../..");
}

/**
 * Load all courses from the courses directory
 */
function loadAllCoursesFromDisk(): void {
  const basePath = getBasePath();
  const coursesDir = join(basePath, "courses");

  if (!existsSync(coursesDir)) {
    throw new Error(`Courses directory not found at ${coursesDir}`);
  }

  // Clear any existing courses
  _clearCourseRegistry();

  // Load all course.yaml files from subdirectories
  const courseIds = readdirSync(coursesDir);
  for (const courseId of courseIds) {
    const coursePath = join(coursesDir, courseId, "course.yaml");
    if (existsSync(coursePath)) {
      try {
        loadCourse(coursePath);
      } catch (error) {
        console.warn(`Failed to load course ${courseId}:`, error);
      }
    }
  }
}

export async function showCoursePicker(studentId: string): Promise<CoursePickerResult> {
  // Load all courses from disk
  loadAllCoursesFromDisk();

  const courses = listAllCourses();

  if (courses.length === 0) {
    throw new Error("No courses available. Load courses from YAML first.");
  }

  // Display course selection interface
  console.clear();
  console.log("═══════════════════════════════════════════════════════");
  console.log("   Canvas Lab System - Course Selection");
  console.log("═══════════════════════════════════════════════════════\n");

  // Display all courses with metadata
  for (let i = 0; i < courses.length; i++) {
    const course = courses[i];
    console.log(`[${i + 1}] ${course.metadata.title}`);
    console.log(`    ${course.metadata.description}`);
    console.log(
      `    Time: ${course.metadata.estimatedTotalTime} minutes | Modules: ${course.modules.length}`
    );
    console.log();
  }

  // Get user input
  const selectedIndex = await promptForSelection(courses.length);
  const selectedCourse = courses[selectedIndex];

  // Load student progress in this course
  const progress = loadStudentProgress(studentId, selectedCourse.id);

  // Find first available module (next uncompleted module)
  let startingModuleId: string | null = null;

  for (const module of selectedCourse.modules) {
    if (!progress.completedModules.includes(module.id)) {
      startingModuleId = module.id;
      break;
    }
  }

  if (!startingModuleId) {
    // All modules completed
    throw new Error(
      `Student has already completed all modules in "${selectedCourse.metadata.title}"`
    );
  }

  return {
    courseId: selectedCourse.id,
    startingModuleId,
  };
}

async function promptForSelection(courseCount: number): Promise<number> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Loop until valid selection
  while (true) {
    const answer = await new Promise<string>((resolve) => {
      rl.question(`\nSelect course (1-${courseCount}): `, (answer) => {
        resolve(answer);
      });
    });

    const selected = parseInt(answer, 10) - 1;

    if (selected >= 0 && selected < courseCount) {
      rl.close();
      return selected;
    }

    console.log("Invalid selection. Please try again.");
  }
}

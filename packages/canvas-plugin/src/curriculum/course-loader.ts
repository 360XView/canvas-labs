/**
 * Course loading and management
 * Handles YAML parsing and course lookup utilities
 */

import { readFileSync } from "fs";
import * as YAML from "js-yaml";
import type {
  Course,
  CourseModule,
  CourseMetadata,
} from "./types";

// In-memory registry of loaded courses
const courseRegistry: Map<string, Course> = new Map();
const moduleToCourseLookup: Map<string, string> = new Map(); // moduleId -> courseId

/**
 * Load a course from a YAML file
 * Registers it in the in-memory registry
 * @throws Error if YAML cannot be parsed or required fields are missing
 */
export function loadCourse(yamlPath: string): Course {
  let content: string;
  let data: Record<string, any>;

  // Load and parse file with error context
  try {
    content = readFileSync(yamlPath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to read course file ${yamlPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    data = YAML.load(content) as Record<string, any>;
  } catch (error) {
    throw new Error(
      `Failed to parse YAML in ${yamlPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!data || typeof data !== "object") {
    throw new Error(`Course file ${yamlPath} does not contain valid course data`);
  }

  // Parse course metadata
  const metadata: CourseMetadata = {
    title: data.title || "Untitled Course",
    description: data.description || "",
    estimatedTotalTime: data.estimatedTotalTime || 0,
    skillsGranted: Array.isArray(data.skillsGranted) ? data.skillsGranted : [],
  };

  // Parse modules - validate array
  if (!Array.isArray(data.modules)) {
    throw new Error(`Course file ${yamlPath} has invalid modules field (must be array)`);
  }

  const modules: CourseModule[] = data.modules.map((m: Record<string, any>, index: number) => {
    // CRITICAL: Validate module has required id field
    if (!m.id || typeof m.id !== "string") {
      throw new Error(
        `Module at index ${index} in ${yamlPath} is missing required 'id' field`
      );
    }

    // Validate labType is one of allowed values if specified
    const validLabTypes = ["linux_cli", "splunk", "python"];
    if (m.labType && !validLabTypes.includes(m.labType)) {
      throw new Error(
        `Module "${m.id}" has invalid labType "${m.labType}". Must be one of: ${validLabTypes.join(", ")}`
      );
    }

    return {
      id: m.id,
      title: m.title || "Untitled Module",
      labType: m.labType || "linux_cli",
      description: m.description || "",
      estimatedTime: m.estimatedTime || 0,
      prerequisites: Array.isArray(m.prerequisites) ? m.prerequisites : [],
    };
  });

  // Generate course ID from explicit id field or slugify title
  const courseId = data.id || slugify(data.title || "course");

  if (!courseId) {
    throw new Error(`Could not generate course ID from ${yamlPath}`);
  }

  // MODERATE: Warn if overwriting existing course
  if (courseRegistry.has(courseId)) {
    console.warn(
      `[Course Loader] Warning: Overwriting existing course with ID "${courseId}"`
    );
  }

  const course: Course = {
    id: courseId,
    modules,
    metadata,
  };

  // Register in registry
  courseRegistry.set(courseId, course);

  // Register module -> course lookup
  for (const module of modules) {
    moduleToCourseLookup.set(module.id, courseId);
  }

  return course;
}

/**
 * Get the next module for a student based on completed modules
 * Respects prerequisites
 */
export function getNextModuleInCourse(
  course: Course,
  completedModuleIds: string[]
): CourseModule | null {
  const completedSet = new Set(completedModuleIds);

  for (const module of course.modules) {
    // Skip if already completed
    if (completedSet.has(module.id)) {
      continue;
    }

    // Check if all prerequisites are met
    const prereqsMet = module.prerequisites.every(prereq => completedSet.has(prereq));

    if (prereqsMet) {
      return module;
    }
  }

  return null;
}

/**
 * Find the course that contains a given module ID
 */
export function getCourseByModuleId(moduleId: string): Course | null {
  const courseId = moduleToCourseLookup.get(moduleId);
  if (!courseId) {
    return null;
  }

  return courseRegistry.get(courseId) || null;
}

/**
 * Get all loaded courses
 */
export function listAllCourses(): Course[] {
  return Array.from(courseRegistry.values());
}

/**
 * TESTING ONLY: Clear all loaded courses from registry
 * Use this in tests to avoid state leakage between test runs
 * @internal
 */
export function _clearCourseRegistry(): void {
  courseRegistry.clear();
  moduleToCourseLookup.clear();
}

/**
 * Slugify a string for use as a course ID
 * Converts to lowercase, replaces spaces with hyphens, removes special chars
 */
function slugify(text: string): string {
  if (!text || typeof text !== "string") {
    return "course";
  }

  const slug = text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Spaces to hyphens
    .replace(/_/g, "-")   // Underscores to hyphens (MINOR fix)
    .replace(/[^\w-]/g, "") // Remove special chars
    .replace(/-+/g, "-")  // Normalize multiple hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

  return slug.length > 0 ? slug : "course";
}

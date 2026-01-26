/**
 * Curriculum types for course management
 * Courses contain modules (labs), and students complete modules to progress through courses
 */

/**
 * A module represents a single lab that can be part of a course
 */
export interface CourseModule {
  id: string;                    // Unique module ID (e.g., "python-fundamentals")
  title: string;                 // Display name
  labType: "linux_cli" | "splunk" | "python";  // Type of lab
  description: string;           // What the module teaches
  estimatedTime: number;         // Time in minutes
  prerequisites: string[];       // Module IDs that must be completed first
}

/**
 * Metadata about a course
 */
export interface CourseMetadata {
  title: string;                 // Course name
  description: string;           // Course description
  estimatedTotalTime: number;    // Total time in minutes
  skillsGranted: string[];       // Skills learned in this course
}

/**
 * A complete course definition
 */
export interface Course {
  id: string;                    // Unique course ID (e.g., "python-mastery")
  modules: CourseModule[];       // Modules in order
  metadata: CourseMetadata;      // Course information
}

/**
 * Configuration for loading courses from YAML
 */
export interface CourseConfig {
  courseId: string;              // Unique course ID
  modules: string[];             // List of module IDs in order
  prerequisites: Record<string, string[]>;  // module -> prerequisite modules
  estimatedTime: number;         // Total estimated time in minutes
  description: string;           // Course description
}

/**
 * A skill that can be granted by completing a course
 */
export interface CourseSkill {
  name: string;                  // Skill name (e.g., "Python Lists")
  description: string;           // What the skill involves
}

/**
 * Progress of a student in a specific module
 */
export interface ModuleProgress {
  moduleId: string;              // ID of the module
  status: "not_started" | "in_progress" | "completed";
  score: number;                 // Score 0-1
  completedAt: string | null;    // ISO timestamp when completed
}

/**
 * Overall progress in a course
 */
export interface CourseProgress {
  courseId: string;              // ID of the course
  moduleProgress: ModuleProgress[];  // Progress for each module
  overallProgress: number;       // Percentage 0-100
  overallScore: number;          // Average score 0-1
}

/**
 * Student progress across all courses
 */
export interface StudentProgress {
  studentId: string;             // Unique student identifier
  courseId: string;              // Which course this tracks
  completedModules: string[];    // Module IDs completed
  currentModule: string | null;  // Currently active module (if any)
  score: number;                 // Overall score in course
  lastUpdated: string;           // ISO timestamp of last update
}

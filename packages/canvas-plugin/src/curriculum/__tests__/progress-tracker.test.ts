import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import * as os from "os";
import {
  loadStudentProgress,
  saveStudentProgress,
  markModuleComplete,
  getCourseProgress,
  getCompletedModules,
  _setHomeDirectory, // Test-only function for mocking HOME
} from "../progress-tracker";
import { loadCourse } from "../course-loader";
import type { Course, StudentProgress, CourseProgress } from "../types";

let tmpDir: string;
let originalHome: string;

beforeAll(() => {
  tmpDir = mkdtempSync("/tmp/canvas-progress-tracker-test-");
  originalHome = process.env.HOME || os.homedir();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  // Restore original HOME directory
  _setHomeDirectory(originalHome);
});

beforeEach(() => {
  // Point progress tracker to temp directory for each test
  _setHomeDirectory(tmpDir);
});

describe("Progress Tracker", () => {
  let testCourse: Course;

  beforeAll(() => {
    // Create a test course YAML
    const courseYaml = `
title: Python Mastery
description: Complete Python course
estimatedTotalTime: 120
skillsGranted:
  - python
modules:
  - id: python-fundamentals
    title: Python Fundamentals
    labType: python
    description: Learn Python basics
    estimatedTime: 30
    prerequisites: []
  - id: python-functions
    title: Python Functions
    labType: python
    description: Master functions
    estimatedTime: 25
    prerequisites:
      - python-fundamentals
  - id: python-oop
    title: Python OOP
    labType: python
    description: Object-oriented Python
    estimatedTime: 35
    prerequisites:
      - python-functions
`;
    const coursePath = join(tmpDir, "python-mastery.yaml");
    writeFileSync(coursePath, courseYaml);
    testCourse = loadCourse(coursePath);
  });

  test("loadStudentProgress returns empty progress for new student", () => {
    const progress = loadStudentProgress("alice", "python-mastery");

    expect(progress).toBeDefined();
    expect(progress.studentId).toBe("alice");
    expect(progress.courseId).toBe("python-mastery");
    expect(progress.completedModules).toHaveLength(0);
    expect(progress.currentModule).toBeNull();
    expect(progress.score).toBe(0);
  });

  test("saveStudentProgress writes to ~/.canvas/progress-{studentId}.json", () => {
    const progress: StudentProgress = {
      studentId: "bob",
      courseId: "python-mastery",
      completedModules: ["python-fundamentals"],
      currentModule: "python-functions",
      score: 0.75,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    const progressFile = join(tmpDir, ".canvas", "progress-bob.json");
    expect(readFileSync(progressFile, "utf-8")).toBeDefined();

    const loaded = JSON.parse(readFileSync(progressFile, "utf-8")) as StudentProgress;
    expect(loaded.studentId).toBe("bob");
    expect(loaded.score).toBe(0.75);
  });

  test("markModuleComplete updates student progress", () => {
    const initialProgress: StudentProgress = {
      studentId: "charlie",
      courseId: "python-mastery",
      completedModules: ["python-fundamentals"],
      currentModule: "python-functions",
      score: 0.7,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(initialProgress);

    // Mark next module complete
    const updatedProgress = markModuleComplete("charlie", "python-functions", 0.85, testCourse);

    expect(updatedProgress).not.toBeNull();
    if (updatedProgress) {
      expect(updatedProgress.completedModules).toContain("python-fundamentals");
      expect(updatedProgress.completedModules).toContain("python-functions");
      expect(updatedProgress.currentModule).toBe("python-oop");
      expect(updatedProgress.score).toBeGreaterThan(0.7); // Score increased
    }
  });

  test("markModuleComplete calculates average score", () => {
    const progress: StudentProgress = {
      studentId: "diana",
      courseId: "python-mastery",
      completedModules: [],
      currentModule: "python-fundamentals",
      score: 0,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    // Complete first module with score 0.9
    let updated = markModuleComplete("diana", "python-fundamentals", 0.9, testCourse);
    expect(updated).not.toBeNull();
    if (updated) expect(updated.score).toBeCloseTo(0.9, 2);

    // Complete second module with score 0.8
    updated = markModuleComplete("diana", "python-functions", 0.8, testCourse);
    expect(updated).not.toBeNull();
    if (updated) expect(updated.score).toBeCloseTo(0.85, 2); // Average of 0.9 and 0.8

    // Complete third module with score 0.95
    updated = markModuleComplete("diana", "python-oop", 0.95, testCourse);
    expect(updated).not.toBeNull();
    if (updated) expect(updated.score).toBeCloseTo(0.883, 2); // Average of 0.9, 0.8, 0.95
  });

  test("getCourseProgress aggregates module status", () => {
    const progress: StudentProgress = {
      studentId: "eve",
      courseId: "python-mastery",
      completedModules: ["python-fundamentals", "python-functions"],
      currentModule: "python-oop",
      score: 0.82,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    const courseProgress = getCourseProgress("eve", testCourse);

    expect(courseProgress.courseId).toBe("python-mastery");
    expect(courseProgress.moduleProgress).toHaveLength(3);

    // Check completed modules
    const completedModules = courseProgress.moduleProgress.filter(m => m.status === "completed");
    expect(completedModules).toHaveLength(2);

    // Check in-progress module
    const inProgressModules = courseProgress.moduleProgress.filter(m => m.status === "in_progress");
    expect(inProgressModules).toHaveLength(1);
    expect(inProgressModules[0]?.moduleId).toBe("python-oop");

    // Check overall progress percentage
    expect(courseProgress.overallProgress).toBe(67); // 2 of 3 completed (rounded)
  });

  test("getCompletedModules returns only completed modules", () => {
    const progress: StudentProgress = {
      studentId: "frank",
      courseId: "python-mastery",
      completedModules: ["python-fundamentals", "python-functions"],
      currentModule: "python-oop",
      score: 0.75,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    const completed = getCompletedModules("frank");

    expect(completed).toHaveLength(2);
    expect(completed).toContain("python-fundamentals");
    expect(completed).toContain("python-functions");
    expect(completed).not.toContain("python-oop");
  });

  test("progress file contains correct JSON structure", () => {
    const progress: StudentProgress = {
      studentId: "grace",
      courseId: "python-mastery",
      completedModules: ["python-fundamentals"],
      currentModule: "python-functions",
      score: 0.8,
      lastUpdated: "2026-01-24T10:30:00Z",
    };

    saveStudentProgress(progress);

    const progressFile = join(tmpDir, ".canvas", "progress-grace.json");
    const fileContent = readFileSync(progressFile, "utf-8");
    const parsed = JSON.parse(fileContent) as StudentProgress;

    // Verify all fields are persisted correctly
    expect(parsed.studentId).toBe("grace");
    expect(parsed.courseId).toBe("python-mastery");
    expect(parsed.completedModules).toEqual(["python-fundamentals"]);
    expect(parsed.currentModule).toBe("python-functions");
    expect(parsed.score).toBe(0.8);
    expect(parsed.lastUpdated).toBe("2026-01-24T10:30:00Z");
  });

  test("markModuleComplete returns null if module not found in course", () => {
    const progress: StudentProgress = {
      studentId: "henry",
      courseId: "python-mastery",
      completedModules: [],
      currentModule: "python-fundamentals",
      score: 0,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    // Try to mark non-existent module complete
    const updated = markModuleComplete("henry", "nonexistent-module", 0.9, testCourse);

    expect(updated).toBeNull();
  });

  test("getCourseProgress calculates completion percentage correctly", () => {
    const progress: StudentProgress = {
      studentId: "iris",
      courseId: "python-mastery",
      completedModules: ["python-fundamentals"],
      currentModule: "python-functions",
      score: 0.75,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    const courseProgress = getCourseProgress("iris", testCourse);

    // 1 of 3 completed = 33.33% → should round to 33
    expect(courseProgress.overallProgress).toBe(33);
    expect(courseProgress.overallScore).toBe(0.75);
  });

  test("loadStudentProgress handles missing progress file", () => {
    // Student that has never started
    const progress = loadStudentProgress("jack", "python-mastery");

    expect(progress).toBeDefined();
    expect(progress.studentId).toBe("jack");
    expect(progress.completedModules).toHaveLength(0);
    expect(progress.score).toBe(0);
  });

  test("markModuleComplete updates current module to next available", () => {
    const progress: StudentProgress = {
      studentId: "karen",
      courseId: "python-mastery",
      completedModules: [],
      currentModule: "python-fundamentals",
      score: 0,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    // Complete python-fundamentals
    let updated = markModuleComplete("karen", "python-fundamentals", 0.9, testCourse);
    expect(updated).not.toBeNull();
    if (updated) expect(updated.currentModule).toBe("python-functions");

    // Complete python-functions (prerequisites now met for python-oop)
    updated = markModuleComplete("karen", "python-functions", 0.88, testCourse);
    expect(updated).not.toBeNull();
    if (updated) expect(updated.currentModule).toBe("python-oop");

    // Complete python-oop (no more modules)
    updated = markModuleComplete("karen", "python-oop", 0.92, testCourse);
    expect(updated).not.toBeNull();
    if (updated) expect(updated.currentModule).toBeNull();
  });

  test("markModuleComplete throws error for invalid moduleScore", () => {
    const progress: StudentProgress = {
      studentId: "invalid-score-test",
      courseId: "python-mastery",
      completedModules: [],
      currentModule: "python-fundamentals",
      score: 0,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    // Test negative score
    expect(() => markModuleComplete("invalid-score-test", "python-fundamentals", -0.5, testCourse))
      .toThrow(/Invalid moduleScore/);

    // Test score > 1
    expect(() => markModuleComplete("invalid-score-test", "python-fundamentals", 1.5, testCourse))
      .toThrow(/Invalid moduleScore/);

    // Test NaN
    expect(() => markModuleComplete("invalid-score-test", "python-fundamentals", NaN, testCourse))
      .toThrow(/Invalid moduleScore/);
  });

  test("markModuleComplete called twice for same module returns unchanged", () => {
    const progress: StudentProgress = {
      studentId: "duplicate-test",
      courseId: "python-mastery",
      completedModules: [],
      currentModule: "python-fundamentals",
      score: 0,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    // First completion with score 0.9
    let updated = markModuleComplete("duplicate-test", "python-fundamentals", 0.9, testCourse);
    expect(updated).not.toBeNull();
    if (updated) {
      expect(updated.score).toBe(0.9);
      expect(updated.completedModules).toHaveLength(1);
    }

    // Second attempt to complete same module - should return unchanged
    const secondAttempt = markModuleComplete("duplicate-test", "python-fundamentals", 0.5, testCourse);
    expect(secondAttempt).not.toBeNull();
    if (secondAttempt) {
      expect(secondAttempt.score).toBe(0.9); // Score unchanged
      expect(secondAttempt.completedModules).toHaveLength(1); // Still only 1
    }
  });

  test("getCourseProgress handles empty course with no modules", () => {
    const emptyCourse: Course = {
      id: "empty-course",
      modules: [],
      metadata: {
        title: "Empty Course",
        description: "No modules",
        estimatedTotalTime: 0,
        skillsGranted: [],
      },
    };

    const progress: StudentProgress = {
      studentId: "empty-course-test",
      courseId: "empty-course",
      completedModules: [],
      currentModule: null,
      score: 0,
      lastUpdated: new Date().toISOString(),
    };

    saveStudentProgress(progress);

    const courseProgress = getCourseProgress("empty-course-test", emptyCourse);

    expect(courseProgress.overallProgress).toBe(0);
    expect(courseProgress.moduleProgress).toHaveLength(0);
    expect(courseProgress.overallScore).toBe(0);
  });
});

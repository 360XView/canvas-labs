import { describe, test, expect } from "bun:test";
import type {
  CourseModule,
  CourseMetadata,
  CourseConfig,
  Course,
  CourseSkill,
  CourseProgress,
  StudentProgress,
} from "../types";

describe("Curriculum Types", () => {
  test("CourseModule has required fields", () => {
    const module: CourseModule = {
      id: "python-fundamentals",
      title: "Python Fundamentals",
      labType: "python",
      description: "Learn Python basics",
      estimatedTime: 30,
      prerequisites: [],
    };

    expect(module.id).toBe("python-fundamentals");
    expect(module.labType).toBe("python");
    expect(module.prerequisites).toHaveLength(0);
  });

  test("CourseMetadata includes title and description", () => {
    const metadata: CourseMetadata = {
      title: "Python Mastery",
      description: "Complete Python course",
      estimatedTotalTime: 120,
      skillsGranted: ["python-basics", "python-oop"],
    };

    expect(metadata.title).toBe("Python Mastery");
    expect(metadata.skillsGranted).toContain("python-oop");
  });

  test("Course includes modules and metadata", () => {
    const course: Course = {
      id: "python-mastery",
      modules: [
        {
          id: "python-fundamentals",
          title: "Python Fundamentals",
          labType: "python",
          description: "Basics",
          estimatedTime: 30,
          prerequisites: [],
        },
      ],
      metadata: {
        title: "Python Mastery",
        description: "Complete Python course",
        estimatedTotalTime: 120,
        skillsGranted: ["python"],
      },
    };

    expect(course.modules).toHaveLength(1);
    expect(course.metadata.title).toBe("Python Mastery");
  });

  test("StudentProgress tracks module completion", () => {
    const progress: StudentProgress = {
      studentId: "alice",
      courseId: "python-mastery",
      completedModules: ["python-fundamentals"],
      currentModule: "python-functions",
      score: 0.85,
      lastUpdated: new Date().toISOString(),
    };

    expect(progress.completedModules).toContain("python-fundamentals");
    expect(progress.score).toBe(0.85);
  });

  test("CourseProgress aggregates module progress", () => {
    const courseProgress: CourseProgress = {
      courseId: "python-mastery",
      moduleProgress: [
        {
          moduleId: "python-fundamentals",
          status: "completed",
          score: 0.9,
          completedAt: new Date().toISOString(),
        },
        {
          moduleId: "python-functions",
          status: "in_progress",
          score: 0.7,
          completedAt: null,
        },
      ],
      overallProgress: 50,
      overallScore: 0.8,
    };

    expect(courseProgress.moduleProgress).toHaveLength(2);
    expect(courseProgress.overallProgress).toBe(50);
  });

  test("CourseSkill has name and description", () => {
    const skill: CourseSkill = {
      name: "Python Lists",
      description: "Work with list data structures",
    };

    expect(skill.name).toBe("Python Lists");
  });

  test("CourseConfig enforces valid course structure", () => {
    const config: CourseConfig = {
      courseId: "python-mastery",
      modules: ["python-fundamentals", "python-functions", "python-oop"],
      prerequisites: {},
      estimatedTime: 120,
      description: "Master Python programming",
    };

    expect(config.modules).toHaveLength(3);
    expect(config.courseId).toBe("python-mastery");
  });
});

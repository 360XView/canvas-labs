import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import {
  loadCourse,
  getNextModuleInCourse,
  getCourseByModuleId,
  listAllCourses,
  _clearCourseRegistry,
} from "../course-loader";

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync("/tmp/canvas-course-loader-test-");
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// MINOR fix: Clear registry before each test to avoid state leakage
beforeEach(() => {
  _clearCourseRegistry();
});

describe("Course Loader", () => {
  test("loadCourse parses YAML course definition", () => {
    // Create a test course YAML file
    const courseYaml = `
title: Python Mastery
description: Complete Python programming course
estimatedTotalTime: 120
skillsGranted:
  - python-basics
  - python-oop
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
`;
    const coursePath = join(tmpDir, "course.yaml");
    writeFileSync(coursePath, courseYaml);

    const course = loadCourse(coursePath);

    expect(course.metadata.title).toBe("Python Mastery");
    expect(course.modules).toHaveLength(2);
    expect(course.modules[0].id).toBe("python-fundamentals");
    expect(course.modules[1].prerequisites).toContain("python-fundamentals");
  });

  test("getNextModuleInCourse returns next module when prerequisites met", () => {
    const courseYaml = `
title: Test Course
description: Test
estimatedTotalTime: 60
skillsGranted: []
modules:
  - id: module-1
    title: Module 1
    labType: linux_cli
    description: First
    estimatedTime: 20
    prerequisites: []
  - id: module-2
    title: Module 2
    labType: linux_cli
    description: Second
    estimatedTime: 20
    prerequisites:
      - module-1
  - id: module-3
    title: Module 3
    labType: linux_cli
    description: Third
    estimatedTime: 20
    prerequisites:
      - module-2
`;
    const coursePath = join(tmpDir, "test-course.yaml");
    writeFileSync(coursePath, courseYaml);

    const course = loadCourse(coursePath);

    // Student completed module-1, should get module-2
    const nextModule = getNextModuleInCourse(course, ["module-1"]);
    expect(nextModule?.id).toBe("module-2");

    // Student completed module-1 and module-2, should get module-3
    const nextModule2 = getNextModuleInCourse(course, ["module-1", "module-2"]);
    expect(nextModule2?.id).toBe("module-3");

    // Student completed all, should get null
    const nextModule3 = getNextModuleInCourse(course, ["module-1", "module-2", "module-3"]);
    expect(nextModule3).toBeNull();
  });

  test("getCourseByModuleId finds course containing module", () => {
    const courseYaml = `
title: Course A
description: First course
estimatedTotalTime: 60
skillsGranted: []
modules:
  - id: python-fundamentals
    title: Python Fundamentals
    labType: python
    description: Learn Python
    estimatedTime: 30
    prerequisites: []
  - id: python-functions
    title: Python Functions
    labType: python
    description: Learn functions
    estimatedTime: 30
    prerequisites: []
`;
    const coursePath = join(tmpDir, "course-a.yaml");
    writeFileSync(coursePath, courseYaml);

    // Register course
    loadCourse(coursePath);

    // Find course by module ID
    const course = getCourseByModuleId("python-functions");
    expect(course?.id).toBe("course-a");
    expect(course?.modules).toHaveLength(2);
  });

  test("listAllCourses returns all loaded courses", () => {
    // Create two course files
    const course1Yaml = `
title: Course 1
description: First
estimatedTotalTime: 60
skillsGranted: []
modules:
  - id: module-1a
    title: Module 1A
    labType: linux_cli
    description: Test
    estimatedTime: 30
    prerequisites: []
`;
    const course2Yaml = `
title: Course 2
description: Second
estimatedTotalTime: 90
skillsGranted: []
modules:
  - id: module-2a
    title: Module 2A
    labType: splunk
    description: Test
    estimatedTime: 45
    prerequisites: []
`;

    const path1 = join(tmpDir, "course1.yaml");
    const path2 = join(tmpDir, "course2.yaml");
    writeFileSync(path1, course1Yaml);
    writeFileSync(path2, course2Yaml);

    loadCourse(path1);
    loadCourse(path2);

    const allCourses = listAllCourses();
    expect(allCourses.length).toBeGreaterThanOrEqual(2);
    expect(allCourses.map(c => c.metadata.title)).toContain("Course 1");
    expect(allCourses.map(c => c.metadata.title)).toContain("Course 2");
  });

  test("getNextModuleInCourse skips modules with unmet prerequisites", () => {
    const courseYaml = `
title: Test Course
description: Test
estimatedTotalTime: 90
skillsGranted: []
modules:
  - id: a
    title: A
    labType: linux_cli
    description: A
    estimatedTime: 30
    prerequisites: []
  - id: b
    title: B
    labType: linux_cli
    description: B
    estimatedTime: 30
    prerequisites:
      - a
  - id: c
    title: C
    labType: linux_cli
    description: C
    estimatedTime: 30
    prerequisites:
      - b
`;
    const coursePath = join(tmpDir, "prereq-test.yaml");
    writeFileSync(coursePath, courseYaml);

    const course = loadCourse(coursePath);

    // Only completed 'a', prerequisites for 'b' should be met, 'c' should not
    const next = getNextModuleInCourse(course, ["a"]);
    expect(next?.id).toBe("b");

    // Still only 'a', trying to get 'c' should not be possible (unmet prereq)
    const nextNotC = getNextModuleInCourse(course, ["a"]);
    expect(nextNotC?.id).not.toBe("c");
  });

  test("loadCourse throws error when module lacks id field", () => {
    const courseYaml = `
title: Invalid Course
description: Course with missing module ID
estimatedTotalTime: 60
skillsGranted: []
modules:
  - id: valid-module
    title: Valid
    labType: linux_cli
    description: Test
    estimatedTime: 20
    prerequisites: []
  - title: Missing ID
    labType: linux_cli
    description: This module has no id field
    estimatedTime: 20
    prerequisites: []
`;
    const coursePath = join(tmpDir, "invalid-course.yaml");
    writeFileSync(coursePath, courseYaml);

    expect(() => loadCourse(coursePath)).toThrow();
    expect(() => loadCourse(coursePath)).toThrow(/missing required 'id' field/);
  });

  test("loadCourse throws error for invalid labType", () => {
    const courseYaml = `
title: Invalid Lab Type
description: Test
estimatedTotalTime: 60
skillsGranted: []
modules:
  - id: bad-module
    title: Bad
    labType: invalid_type
    description: Test
    estimatedTime: 20
    prerequisites: []
`;
    const coursePath = join(tmpDir, "bad-labtype.yaml");
    writeFileSync(coursePath, courseYaml);

    expect(() => loadCourse(coursePath)).toThrow();
    expect(() => loadCourse(coursePath)).toThrow(/invalid labType/);
  });

  test("loadCourse throws error for non-array modules", () => {
    const courseYaml = `
title: Bad Modules Format
description: Test
estimatedTotalTime: 60
skillsGranted: []
modules: "not an array"
`;
    const coursePath = join(tmpDir, "bad-modules.yaml");
    writeFileSync(coursePath, courseYaml);

    expect(() => loadCourse(coursePath)).toThrow();
    expect(() => loadCourse(coursePath)).toThrow(/invalid modules field/);
  });

  test("loadCourse throws error for missing file", () => {
    const nonexistentPath = join(tmpDir, "nonexistent.yaml");
    expect(() => loadCourse(nonexistentPath)).toThrow();
    expect(() => loadCourse(nonexistentPath)).toThrow(/Failed to read course file/);
  });

  test("loadCourse throws error for invalid YAML syntax", () => {
    const invalidYaml = `
title: Bad YAML
  invalid: indentation [
    incomplete: bracket
`;
    const coursePath = join(tmpDir, "invalid.yaml");
    writeFileSync(coursePath, invalidYaml);

    expect(() => loadCourse(coursePath)).toThrow();
    expect(() => loadCourse(coursePath)).toThrow(/Failed to parse YAML/);
  });

  test("loadCourse warns when overwriting existing course", () => {
    const courseYaml = `
id: duplicate-course
title: Test Course
description: Test
estimatedTotalTime: 60
skillsGranted: []
modules:
  - id: module-1
    title: Module 1
    labType: linux_cli
    description: Test
    estimatedTime: 30
    prerequisites: []
`;
    const path1 = join(tmpDir, "dup1.yaml");
    const path2 = join(tmpDir, "dup2.yaml");
    writeFileSync(path1, courseYaml);
    writeFileSync(path2, courseYaml);

    // Load same course ID twice
    const course1 = loadCourse(path1);
    const course2 = loadCourse(path2);

    // Second load should succeed (overwrites) - no error thrown
    expect(course1.id).toBe(course2.id);
    expect(listAllCourses().length).toBe(1); // Not 2, because ID was same
  });

  test("slugify handles edge cases correctly", () => {
    // These test the slugify behavior indirectly through loadCourse
    const testCases = [
      { title: "Python Mastery", expectedId: "python-mastery" },
      { title: "Advanced___Topics", expectedId: "advanced-topics" },
      { title: "  Spaces  ", expectedId: "spaces" },
      { title: "Special@Chars!", expectedId: "specialchars" },
    ];

    for (const testCase of testCases) {
      const courseYaml = `
title: ${testCase.title}
description: Test
estimatedTotalTime: 60
skillsGranted: []
modules:
  - id: test-module
    title: Test
    labType: linux_cli
    description: Test
    estimatedTime: 30
    prerequisites: []
`;
      const coursePath = join(tmpDir, `slugify-${testCase.title.replace(/\s+/g, "-")}.yaml`);
      writeFileSync(coursePath, courseYaml);

      _clearCourseRegistry();
      const course = loadCourse(coursePath);
      expect(course.id).toBe(testCase.expectedId);
    }
  });
});

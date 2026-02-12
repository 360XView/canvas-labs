// Skill Query API Tests
// Tests for querying student skills and gap analysis

import { describe, test, expect } from "bun:test";
import {
  getStudentSkills,
  getGapAnalysis,
  getSkillsByLevel,
} from "../skill-query";
import type { SkillState, SkillDefinition, QMatrixEntry } from "../types";

// ============================================================================
// HELPERS
// ============================================================================

function makeSkillState(
  skillId: string,
  demonstrated: number,
  currentLevel: SkillState["current_level"] = "unassessed",
  evidenceCount: number = 1
): SkillState {
  return {
    skill_id: skillId,
    student_id: "student-1",
    declared: null,
    demonstrated,
    current_level: currentLevel,
    evidence_count: evidenceCount,
    last_evidence_at: new Date().toISOString(),
  };
}

const SAMPLE_SKILLS: SkillDefinition[] = [
  {
    id: "shell.nav.absolute-paths", name: "Navigate with Absolute Paths",
    description: "...", domain: "shell", group: "nav",
    evidence_levels: ["knows", "applies"], prerequisites: [], tags: [],
  },
  {
    id: "shell.nav.relative-paths", name: "Navigate with Relative Paths",
    description: "...", domain: "shell", group: "nav",
    evidence_levels: ["knows", "understands", "applies"], prerequisites: [], tags: [],
  },
  {
    id: "shell.files.display", name: "Display File Contents",
    description: "...", domain: "shell", group: "files",
    evidence_levels: ["applies"], prerequisites: ["shell.nav.absolute-paths"], tags: [],
  },
  {
    id: "shell.files.search", name: "Search File Contents",
    description: "...", domain: "shell", group: "files",
    evidence_levels: ["applies"], prerequisites: ["shell.nav.absolute-paths"], tags: [],
  },
];

const SAMPLE_QMATRIX: QMatrixEntry[] = [
  { lab_id: "shell-file-operations", step_id: "display-file", skill_id: "shell.files.display", level: "applies", weight: 1.0 },
  { lab_id: "shell-file-operations", step_id: "search-with-grep", skill_id: "shell.files.search", level: "applies", weight: 1.0 },
  { lab_id: "shell-navigation", step_id: "navigate-absolute", skill_id: "shell.nav.absolute-paths", level: "applies", weight: 1.0 },
];

// ============================================================================
// GET STUDENT SKILLS
// ============================================================================

describe("getStudentSkills", () => {
  test("returns all skill states for a student", () => {
    const states: Record<string, SkillState> = {
      "shell.nav.absolute-paths": makeSkillState("shell.nav.absolute-paths", 1.0, "applies"),
      "shell.nav.relative-paths": makeSkillState("shell.nav.relative-paths", 0.80, "applies"),
    };

    const result = getStudentSkills(states, SAMPLE_SKILLS);
    expect(result.length).toBe(2);
    expect(result[0].skill_id).toBe("shell.nav.absolute-paths");
    expect(result[0].skill_name).toBe("Navigate with Absolute Paths");
  });

  test("includes skill name from catalog", () => {
    const states: Record<string, SkillState> = {
      "shell.files.display": makeSkillState("shell.files.display", 0.75, "applies"),
    };

    const result = getStudentSkills(states, SAMPLE_SKILLS);
    expect(result[0].skill_name).toBe("Display File Contents");
  });

  test("returns empty array when no skills", () => {
    const result = getStudentSkills({}, SAMPLE_SKILLS);
    expect(result.length).toBe(0);
  });
});

// ============================================================================
// GET SKILLS BY LEVEL
// ============================================================================

describe("getSkillsByLevel", () => {
  test("groups skills into mastered, inProgress, notStarted", () => {
    const states: Record<string, SkillState> = {
      "shell.nav.absolute-paths": makeSkillState("shell.nav.absolute-paths", 1.0, "applies"),
      "shell.nav.relative-paths": makeSkillState("shell.nav.relative-paths", 0.40, "knows"),
    };

    const result = getSkillsByLevel(states, SAMPLE_SKILLS);
    expect(result.mastered).toContain("shell.nav.absolute-paths");
    expect(result.inProgress).toContain("shell.nav.relative-paths");
    // Skills in catalog but not in states
    expect(result.notStarted).toContain("shell.files.display");
    expect(result.notStarted).toContain("shell.files.search");
  });

  test("mastered means applies level", () => {
    const states: Record<string, SkillState> = {
      "shell.nav.absolute-paths": makeSkillState("shell.nav.absolute-paths", 0.60, "understands"),
    };

    const result = getSkillsByLevel(states, SAMPLE_SKILLS);
    // understands is not mastered
    expect(result.mastered.length).toBe(0);
    expect(result.inProgress).toContain("shell.nav.absolute-paths");
  });
});

// ============================================================================
// GAP ANALYSIS
// ============================================================================

describe("getGapAnalysis", () => {
  test("identifies gaps for a lab based on Q-matrix skills", () => {
    const states: Record<string, SkillState> = {
      // Has display but not search
      "shell.files.display": makeSkillState("shell.files.display", 0.85, "applies"),
    };

    const result = getGapAnalysis(
      states, SAMPLE_SKILLS, SAMPLE_QMATRIX, "shell-file-operations"
    );

    expect(result.student_id).toBe("student-1");
    expect(result.target_lab_id).toBe("shell-file-operations");

    // shell.files.display is mastered (0.85 >= 0.70)
    expect(result.mastered.length).toBe(1);
    expect(result.mastered[0].skill_id).toBe("shell.files.display");

    // shell.files.search is a gap (not in states, unassessed)
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0].skill_id).toBe("shell.files.search");
    expect(result.gaps[0].current_level).toBe("unassessed");
    expect(result.gaps[0].gap).toBeGreaterThan(0);
  });

  test("returns all mastered when student has all skills", () => {
    const states: Record<string, SkillState> = {
      "shell.files.display": makeSkillState("shell.files.display", 0.90, "applies"),
      "shell.files.search": makeSkillState("shell.files.search", 0.75, "applies"),
    };

    const result = getGapAnalysis(
      states, SAMPLE_SKILLS, SAMPLE_QMATRIX, "shell-file-operations"
    );

    expect(result.mastered.length).toBe(2);
    expect(result.gaps.length).toBe(0);
  });

  test("returns all gaps when student has no skills", () => {
    const result = getGapAnalysis(
      {}, SAMPLE_SKILLS, SAMPLE_QMATRIX, "shell-file-operations"
    );

    expect(result.mastered.length).toBe(0);
    expect(result.gaps.length).toBe(2); // display + search
  });

  test("student_id comes from first state entry or defaults", () => {
    const states: Record<string, SkillState> = {
      "shell.files.display": makeSkillState("shell.files.display", 0.90, "applies"),
    };

    const result = getGapAnalysis(
      states, SAMPLE_SKILLS, SAMPLE_QMATRIX, "shell-file-operations"
    );

    expect(result.student_id).toBe("student-1");
  });
});

// Skill Engine Tests
// Tests for evidence pipeline, aggregation, and level determination

import { describe, test, expect } from "bun:test";
import {
  produceSkillEvidence,
  aggregateSkillConfidence,
  determineLevel,
  computeTimeDecay,
  computeStudentSkillStates,
} from "../skill-engine";
import type { QMatrixEntry, SkillEvidence, ProficiencyLevel } from "../types";
import { DEFAULT_THRESHOLDS, DEFAULT_DECAY } from "../types";
import type { TaskEvidence } from "../../telemetry/types";

// ============================================================================
// HELPERS
// ============================================================================

function makeTaskEvidence(overrides: Partial<TaskEvidence> & { step_id: string }): TaskEvidence {
  return {
    evidence_id: `ev-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    task_id: overrides.step_id,
    step_id: overrides.step_id,
    student_id: overrides.student_id ?? "student-1",
    session_id: overrides.session_id ?? "sess-1",
    status: overrides.status ?? "completed",
    confidence: overrides.confidence ?? 1.0,
    source_event_ids: [],
    validation_results: [],
    modifiers: [],
    explanation: "",
    total_attempts: overrides.total_attempts ?? 1,
    hints_revealed: overrides.hints_revealed ?? 0,
    solution_viewed: overrides.solution_viewed ?? false,
    ...overrides,
  };
}

function makeQMatrixEntry(
  labId: string,
  stepId: string,
  skillId: string,
  level: ProficiencyLevel = "applies",
  weight: number = 1.0
): QMatrixEntry {
  return { lab_id: labId, step_id: stepId, skill_id: skillId, level, weight };
}

// ============================================================================
// EVIDENCE PIPELINE
// ============================================================================

describe("produceSkillEvidence", () => {
  test("maps a single step to a single skill", () => {
    const taskEvidence = [
      makeTaskEvidence({ step_id: "navigate-absolute", confidence: 1.0 }),
    ];
    const qmatrix = [
      makeQMatrixEntry("shell-navigation", "navigate-absolute", "shell.nav.absolute-paths"),
    ];

    const result = produceSkillEvidence(taskEvidence, qmatrix, "shell-navigation");

    expect(result.length).toBe(1);
    expect(result[0].skill_id).toBe("shell.nav.absolute-paths");
    expect(result[0].confidence).toBe(1.0);
    expect(result[0].weight).toBe(1.0);
    expect(result[0].level).toBe("applies");
    expect(result[0].source_type).toBe("lab_step");
    expect(result[0].source_id).toBe("shell-navigation:navigate-absolute");
  });

  test("maps a single step to multiple skills", () => {
    const taskEvidence = [
      makeTaskEvidence({ step_id: "chain-with-pipe", confidence: 0.85 }),
    ];
    const qmatrix = [
      makeQMatrixEntry("shell-file-operations", "chain-with-pipe", "shell.files.pipes", "applies", 1.0),
      makeQMatrixEntry("shell-file-operations", "chain-with-pipe", "shell.files.search", "applies", 0.3),
    ];

    const result = produceSkillEvidence(taskEvidence, qmatrix, "shell-file-operations");

    expect(result.length).toBe(2);
    expect(result[0].skill_id).toBe("shell.files.pipes");
    expect(result[0].confidence).toBe(0.85);
    expect(result[0].weight).toBe(1.0);
    expect(result[1].skill_id).toBe("shell.files.search");
    expect(result[1].confidence).toBe(0.85);
    expect(result[1].weight).toBe(0.3);
  });

  test("ignores steps with no Q-matrix mapping", () => {
    const taskEvidence = [
      makeTaskEvidence({ step_id: "intro" }),
      makeTaskEvidence({ step_id: "summary" }),
    ];
    const qmatrix = [
      makeQMatrixEntry("shell-navigation", "navigate-absolute", "shell.nav.absolute-paths"),
    ];

    const result = produceSkillEvidence(taskEvidence, qmatrix, "shell-navigation");
    expect(result.length).toBe(0);
  });

  test("preserves student_id and session_id from task evidence", () => {
    const taskEvidence = [
      makeTaskEvidence({ step_id: "navigate-absolute", student_id: "alice", session_id: "sess-42" }),
    ];
    const qmatrix = [
      makeQMatrixEntry("shell-navigation", "navigate-absolute", "shell.nav.absolute-paths"),
    ];

    const result = produceSkillEvidence(taskEvidence, qmatrix, "shell-navigation");
    expect(result[0].student_id).toBe("alice");
    expect(result[0].session_id).toBe("sess-42");
  });

  test("skips non-completed steps (no skill evidence for pending/failed)", () => {
    const taskEvidence = [
      makeTaskEvidence({ step_id: "navigate-absolute", status: "pending", confidence: 0 }),
      makeTaskEvidence({ step_id: "navigate-relative", status: "completed", confidence: 0.85 }),
    ];
    const qmatrix = [
      makeQMatrixEntry("shell-navigation", "navigate-absolute", "shell.nav.absolute-paths"),
      makeQMatrixEntry("shell-navigation", "navigate-relative", "shell.nav.relative-paths"),
    ];

    const result = produceSkillEvidence(taskEvidence, qmatrix, "shell-navigation");
    expect(result.length).toBe(1);
    expect(result[0].skill_id).toBe("shell.nav.relative-paths");
  });
});

// ============================================================================
// TIME DECAY
// ============================================================================

describe("computeTimeDecay", () => {
  test("fresh evidence has decay factor 1.0", () => {
    const decay = computeTimeDecay(0, DEFAULT_DECAY);
    expect(decay).toBeCloseTo(1.0, 4);
  });

  test("evidence at half-life has decay factor ~0.5", () => {
    const decay = computeTimeDecay(60, DEFAULT_DECAY);
    expect(decay).toBeCloseTo(0.5, 2);
  });

  test("evidence at 30 days has decay factor ~0.71", () => {
    const decay = computeTimeDecay(30, DEFAULT_DECAY);
    expect(decay).toBeCloseTo(0.707, 2);
  });

  test("evidence at 120 days has decay factor ~0.25", () => {
    const decay = computeTimeDecay(120, DEFAULT_DECAY);
    expect(decay).toBeCloseTo(0.25, 2);
  });
});

// ============================================================================
// AGGREGATION
// ============================================================================

describe("aggregateSkillConfidence", () => {
  test("single evidence returns that confidence", () => {
    const evidence: SkillEvidence[] = [
      {
        evidence_id: "sev-1",
        skill_id: "shell.nav.absolute-paths",
        student_id: "student-1",
        level: "applies",
        confidence: 0.85,
        weight: 1.0,
        source_type: "lab_step",
        source_id: "shell-navigation:navigate-absolute",
        session_id: "sess-1",
        timestamp: new Date().toISOString(),
      },
    ];

    const result = aggregateSkillConfidence(evidence, "applies");
    expect(result).toBeCloseTo(0.85, 4);
  });

  test("weighted average of multiple evidence sources", () => {
    // Design doc worked example: shell.nav.relative-paths applies
    // navigate-relative: weight 1.0, confidence 0.85
    // home-shortcut: weight 0.5, confidence 0.70
    // Expected: (1.0 * 0.85 + 0.5 * 0.70) / (1.0 + 0.5) = 0.80
    const now = new Date().toISOString();
    const evidence: SkillEvidence[] = [
      {
        evidence_id: "sev-1",
        skill_id: "shell.nav.relative-paths",
        student_id: "student-1",
        level: "applies",
        confidence: 0.85,
        weight: 1.0,
        source_type: "lab_step",
        source_id: "shell-navigation:navigate-relative",
        session_id: "sess-1",
        timestamp: now,
      },
      {
        evidence_id: "sev-2",
        skill_id: "shell.nav.relative-paths",
        student_id: "student-1",
        level: "applies",
        confidence: 0.70,
        weight: 0.5,
        source_type: "lab_step",
        source_id: "shell-navigation:home-shortcut",
        session_id: "sess-1",
        timestamp: now,
      },
    ];

    const result = aggregateSkillConfidence(evidence, "applies");
    expect(result).toBeCloseTo(0.8, 4);
  });

  test("filters evidence by level", () => {
    const now = new Date().toISOString();
    const evidence: SkillEvidence[] = [
      {
        evidence_id: "sev-1",
        skill_id: "shell.nav.relative-paths",
        student_id: "student-1",
        level: "applies",
        confidence: 0.85,
        weight: 1.0,
        source_type: "lab_step",
        source_id: "shell-navigation:navigate-relative",
        session_id: "sess-1",
        timestamp: now,
      },
      {
        evidence_id: "sev-2",
        skill_id: "shell.nav.relative-paths",
        student_id: "student-1",
        level: "understands",
        confidence: 1.0,
        weight: 0.5,
        source_type: "lab_step",
        source_id: "shell-navigation:path-quiz",
        session_id: "sess-1",
        timestamp: now,
      },
    ];

    // Only "applies" evidence
    const appliesResult = aggregateSkillConfidence(evidence, "applies");
    expect(appliesResult).toBeCloseTo(0.85, 4);

    // Only "understands" evidence
    const understandsResult = aggregateSkillConfidence(evidence, "understands");
    expect(understandsResult).toBeCloseTo(1.0, 4);
  });

  test("returns 0 when no evidence for requested level", () => {
    const result = aggregateSkillConfidence([], "applies");
    expect(result).toBe(0);
  });

  test("applies time decay to older evidence", () => {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const evidence: SkillEvidence[] = [
      {
        evidence_id: "sev-1",
        skill_id: "shell.nav.absolute-paths",
        student_id: "student-1",
        level: "applies",
        confidence: 1.0,
        weight: 1.0,
        source_type: "lab_step",
        source_id: "shell-navigation:navigate-absolute",
        session_id: "sess-1",
        timestamp: sixtyDaysAgo.toISOString(),
      },
    ];

    // At half-life, decay ≈ 0.5, so weighted avg ≈ (1.0 * 1.0 * 0.5) / (1.0 * 0.5) = 1.0
    // Wait — the formula is Σ(w*c*d) / Σ(w*d), so decay cancels for single evidence
    // That's correct by design: decay reduces the *weight* of old evidence relative to new
    // With single evidence, the confidence stays the same
    const result = aggregateSkillConfidence(evidence, "applies");
    expect(result).toBeCloseTo(1.0, 2);
  });

  test("time decay reduces weight of old evidence relative to new", () => {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const evidence: SkillEvidence[] = [
      {
        evidence_id: "sev-old",
        skill_id: "shell.nav.absolute-paths",
        student_id: "student-1",
        level: "applies",
        confidence: 0.5, // Old, low score
        weight: 1.0,
        source_type: "lab_step",
        source_id: "shell-navigation:navigate-absolute",
        session_id: "sess-1",
        timestamp: sixtyDaysAgo.toISOString(),
      },
      {
        evidence_id: "sev-new",
        skill_id: "shell.nav.absolute-paths",
        student_id: "student-1",
        level: "applies",
        confidence: 1.0, // New, perfect score
        weight: 1.0,
        source_type: "lab_step",
        source_id: "shell-text-processing:build-pipeline",
        session_id: "sess-2",
        timestamp: now.toISOString(),
      },
    ];

    // Without decay: (1.0*0.5 + 1.0*1.0) / (1.0 + 1.0) = 0.75
    // With decay on old (factor ~0.5): (1.0*0.5*0.5 + 1.0*1.0*1.0) / (1.0*0.5 + 1.0*1.0)
    //   = (0.25 + 1.0) / (0.5 + 1.0) = 1.25 / 1.5 ≈ 0.833
    // New evidence should weigh more heavily
    const result = aggregateSkillConfidence(evidence, "applies");
    expect(result).toBeGreaterThan(0.75);
    expect(result).toBeLessThan(0.9);
  });
});

// ============================================================================
// LEVEL DETERMINATION
// ============================================================================

describe("determineLevel", () => {
  test("returns 'applies' when confidence >= 0.70", () => {
    expect(determineLevel(0.70)).toBe("applies");
    expect(determineLevel(1.0)).toBe("applies");
  });

  test("returns 'understands' when 0.50 <= confidence < 0.70", () => {
    expect(determineLevel(0.50)).toBe("understands");
    expect(determineLevel(0.69)).toBe("understands");
  });

  test("returns 'knows' when 0.30 <= confidence < 0.50", () => {
    expect(determineLevel(0.30)).toBe("knows");
    expect(determineLevel(0.49)).toBe("knows");
  });

  test("returns 'unassessed' when confidence < 0.30", () => {
    expect(determineLevel(0.0)).toBe("unassessed");
    expect(determineLevel(0.29)).toBe("unassessed");
  });

  test("respects custom thresholds", () => {
    const strict = { knows: 0.5, understands: 0.7, applies: 0.9 };
    expect(determineLevel(0.85, strict)).toBe("understands");
    expect(determineLevel(0.95, strict)).toBe("applies");
    expect(determineLevel(0.45, strict)).toBe("unassessed");
  });
});

// ============================================================================
// COMPUTE STUDENT SKILL STATES (end-to-end)
// ============================================================================

describe("computeStudentSkillStates", () => {
  test("computes skill states from evidence — design doc worked example", () => {
    // From design doc Section 6.5: student completes shell-navigation
    const now = new Date().toISOString();
    const evidence: SkillEvidence[] = [
      // navigate-absolute: confidence 1.0, weight 1.0
      {
        evidence_id: "sev-1", skill_id: "shell.nav.absolute-paths", student_id: "s1",
        level: "applies", confidence: 1.0, weight: 1.0,
        source_type: "lab_step", source_id: "shell-navigation:navigate-absolute",
        session_id: "sess-1", timestamp: now,
      },
      // navigate-relative: confidence 0.85, weight 1.0
      {
        evidence_id: "sev-2", skill_id: "shell.nav.relative-paths", student_id: "s1",
        level: "applies", confidence: 0.85, weight: 1.0,
        source_type: "lab_step", source_id: "shell-navigation:navigate-relative",
        session_id: "sess-1", timestamp: now,
      },
      // home-shortcut: confidence 0.70, weight 0.5 → relative-paths
      {
        evidence_id: "sev-3", skill_id: "shell.nav.relative-paths", student_id: "s1",
        level: "applies", confidence: 0.70, weight: 0.5,
        source_type: "lab_step", source_id: "shell-navigation:home-shortcut",
        session_id: "sess-1", timestamp: now,
      },
      // list-files: confidence 0.75, weight 1.0
      {
        evidence_id: "sev-4", skill_id: "shell.nav.list-contents", student_id: "s1",
        level: "applies", confidence: 0.75, weight: 1.0,
        source_type: "lab_step", source_id: "shell-navigation:list-files",
        session_id: "sess-1", timestamp: now,
      },
      // path-quiz: confidence 1.0, weight 1.0 → path-concepts (understands)
      {
        evidence_id: "sev-5", skill_id: "shell.nav.path-concepts", student_id: "s1",
        level: "understands", confidence: 1.0, weight: 1.0,
        source_type: "lab_step", source_id: "shell-navigation:path-quiz",
        session_id: "sess-1", timestamp: now,
      },
      // path-quiz: confidence 1.0, weight 0.5 → relative-paths (understands)
      {
        evidence_id: "sev-6", skill_id: "shell.nav.relative-paths", student_id: "s1",
        level: "understands", confidence: 1.0, weight: 0.5,
        source_type: "lab_step", source_id: "shell-navigation:path-quiz",
        session_id: "sess-1", timestamp: now,
      },
    ];

    const states = computeStudentSkillStates(evidence, "s1");

    // shell.nav.absolute-paths: applies 1.0
    const absPaths = states["shell.nav.absolute-paths"];
    expect(absPaths).toBeDefined();
    expect(absPaths.demonstrated).toBeCloseTo(1.0, 2);
    expect(absPaths.current_level).toBe("applies");
    expect(absPaths.evidence_count).toBe(1);

    // shell.nav.relative-paths: applies (1.0*0.85 + 0.5*0.70) / (1.0+0.5) = 0.80
    const relPaths = states["shell.nav.relative-paths"];
    expect(relPaths).toBeDefined();
    expect(relPaths.demonstrated).toBeCloseTo(0.80, 2);
    expect(relPaths.current_level).toBe("applies");
    expect(relPaths.evidence_count).toBe(3); // 2 applies + 1 understands

    // shell.nav.list-contents: applies 0.75
    const listContents = states["shell.nav.list-contents"];
    expect(listContents).toBeDefined();
    expect(listContents.demonstrated).toBeCloseTo(0.75, 2);
    expect(listContents.current_level).toBe("applies");

    // shell.nav.path-concepts: understands 1.0
    const pathConcepts = states["shell.nav.path-concepts"];
    expect(pathConcepts).toBeDefined();
    expect(pathConcepts.demonstrated).toBeCloseTo(1.0, 2);
    expect(pathConcepts.current_level).toBe("understands");
  });

  test("returns empty record when no evidence", () => {
    const states = computeStudentSkillStates([], "s1");
    expect(Object.keys(states).length).toBe(0);
  });
});

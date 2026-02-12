// Skill Query API
// Query student skills, gap analysis, and skill grouping by level

import type {
  SkillState,
  SkillDefinition,
  QMatrixEntry,
  SkillGap,
  GapAnalysis,
  ProficiencyLevel,
  ProficiencyThresholds,
} from "./types";
import { DEFAULT_THRESHOLDS } from "./types";

// ============================================================================
// STUDENT SKILL QUERY
// ============================================================================

export interface StudentSkillSummary {
  skill_id: string;
  skill_name: string;
  demonstrated: number;
  current_level: ProficiencyLevel | "unassessed";
  evidence_count: number;
}

/**
 * Get all skill states for a student, enriched with skill names from catalog.
 */
export function getStudentSkills(
  states: Record<string, SkillState>,
  catalog: SkillDefinition[]
): StudentSkillSummary[] {
  const nameMap = new Map(catalog.map((s) => [s.id, s.name]));

  return Object.values(states).map((state) => ({
    skill_id: state.skill_id,
    skill_name: nameMap.get(state.skill_id) || state.skill_id,
    demonstrated: state.demonstrated,
    current_level: state.current_level,
    evidence_count: state.evidence_count,
  }));
}

// ============================================================================
// SKILLS BY LEVEL (compatible with mentor workspace RoleContext.skills)
// ============================================================================

export interface SkillsByLevel {
  mastered: string[]; // skill IDs at "applies" level
  inProgress: string[]; // skill IDs with some evidence but below "applies"
  notStarted: string[]; // skill IDs with no evidence
}

/**
 * Group skills into mastered/inProgress/notStarted.
 * Compatible with existing RoleContext.skills structure.
 */
export function getSkillsByLevel(
  states: Record<string, SkillState>,
  catalog: SkillDefinition[]
): SkillsByLevel {
  const mastered: string[] = [];
  const inProgress: string[] = [];
  const notStarted: string[] = [];

  for (const skill of catalog) {
    const state = states[skill.id];
    if (!state) {
      notStarted.push(skill.id);
    } else if (state.current_level === "applies") {
      mastered.push(skill.id);
    } else {
      inProgress.push(skill.id);
    }
  }

  return { mastered, inProgress, notStarted };
}

// ============================================================================
// GAP ANALYSIS
// ============================================================================

/**
 * Analyze skill gaps for a target lab.
 * Returns which skills are mastered vs which have gaps for the target lab's requirements.
 */
export function getGapAnalysis(
  states: Record<string, SkillState>,
  catalog: SkillDefinition[],
  qmatrix: QMatrixEntry[],
  targetLabId: string,
  thresholds: ProficiencyThresholds = DEFAULT_THRESHOLDS
): GapAnalysis {
  // Find unique skills required by the target lab
  const labEntries = qmatrix.filter((e) => e.lab_id === targetLabId);
  const requiredSkillIds = [...new Set(labEntries.map((e) => e.skill_id))];

  const nameMap = new Map(catalog.map((s) => [s.id, s.name]));

  // Determine student_id from states
  const firstState = Object.values(states)[0];
  const studentId = firstState?.student_id || "unknown";

  const mastered: SkillGap[] = [];
  const gaps: SkillGap[] = [];

  for (const skillId of requiredSkillIds) {
    // Find the highest level required by any mapping for this skill in this lab
    const skillEntries = labEntries.filter((e) => e.skill_id === skillId);
    const requiredLevel = getHighestLevel(skillEntries.map((e) => e.level));

    const state = states[skillId];
    const currentLevel = state?.current_level || "unassessed";
    const currentConfidence = state?.demonstrated || 0;
    const threshold = thresholds[requiredLevel];
    const gap = threshold - currentConfidence;

    const skillGap: SkillGap = {
      skill_id: skillId,
      skill_name: nameMap.get(skillId) || skillId,
      required_level: requiredLevel,
      current_level: currentLevel,
      current_confidence: currentConfidence,
      gap: Math.max(0, gap),
    };

    if (gap <= 0) {
      mastered.push(skillGap);
    } else {
      gaps.push(skillGap);
    }
  }

  return {
    student_id: studentId,
    target_lab_id: targetLabId,
    mastered,
    gaps,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

const LEVEL_ORDER: Record<ProficiencyLevel, number> = {
  knows: 1,
  understands: 2,
  applies: 3,
};

function getHighestLevel(levels: ProficiencyLevel[]): ProficiencyLevel {
  return levels.reduce((highest, level) =>
    LEVEL_ORDER[level] > LEVEL_ORDER[highest] ? level : highest
  );
}

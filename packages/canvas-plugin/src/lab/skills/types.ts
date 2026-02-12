// Skill Graph Types
// Based on ARCH design: product/arch/docs/plans/2026-02-12-skill-taxonomy-design.md

import { randomUUID } from "crypto";

// ============================================================================
// PROFICIENCY
// ============================================================================

export type ProficiencyLevel = "knows" | "understands" | "applies";

export interface ProficiencyThresholds {
  knows: number; // default: 0.30
  understands: number; // default: 0.50
  applies: number; // default: 0.70
}

export const DEFAULT_THRESHOLDS: ProficiencyThresholds = {
  knows: 0.3,
  understands: 0.5,
  applies: 0.7,
};

// ============================================================================
// SKILL DEFINITION
// ============================================================================

export interface SkillDefinition {
  id: string; // "shell.nav.absolute-paths"
  name: string; // "Navigate with Absolute Paths"
  description: string;
  domain: string; // "shell"
  group: string; // "navigation"
  evidence_levels: ProficiencyLevel[]; // ["knows", "applies"]
  prerequisites: string[]; // ["shell.nav.absolute-paths"]
  tags: string[];
}

// ============================================================================
// Q-MATRIX
// ============================================================================

export interface QMatrixEntry {
  lab_id: string; // "shell-navigation"
  step_id: string; // "navigate-absolute"
  skill_id: string; // "shell.nav.absolute-paths"
  level: ProficiencyLevel;
  weight: number; // 0.0-1.0
}

// ============================================================================
// SKILL RELATIONSHIPS
// ============================================================================

export type RelationshipType = "prerequisite" | "related";

export interface SkillRelationship {
  from: string; // skill_id
  to: string; // skill_id
  type: RelationshipType;
}

// ============================================================================
// EVIDENCE
// ============================================================================

export type EvidenceSourceType =
  | "lab_step"
  | "tutor_assessment"
  | "self_report"
  | "external";

export interface SkillEvidence {
  evidence_id: string;
  skill_id: string;
  student_id: string;
  level: ProficiencyLevel;
  confidence: number; // 0.0-1.0 (pre-computed by source)
  weight: number; // from Q-matrix
  source_type: EvidenceSourceType;
  source_id: string; // e.g., "shell-navigation:navigate-absolute"
  session_id: string;
  timestamp: string; // ISO 8601
}

// ============================================================================
// SKILL STATE (per student, per skill)
// ============================================================================

export interface SkillState {
  skill_id: string;
  student_id: string;
  declared: ProficiencyLevel | null; // self-reported
  demonstrated: number; // 0.0-1.0 aggregated confidence
  current_level: ProficiencyLevel | "unassessed";
  evidence_count: number;
  last_evidence_at: string; // ISO 8601
}

// ============================================================================
// STUDENT SKILL PROFILE (collection of skill states)
// ============================================================================

export interface StudentSkillProfile {
  student_id: string;
  skills: Record<string, SkillState>; // keyed by skill_id
  evidence: SkillEvidence[]; // all evidence records
  updated_at: string;
}

// ============================================================================
// DECAY CONFIG
// ============================================================================

export interface DecayConfig {
  half_life_days: number; // default: 60
}

export const DEFAULT_DECAY: DecayConfig = {
  half_life_days: 60,
};

// ============================================================================
// GAP ANALYSIS (query result)
// ============================================================================

export interface SkillGap {
  skill_id: string;
  skill_name: string;
  required_level: ProficiencyLevel;
  current_level: ProficiencyLevel | "unassessed";
  current_confidence: number;
  gap: number; // threshold - current confidence (positive = gap exists)
}

export interface GapAnalysis {
  student_id: string;
  target_lab_id: string;
  mastered: SkillGap[]; // confidence >= threshold
  gaps: SkillGap[]; // confidence < threshold
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function generateSkillEvidenceId(): string {
  return `sev-${randomUUID().slice(0, 8)}`;
}

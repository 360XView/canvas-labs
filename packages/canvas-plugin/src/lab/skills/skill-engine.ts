// Skill Engine
// Evidence pipeline, aggregation with time decay, and level determination
// Consumes TaskEvidence from evidence-interpreter.ts, produces SkillEvidence and SkillState

import type { TaskEvidence } from "../telemetry/types";
import type {
  QMatrixEntry,
  SkillEvidence,
  SkillState,
  ProficiencyLevel,
  ProficiencyThresholds,
  DecayConfig,
} from "./types";
import { DEFAULT_THRESHOLDS, DEFAULT_DECAY, generateSkillEvidenceId } from "./types";

// ============================================================================
// EVIDENCE PIPELINE
// ============================================================================

/**
 * Produce SkillEvidence records from TaskEvidence using Q-matrix lookup.
 * Only completed steps produce skill evidence.
 */
export function produceSkillEvidence(
  taskEvidence: TaskEvidence[],
  qmatrix: QMatrixEntry[],
  labId: string
): SkillEvidence[] {
  // Build lookup: stepId → QMatrixEntry[]
  const stepToSkills = new Map<string, QMatrixEntry[]>();
  for (const entry of qmatrix) {
    if (entry.lab_id !== labId) continue;
    const existing = stepToSkills.get(entry.step_id) || [];
    existing.push(entry);
    stepToSkills.set(entry.step_id, existing);
  }

  const results: SkillEvidence[] = [];

  for (const te of taskEvidence) {
    // Only completed steps produce evidence
    if (te.status !== "completed") continue;

    const mappings = stepToSkills.get(te.step_id);
    if (!mappings) continue;

    for (const mapping of mappings) {
      results.push({
        evidence_id: generateSkillEvidenceId(),
        skill_id: mapping.skill_id,
        student_id: te.student_id,
        level: mapping.level,
        confidence: te.confidence,
        weight: mapping.weight,
        source_type: "lab_step",
        source_id: `${labId}:${te.step_id}`,
        session_id: te.session_id,
        timestamp: te.timestamp,
      });
    }
  }

  return results;
}

// ============================================================================
// TIME DECAY
// ============================================================================

/**
 * Compute exponential time decay factor.
 * decay(age) = e^(-λ × age_days)  where λ = ln(2) / half_life_days
 */
export function computeTimeDecay(ageDays: number, config: DecayConfig = DEFAULT_DECAY): number {
  const lambda = Math.LN2 / config.half_life_days;
  return Math.exp(-lambda * ageDays);
}

// ============================================================================
// AGGREGATION
// ============================================================================

/**
 * Aggregate skill confidence across multiple evidence records for a specific level.
 * Formula: Σ(weight_i × confidence_i × decay_i) / Σ(weight_i × decay_i)
 */
export function aggregateSkillConfidence(
  evidence: SkillEvidence[],
  level: ProficiencyLevel,
  config: DecayConfig = DEFAULT_DECAY
): number {
  const levelEvidence = evidence.filter((e) => e.level === level);
  if (levelEvidence.length === 0) return 0;

  const now = Date.now();
  let numerator = 0;
  let denominator = 0;

  for (const e of levelEvidence) {
    const ageDays = (now - new Date(e.timestamp).getTime()) / (24 * 60 * 60 * 1000);
    const decay = computeTimeDecay(Math.max(0, ageDays), config);
    numerator += e.weight * e.confidence * decay;
    denominator += e.weight * decay;
  }

  if (denominator === 0) return 0;
  return numerator / denominator;
}

// ============================================================================
// LEVEL DETERMINATION
// ============================================================================

/**
 * Determine the highest proficiency level met by the given confidence.
 * Checks from highest (applies) to lowest (knows).
 */
export function determineLevel(
  confidence: number,
  thresholds: ProficiencyThresholds = DEFAULT_THRESHOLDS
): ProficiencyLevel | "unassessed" {
  if (confidence >= thresholds.applies) return "applies";
  if (confidence >= thresholds.understands) return "understands";
  if (confidence >= thresholds.knows) return "knows";
  return "unassessed";
}

// ============================================================================
// STUDENT SKILL STATE COMPUTATION
// ============================================================================

/**
 * Compute skill states for a student from all their evidence records.
 * Groups evidence by skill, aggregates per level, determines highest level.
 */
export function computeStudentSkillStates(
  evidence: SkillEvidence[],
  studentId: string,
  thresholds: ProficiencyThresholds = DEFAULT_THRESHOLDS,
  decayConfig: DecayConfig = DEFAULT_DECAY
): Record<string, SkillState> {
  // Group evidence by skill
  const bySkill = new Map<string, SkillEvidence[]>();
  for (const e of evidence) {
    if (e.student_id !== studentId) continue;
    const existing = bySkill.get(e.skill_id) || [];
    existing.push(e);
    bySkill.set(e.skill_id, existing);
  }

  const states: Record<string, SkillState> = {};

  for (const [skillId, skillEvidence] of bySkill) {
    // Aggregate for each level independently (per design doc Section 6.4)
    const appliesConf = aggregateSkillConfidence(skillEvidence, "applies", decayConfig);
    const understandsConf = aggregateSkillConfidence(skillEvidence, "understands", decayConfig);
    const knowsConf = aggregateSkillConfidence(skillEvidence, "knows", decayConfig);

    // Determine level: check each level independently from highest to lowest
    // "demonstrated" is the confidence at the highest achieved level
    let currentLevel: ProficiencyLevel | "unassessed" = "unassessed";
    let demonstrated = 0;

    if (appliesConf >= thresholds.applies) {
      currentLevel = "applies";
      demonstrated = appliesConf;
    } else if (understandsConf >= thresholds.understands) {
      currentLevel = "understands";
      demonstrated = understandsConf;
    } else if (knowsConf >= thresholds.knows) {
      currentLevel = "knows";
      demonstrated = knowsConf;
    } else {
      // No threshold met — use the highest confidence we have
      demonstrated = Math.max(appliesConf, understandsConf, knowsConf);
    }

    // Find last evidence timestamp
    const lastTimestamp = skillEvidence.reduce(
      (latest, e) => (e.timestamp > latest ? e.timestamp : latest),
      skillEvidence[0].timestamp
    );

    states[skillId] = {
      skill_id: skillId,
      student_id: studentId,
      declared: null,
      demonstrated,
      current_level: currentLevel,
      evidence_count: skillEvidence.length,
      last_evidence_at: lastTimestamp,
    };
  }

  return states;
}

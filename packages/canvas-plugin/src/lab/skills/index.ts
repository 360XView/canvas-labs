// Skill Graph — Public API
// Re-exports for consumers of the skill graph subsystem

export type {
  ProficiencyLevel,
  ProficiencyThresholds,
  SkillDefinition,
  QMatrixEntry,
  SkillRelationship,
  RelationshipType,
  SkillEvidence,
  EvidenceSourceType,
  SkillState,
  StudentSkillProfile,
  DecayConfig,
  SkillGap,
  GapAnalysis,
} from "./types";

export { DEFAULT_THRESHOLDS, DEFAULT_DECAY, generateSkillEvidenceId } from "./types";

export { loadSkillCatalog, loadQMatrix, loadRelationships } from "./skill-loader";

export {
  produceSkillEvidence,
  aggregateSkillConfidence,
  determineLevel,
  computeTimeDecay,
  computeStudentSkillStates,
} from "./skill-engine";

export { getStudentSkills, getGapAnalysis, getSkillsByLevel } from "./skill-query";
export type { StudentSkillSummary, SkillsByLevel } from "./skill-query";

export { saveStudentProfile, loadStudentProfile } from "./skill-store";

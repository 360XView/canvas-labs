// Skill Loader
// Loads skill catalog, Q-matrix, and relationships from YAML data files

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type {
  SkillDefinition,
  QMatrixEntry,
  SkillRelationship,
  ProficiencyLevel,
} from "./types";

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// YAML SCHEMA TYPES (raw parsed shapes)
// ============================================================================

interface RawSkillCatalog {
  domain: { id: string; name: string; description: string };
  groups: Array<{
    id: string;
    name: string;
    skills: Array<{
      id: string;
      name: string;
      description: string;
      evidence_levels: string[];
      prerequisites: string[];
      tags: string[];
    }>;
  }>;
}

interface RawQMatrix {
  mappings: Array<{
    lab_id: string;
    step_id: string;
    skill_id: string;
    level: string;
    weight: number;
  }>;
}

interface RawRelationships {
  relationships: Array<{
    from: string;
    to: string;
    type: string;
  }>;
}

// ============================================================================
// LOADERS
// ============================================================================

/**
 * Load skill catalog from YAML file.
 * Returns flat array of SkillDefinition with domain/group populated.
 */
export function loadSkillCatalog(catalogId: string): SkillDefinition[] {
  const filePath = join(SKILLS_DIR, `${catalogId}-skills.yaml`);
  const content = readFileSync(filePath, "utf-8");
  const raw = yaml.load(content) as RawSkillCatalog;

  const skills: SkillDefinition[] = [];

  for (const group of raw.groups) {
    for (const skill of group.skills) {
      skills.push({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        domain: raw.domain.id,
        group: group.id,
        evidence_levels: skill.evidence_levels as ProficiencyLevel[],
        prerequisites: skill.prerequisites,
        tags: skill.tags,
      });
    }
  }

  return skills;
}

/**
 * Load Q-matrix from YAML file.
 * Returns array of step→skill mappings.
 */
export function loadQMatrix(catalogId: string): QMatrixEntry[] {
  const filePath = join(SKILLS_DIR, `${catalogId}-qmatrix.yaml`);
  const content = readFileSync(filePath, "utf-8");
  const raw = yaml.load(content) as RawQMatrix;

  return raw.mappings.map((m) => ({
    lab_id: m.lab_id,
    step_id: m.step_id,
    skill_id: m.skill_id,
    level: m.level as ProficiencyLevel,
    weight: m.weight,
  }));
}

/**
 * Load skill relationships from YAML file.
 */
export function loadRelationships(catalogId: string): SkillRelationship[] {
  const filePath = join(SKILLS_DIR, `${catalogId}-relationships.yaml`);
  const content = readFileSync(filePath, "utf-8");
  const raw = yaml.load(content) as RawRelationships;

  return raw.relationships.map((r) => ({
    from: r.from,
    to: r.to,
    type: r.type as SkillRelationship["type"],
  }));
}

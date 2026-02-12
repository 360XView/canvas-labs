// Skill Loader Tests
// Tests for loading skill catalog, Q-matrix, and relationships from YAML

import { describe, test, expect } from "bun:test";
import {
  loadSkillCatalog,
  loadQMatrix,
  loadRelationships,
} from "../skill-loader";
import type { SkillDefinition, QMatrixEntry, SkillRelationship } from "../types";

describe("loadSkillCatalog", () => {
  test("loads all 27 skills from shell-mastery catalog", () => {
    const skills = loadSkillCatalog("shell-mastery");
    expect(skills.length).toBe(27);
  });

  test("each skill has required fields", () => {
    const skills = loadSkillCatalog("shell-mastery");
    for (const skill of skills) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.domain).toBe("shell");
      expect(skill.group).toBeTruthy();
      expect(skill.evidence_levels.length).toBeGreaterThan(0);
      expect(Array.isArray(skill.prerequisites)).toBe(true);
      expect(Array.isArray(skill.tags)).toBe(true);
    }
  });

  test("skill IDs follow dot-separated format", () => {
    const skills = loadSkillCatalog("shell-mastery");
    for (const skill of skills) {
      expect(skill.id).toMatch(/^shell\.\w+\.\w[\w-]*$/);
    }
  });

  test("groups are correctly assigned", () => {
    const skills = loadSkillCatalog("shell-mastery");
    const groups = new Set(skills.map((s) => s.group));
    expect(groups).toEqual(new Set(["nav", "files", "text", "find", "script", "analysis"]));
  });

  test("navigation group has 4 skills", () => {
    const skills = loadSkillCatalog("shell-mastery");
    const navSkills = skills.filter((s) => s.group === "nav");
    expect(navSkills.length).toBe(4);
  });

  test("prerequisites reference valid skill IDs", () => {
    const skills = loadSkillCatalog("shell-mastery");
    const allIds = new Set(skills.map((s) => s.id));
    for (const skill of skills) {
      for (const prereq of skill.prerequisites) {
        expect(allIds.has(prereq)).toBe(true);
      }
    }
  });

  test("evidence_levels contain valid proficiency levels", () => {
    const validLevels = new Set(["knows", "understands", "applies"]);
    const skills = loadSkillCatalog("shell-mastery");
    for (const skill of skills) {
      for (const level of skill.evidence_levels) {
        expect(validLevels.has(level)).toBe(true);
      }
    }
  });
});

describe("loadQMatrix", () => {
  test("loads all 65 mappings from shell-mastery Q-matrix", () => {
    const entries = loadQMatrix("shell-mastery");
    expect(entries.length).toBe(65);
  });

  test("each entry has required fields", () => {
    const entries = loadQMatrix("shell-mastery");
    for (const entry of entries) {
      expect(entry.lab_id).toBeTruthy();
      expect(entry.step_id).toBeTruthy();
      expect(entry.skill_id).toBeTruthy();
      expect(["knows", "understands", "applies"]).toContain(entry.level);
      expect(entry.weight).toBeGreaterThan(0);
      expect(entry.weight).toBeLessThanOrEqual(1.0);
    }
  });

  test("all 6 labs are represented", () => {
    const entries = loadQMatrix("shell-mastery");
    const labs = new Set(entries.map((e) => e.lab_id));
    expect(labs).toEqual(
      new Set([
        "shell-navigation",
        "shell-file-operations",
        "shell-text-processing",
        "shell-find-files",
        "shell-bash-scripting",
        "shell-log-analysis",
      ])
    );
  });

  test("skill IDs in Q-matrix match skill catalog", () => {
    const skills = loadSkillCatalog("shell-mastery");
    const entries = loadQMatrix("shell-mastery");
    const catalogIds = new Set(skills.map((s) => s.id));
    for (const entry of entries) {
      expect(catalogIds.has(entry.skill_id)).toBe(true);
    }
  });

  test("shell-navigation lab has 6 mappings", () => {
    const entries = loadQMatrix("shell-mastery");
    const navEntries = entries.filter((e) => e.lab_id === "shell-navigation");
    expect(navEntries.length).toBe(6);
  });

  test("shell-log-analysis capstone has 20 mappings", () => {
    const entries = loadQMatrix("shell-mastery");
    const capstoneEntries = entries.filter((e) => e.lab_id === "shell-log-analysis");
    expect(capstoneEntries.length).toBe(20);
  });
});

describe("loadRelationships", () => {
  test("loads relationships from shell-mastery", () => {
    const rels = loadRelationships("shell-mastery");
    expect(rels.length).toBeGreaterThan(0);
  });

  test("each relationship has required fields", () => {
    const rels = loadRelationships("shell-mastery");
    for (const rel of rels) {
      expect(rel.from).toBeTruthy();
      expect(rel.to).toBeTruthy();
      expect(["prerequisite", "related"]).toContain(rel.type);
    }
  });

  test("relationship skill IDs match catalog", () => {
    const skills = loadSkillCatalog("shell-mastery");
    const rels = loadRelationships("shell-mastery");
    const catalogIds = new Set(skills.map((s) => s.id));
    for (const rel of rels) {
      expect(catalogIds.has(rel.from)).toBe(true);
      expect(catalogIds.has(rel.to)).toBe(true);
    }
  });

  test("has both prerequisite and related types", () => {
    const rels = loadRelationships("shell-mastery");
    const types = new Set(rels.map((r) => r.type));
    expect(types.has("prerequisite")).toBe(true);
    expect(types.has("related")).toBe(true);
  });
});

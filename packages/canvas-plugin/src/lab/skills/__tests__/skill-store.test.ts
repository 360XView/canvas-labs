// Skill Store Tests
// Tests for persisting and loading student skill profiles

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { saveStudentProfile, loadStudentProfile } from "../skill-store";
import type { StudentSkillProfile, SkillEvidence, SkillState } from "../types";

describe("skill-store", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "skill-store-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeSampleProfile(): StudentSkillProfile {
    const now = new Date().toISOString();
    return {
      student_id: "student-1",
      skills: {
        "shell.nav.absolute-paths": {
          skill_id: "shell.nav.absolute-paths",
          student_id: "student-1",
          declared: null,
          demonstrated: 1.0,
          current_level: "applies",
          evidence_count: 1,
          last_evidence_at: now,
        },
        "shell.nav.relative-paths": {
          skill_id: "shell.nav.relative-paths",
          student_id: "student-1",
          declared: "knows",
          demonstrated: 0.80,
          current_level: "applies",
          evidence_count: 3,
          last_evidence_at: now,
        },
      },
      evidence: [
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
          timestamp: now,
        },
      ],
      updated_at: now,
    };
  }

  test("saves and loads a student profile round-trip", () => {
    const profile = makeSampleProfile();

    saveStudentProfile(profile, tempDir);
    const loaded = loadStudentProfile("student-1", tempDir);

    expect(loaded).not.toBeNull();
    expect(loaded!.student_id).toBe("student-1");
    expect(Object.keys(loaded!.skills).length).toBe(2);
    expect(loaded!.skills["shell.nav.absolute-paths"].demonstrated).toBe(1.0);
    expect(loaded!.skills["shell.nav.relative-paths"].current_level).toBe("applies");
    expect(loaded!.evidence.length).toBe(1);
  });

  test("returns null when profile does not exist", () => {
    const loaded = loadStudentProfile("nonexistent", tempDir);
    expect(loaded).toBeNull();
  });

  test("overwrites existing profile on save", () => {
    const profile1 = makeSampleProfile();
    saveStudentProfile(profile1, tempDir);

    const profile2 = makeSampleProfile();
    profile2.skills["shell.nav.absolute-paths"].demonstrated = 0.5;
    profile2.updated_at = new Date().toISOString();
    saveStudentProfile(profile2, tempDir);

    const loaded = loadStudentProfile("student-1", tempDir);
    expect(loaded!.skills["shell.nav.absolute-paths"].demonstrated).toBe(0.5);
  });

  test("preserves declared field values", () => {
    const profile = makeSampleProfile();
    saveStudentProfile(profile, tempDir);

    const loaded = loadStudentProfile("student-1", tempDir);
    expect(loaded!.skills["shell.nav.absolute-paths"].declared).toBeNull();
    expect(loaded!.skills["shell.nav.relative-paths"].declared).toBe("knows");
  });

  test("creates directory structure if it does not exist", () => {
    const nestedDir = join(tempDir, "profiles", "nested");
    const profile = makeSampleProfile();

    saveStudentProfile(profile, nestedDir);

    expect(existsSync(nestedDir)).toBe(true);
    const loaded = loadStudentProfile("student-1", nestedDir);
    expect(loaded).not.toBeNull();
  });
});

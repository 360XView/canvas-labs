import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";
import { getMemoryDir, getSessionsDir } from "../defaults";
import { ensureMemoryDir, pruneOldSessions, generateMemoryContext, generateSkillSnapshot, snapshotMemory, restoreMemory } from "../memory";
import type { SkillState, SkillDefinition } from "../../lab/skills/types";

describe("path helpers", () => {
  test("getMemoryDir returns memory path under profile dir", () => {
    const result = getMemoryDir("test-user");
    expect(result).toBe(
      join(homedir(), ".claude", "tutor", "profiles", "test-user", "memory")
    );
  });

  test("getSessionsDir returns sessions path under memory dir", () => {
    const result = getSessionsDir("test-user");
    expect(result).toBe(
      join(
        homedir(),
        ".claude",
        "tutor",
        "profiles",
        "test-user",
        "memory",
        "sessions"
      )
    );
  });
});

describe("ensureMemoryDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tutor-memory-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("creates memory/ and memory/sessions/ directories", () => {
    const profileDir = join(tempDir, "test-profile");
    mkdirSync(profileDir, { recursive: true });

    ensureMemoryDir(profileDir);

    expect(existsSync(join(profileDir, "memory"))).toBe(true);
    expect(existsSync(join(profileDir, "memory", "sessions"))).toBe(true);
  });

  test("is idempotent — does not error if dirs already exist", () => {
    const profileDir = join(tempDir, "test-profile");
    mkdirSync(join(profileDir, "memory", "sessions"), { recursive: true });

    expect(() => ensureMemoryDir(profileDir)).not.toThrow();
  });
});

describe("pruneOldSessions", () => {
  let tempDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tutor-prune-test-"));
    sessionsDir = join(tempDir, "memory", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("keeps last N sessions by filename sort, deletes older", () => {
    for (let i = 1; i <= 7; i++) {
      const name = `2026-02-${String(i).padStart(2, "0")}-shell-nav.md`;
      writeFileSync(join(sessionsDir, name), `# Session ${i}`);
    }

    pruneOldSessions(tempDir, 5);

    const remaining = readdirSync(sessionsDir).sort();
    expect(remaining).toEqual([
      "2026-02-03-shell-nav.md",
      "2026-02-04-shell-nav.md",
      "2026-02-05-shell-nav.md",
      "2026-02-06-shell-nav.md",
      "2026-02-07-shell-nav.md",
    ]);
  });

  test("does nothing when fewer than N sessions exist", () => {
    writeFileSync(join(sessionsDir, "2026-02-01-nav.md"), "# Session 1");
    writeFileSync(join(sessionsDir, "2026-02-02-files.md"), "# Session 2");

    pruneOldSessions(tempDir, 5);

    const remaining = readdirSync(sessionsDir);
    expect(remaining.length).toBe(2);
  });

  test("does nothing when sessions dir does not exist", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "tutor-empty-"));
    expect(() => pruneOldSessions(emptyDir, 5)).not.toThrow();
    rmSync(emptyDir, { recursive: true, force: true });
  });

  test("ignores non-.md files in sessions dir", () => {
    writeFileSync(join(sessionsDir, "2026-02-01-nav.md"), "# Session 1");
    writeFileSync(join(sessionsDir, ".DS_Store"), "");

    pruneOldSessions(tempDir, 5);

    const remaining = readdirSync(sessionsDir);
    expect(remaining).toContain("2026-02-01-nav.md");
    expect(remaining).toContain(".DS_Store");
  });
});

describe("generateMemoryContext", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tutor-ctx-test-"));
    mkdirSync(join(tempDir, "memory", "sessions"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns new-student message when no memory exists", () => {
    const result = generateMemoryContext(tempDir);
    expect(result).toContain("No prior memory");
    expect(result).toContain("No previous sessions");
  });

  test("includes MEMORY.md content when it exists", () => {
    writeFileSync(
      join(tempDir, "memory", "MEMORY.md"),
      "# Alice — Tutor Notes\n\n## Learning Approach\nExplorer type."
    );

    const result = generateMemoryContext(tempDir);
    expect(result).toContain("Alice — Tutor Notes");
    expect(result).toContain("Explorer type");
  });

  test("includes most recent session file", () => {
    writeFileSync(
      join(tempDir, "memory", "sessions", "2026-02-10-nav.md"),
      "# Session: Navigation\nOlder session"
    );
    writeFileSync(
      join(tempDir, "memory", "sessions", "2026-02-12-files.md"),
      "# Session: File Operations\nMost recent session"
    );

    const result = generateMemoryContext(tempDir);
    expect(result).toContain("Most recent session");
    expect(result).not.toContain("Older session");
  });

  test("formats with Student Memory header and subsections", () => {
    writeFileSync(
      join(tempDir, "memory", "MEMORY.md"),
      "# Notes\nSome notes."
    );
    writeFileSync(
      join(tempDir, "memory", "sessions", "2026-02-12-nav.md"),
      "# Session\nSession content."
    );

    const result = generateMemoryContext(tempDir);
    expect(result).toContain("## Student Memory");
    expect(result).toContain("### Last Session");
  });

  test("handles MEMORY.md without session files", () => {
    writeFileSync(
      join(tempDir, "memory", "MEMORY.md"),
      "# Notes\nSome notes."
    );

    const result = generateMemoryContext(tempDir);
    expect(result).toContain("Some notes");
    expect(result).toContain("No previous sessions");
  });

  test("handles session files without MEMORY.md", () => {
    writeFileSync(
      join(tempDir, "memory", "sessions", "2026-02-12-nav.md"),
      "# Session\nSession content."
    );

    const result = generateMemoryContext(tempDir);
    expect(result).toContain("No prior memory");
    expect(result).toContain("Session content");
  });
});

describe("generateSkillSnapshot", () => {
  const catalog: SkillDefinition[] = [
    { id: "shell.nav.abs", name: "Absolute Paths", description: "", domain: "shell", group: "nav", evidence_levels: ["applies"], prerequisites: [], tags: [] },
    { id: "shell.nav.rel", name: "Relative Paths", description: "", domain: "shell", group: "nav", evidence_levels: ["applies"], prerequisites: [], tags: [] },
    { id: "shell.files.cat", name: "View Files", description: "", domain: "shell", group: "files", evidence_levels: ["applies"], prerequisites: [], tags: [] },
    { id: "shell.files.grep", name: "Search Files", description: "", domain: "shell", group: "files", evidence_levels: ["applies"], prerequisites: [], tags: [] },
    { id: "shell.pipes", name: "Pipes", description: "", domain: "shell", group: "pipes", evidence_levels: ["applies"], prerequisites: [], tags: [] },
    { id: "shell.redirect", name: "Redirect", description: "", domain: "shell", group: "redirect", evidence_levels: ["applies"], prerequisites: [], tags: [] },
  ];

  function makeState(id: string, demonstrated: number, level: string): SkillState {
    return {
      skill_id: id,
      student_id: "test",
      declared: null,
      demonstrated,
      current_level: level as any,
      evidence_count: 3,
      last_evidence_at: "2026-02-12T00:00:00Z",
    };
  }

  test("returns empty string when no states exist", () => {
    const result = generateSkillSnapshot({}, catalog);
    expect(result).toBe("");
  });

  test("lists top strengths and weaknesses", () => {
    const states: Record<string, SkillState> = {
      "shell.nav.abs": makeState("shell.nav.abs", 0.9, "applies"),
      "shell.nav.rel": makeState("shell.nav.rel", 0.8, "applies"),
      "shell.files.cat": makeState("shell.files.cat", 0.75, "applies"),
      "shell.files.grep": makeState("shell.files.grep", 0.3, "knows"),
      "shell.redirect": makeState("shell.redirect", 0.2, "knows"),
    };

    const result = generateSkillSnapshot(states, catalog);
    expect(result).toContain("Strengths");
    expect(result).toContain("Absolute Paths");
    expect(result).toContain("Weaknesses");
    expect(result).toContain("Redirect");
  });

  test("lists unassessed skills", () => {
    const states: Record<string, SkillState> = {
      "shell.nav.abs": makeState("shell.nav.abs", 0.9, "applies"),
    };

    const result = generateSkillSnapshot(states, catalog);
    expect(result).toContain("Not yet assessed");
  });
});

describe("test fixtures", () => {
  const fixturesDir = join(__dirname, "../../../test/fixtures/profiles");

  test("blank-slate has no MEMORY.md", () => {
    const result = generateMemoryContext(join(fixturesDir, "blank-slate"));
    expect(result).toContain("No prior memory");
  });

  test("one-session-alice has MEMORY.md and 1 session file", () => {
    const result = generateMemoryContext(join(fixturesDir, "one-session-alice"));
    expect(result).toContain("Alice");
    expect(result).toContain("Last Session");
    expect(result).not.toContain("No previous sessions");
  });

  test("three-session-alice has rich memory and latest session", () => {
    const result = generateMemoryContext(join(fixturesDir, "three-session-alice"));
    expect(result).toContain("Explorer type");
    expect(result).toContain("redirect");
  });

  test("struggling-bob has frustration flags", () => {
    const result = generateMemoryContext(join(fixturesDir, "struggling-bob"));
    expect(result).toContain("WATCH");
    expect(result).toContain("Bob");
  });

  test("fast-learner-carol shows accelerated progress", () => {
    const result = generateMemoryContext(join(fixturesDir, "fast-learner-carol"));
    expect(result).toContain("Carol");
  });
});

describe("snapshot and restore", () => {
  let tempDir: string;
  let snapshotDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tutor-snap-test-"));
    snapshotDir = mkdtempSync(join(tmpdir(), "tutor-snap-dest-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(snapshotDir, { recursive: true, force: true });
  });

  test("snapshot copies memory dir to destination", () => {
    mkdirSync(join(tempDir, "memory", "sessions"), { recursive: true });
    writeFileSync(join(tempDir, "memory", "MEMORY.md"), "# Notes\nTest.");
    writeFileSync(join(tempDir, "memory", "sessions", "2026-02-12-nav.md"), "# Session");

    snapshotMemory(tempDir, snapshotDir);

    expect(existsSync(join(snapshotDir, "memory", "MEMORY.md"))).toBe(true);
    expect(existsSync(join(snapshotDir, "memory", "sessions", "2026-02-12-nav.md"))).toBe(true);
    expect(readFileSync(join(snapshotDir, "memory", "MEMORY.md"), "utf-8")).toContain("Test");
  });

  test("restore overwrites memory dir from source", () => {
    // Set up existing memory
    mkdirSync(join(tempDir, "memory", "sessions"), { recursive: true });
    writeFileSync(join(tempDir, "memory", "MEMORY.md"), "# Modified");

    // Set up snapshot source
    mkdirSync(join(snapshotDir, "memory", "sessions"), { recursive: true });
    writeFileSync(join(snapshotDir, "memory", "MEMORY.md"), "# Original");
    writeFileSync(join(snapshotDir, "memory", "sessions", "2026-02-10-old.md"), "# Old");

    restoreMemory(snapshotDir, tempDir);

    expect(readFileSync(join(tempDir, "memory", "MEMORY.md"), "utf-8")).toContain("Original");
    expect(existsSync(join(tempDir, "memory", "sessions", "2026-02-10-old.md"))).toBe(true);
  });

  test("snapshot handles empty memory dir", () => {
    mkdirSync(join(tempDir, "memory", "sessions"), { recursive: true });

    expect(() => snapshotMemory(tempDir, snapshotDir)).not.toThrow();
    expect(existsSync(join(snapshotDir, "memory", "sessions"))).toBe(true);
  });
});

describe("memory lifecycle integration", () => {
  let profileDir: string;

  beforeEach(() => {
    profileDir = mkdtempSync(join(tmpdir(), "tutor-lifecycle-"));
  });

  afterEach(() => {
    rmSync(profileDir, { recursive: true, force: true });
  });

  test("full cycle: new student → session 1 → prune → snapshot → restore", () => {
    // 1. New student — empty memory
    ensureMemoryDir(profileDir);
    const ctx1 = generateMemoryContext(profileDir);
    expect(ctx1).toContain("No prior memory");
    expect(ctx1).toContain("No previous sessions");

    // 2. Simulate tutor writing session 1 observations
    const sessionsDir = join(profileDir, "memory", "sessions");
    writeFileSync(
      join(sessionsDir, "2026-02-12-shell-navigation.md"),
      "# Session: Shell Navigation\n**Date:** 2026-02-12\n**Outcome:** Completed\n\n## Observations\nJumps into tasks immediately."
    );
    writeFileSync(
      join(profileDir, "memory", "MEMORY.md"),
      "# Student Notes\n\n## Learning Approach\nExplorer type: jumps in first.\n\n## Flags\n- WATCH: relative paths"
    );

    // 3. Load memory for session 2 — should see observations
    const ctx2 = generateMemoryContext(profileDir);
    expect(ctx2).toContain("Explorer type");
    expect(ctx2).toContain("Shell Navigation");
    expect(ctx2).toContain("WATCH");

    // 4. Simulate more sessions
    for (let i = 1; i <= 6; i++) {
      writeFileSync(
        join(sessionsDir, `2026-02-${String(12 + i).padStart(2, "0")}-lab-${i}.md`),
        `# Session ${i}`
      );
    }

    // 5. Prune — should keep only 5 most recent
    pruneOldSessions(profileDir, 5);
    const remaining = readdirSync(sessionsDir).filter((f) => f.endsWith(".md")).sort();
    expect(remaining.length).toBe(5);
    expect(remaining[0]).toBe("2026-02-14-lab-2.md"); // oldest kept

    // 6. Snapshot and restore
    const snapshotDest = mkdtempSync(join(tmpdir(), "tutor-snap-"));
    snapshotMemory(profileDir, snapshotDest);

    // Modify original
    writeFileSync(join(profileDir, "memory", "MEMORY.md"), "# Modified");

    // Restore from snapshot
    restoreMemory(snapshotDest, profileDir);
    const ctx3 = generateMemoryContext(profileDir);
    expect(ctx3).toContain("Explorer type"); // Original content restored

    rmSync(snapshotDest, { recursive: true, force: true });
  });
});

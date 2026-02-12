import { describe, test, expect } from "bun:test";
import { generateTutorCLAUDEmd } from "../prompts/tutor-prompt";

describe("tutor prompt memory integration", () => {
  test("generated CLAUDE.md includes Student Memory section", () => {
    const result = generateTutorCLAUDEmd({
      moduleId: "linux-user-management",
      logDir: "/tmp/test-logs",
      profileName: "default",
      progress: null,
    });

    expect(result).toContain("## Student Memory");
  });

  test("generated CLAUDE.md includes memory write instructions", () => {
    const result = generateTutorCLAUDEmd({
      moduleId: "linux-user-management",
      logDir: "/tmp/test-logs",
      profileName: "default",
      progress: null,
    });

    expect(result).toContain("TUTOR:SESSION_END");
    expect(result).toContain("memory/sessions/");
    expect(result).toContain("MEMORY.md");
  });

  test("generated CLAUDE.md includes Memory section with write template", () => {
    const result = generateTutorCLAUDEmd({
      moduleId: "linux-user-management",
      logDir: "/tmp/test-logs",
      profileName: "default",
      progress: null,
    });

    expect(result).toContain("## Memory");
    expect(result).toContain("What to write:");
    expect(result).toContain("What NOT to write:");
  });
});

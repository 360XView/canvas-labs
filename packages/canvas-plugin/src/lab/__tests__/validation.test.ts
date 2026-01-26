// Test cases for validation rules
// Run BEFORE implementing validation-rules.ts to define expected behavior

import { describe, test, expect, beforeAll } from "bun:test";

// Import the validation rules
import { validateCommand, getValidationRules, type ValidationRule, type CommandLogEntry } from "../validation-rules";

describe("Root user validation", () => {
  let rules: ValidationRule[];

  beforeAll(() => {
    rules = getValidationRules("linux-user-management");
  });

  function makeEntry(command: string, user: string): CommandLogEntry {
    return {
      timestamp: new Date().toISOString(),
      user,
      pwd: "/root",
      command,
    };
  }

  test("matches when 'sudo su' command is executed by student", () => {
    // The sudo su command itself is executed by the student user
    // (not root yet, but this triggers the step completion)
    const result = validateCommand(makeEntry("sudo su", "student"), rules);
    expect(result).not.toBeNull();
    expect(result?.stepId).toBe("become-root");
  });

  test("matches when 'sudo su -' command is executed", () => {
    // Also matches with dash for login shell
    const result = validateCommand(makeEntry("sudo su -", "student"), rules);
    expect(result).not.toBeNull();
    expect(result?.stepId).toBe("become-root");
  });

  test("matches variations of su command", () => {
    // Should match both 'sudo su' and just 'su'
    const result1 = validateCommand(makeEntry("sudo su", "student"), rules);
    expect(result1?.stepId).toBe("become-root");

    const result2 = validateCommand(makeEntry("su", "student"), rules);
    expect(result2?.stepId).toBe("become-root");
  });

  test("rejects unrelated commands", () => {
    // Commands that don't match the pattern
    const result = validateCommand(makeEntry("whoami", "student"), rules);
    expect(result?.stepId).not.toBe("become-root");
  });
});

// Check-based validation tests
// These steps are validated by check scripts, not command patterns
describe("Check-based steps (no command validation)", () => {
  let rules: ValidationRule[];

  beforeAll(() => {
    rules = getValidationRules("linux-user-management");
  });

  function makeEntry(command: string, user: string = "root"): CommandLogEntry {
    return {
      timestamp: new Date().toISOString(),
      user,
      pwd: "/root",
      command,
    };
  }

  test("useradd command does not trigger create-user (check-based)", () => {
    const result = validateCommand(makeEntry("useradd -m devuser"), rules);
    // Should match become-root (user is root) but NOT create-user
    expect(result?.stepId).not.toBe("create-user");
  });

  test("chmod command does not trigger set-permissions (check-based)", () => {
    const result = validateCommand(makeEntry("chmod 750 /home/devuser"), rules);
    expect(result?.stepId).not.toBe("set-permissions");
  });

  test("usermod command does not trigger add-to-group (check-based)", () => {
    const result = validateCommand(makeEntry("usermod -aG developers devuser"), rules);
    expect(result?.stepId).not.toBe("add-to-group");
  });
});

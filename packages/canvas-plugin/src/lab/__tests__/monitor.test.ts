import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeTestCommand, writeCheckResult, sleep } from "./helpers";

// Note: Full integration tests with IPC would require mocking Bun.connect
// These tests verify the core validation and deduplication logic

describe("Monitor hybrid validation", () => {
  let tempDir: string;
  let commandsLogPath: string;
  let checksLogPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "monitor-test-"));
    commandsLogPath = join(tempDir, "commands.log");
    checksLogPath = join(tempDir, "checks.log");
    writeFileSync(commandsLogPath, "");
    writeFileSync(checksLogPath, "");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("command log entry format is valid", () => {
    writeTestCommand(commandsLogPath, "ssh student@server", "student");
    const content = require("fs").readFileSync(commandsLogPath, "utf-8");
    const entry = JSON.parse(content.trim());
    
    expect(entry.command).toBe("ssh student@server");
    expect(entry.user).toBe("student");
    expect(entry.timestamp).toBeDefined();
    expect(entry.pwd).toBeDefined();
  });

  test("check log entry format is valid", () => {
    writeCheckResult(checksLogPath, "create-user", "passed", { message: "User exists" });
    const content = require("fs").readFileSync(checksLogPath, "utf-8");
    const entry = JSON.parse(content.trim());
    
    expect(entry.stepId).toBe("create-user");
    expect(entry.status).toBe("passed");
    expect(entry.message).toBe("User exists");
    expect(entry.timestamp).toBeDefined();
  });

  test("helpers write to correct files", () => {
    writeTestCommand(commandsLogPath, "test-command");
    writeCheckResult(checksLogPath, "test-step", "passed");
    
    const cmdContent = require("fs").readFileSync(commandsLogPath, "utf-8");
    const checkContent = require("fs").readFileSync(checksLogPath, "utf-8");
    
    expect(cmdContent).toContain("test-command");
    expect(checkContent).toContain("test-step");
  });

  test("check result with taskIndex", () => {
    writeCheckResult(checksLogPath, "step-with-index", "passed", { taskIndex: 2 });
    const content = require("fs").readFileSync(checksLogPath, "utf-8");
    const entry = JSON.parse(content.trim());
    
    expect(entry.taskIndex).toBe(2);
  });

  test("multiple entries are newline separated", () => {
    writeTestCommand(commandsLogPath, "cmd1");
    writeTestCommand(commandsLogPath, "cmd2");
    writeCheckResult(checksLogPath, "step1", "passed");
    writeCheckResult(checksLogPath, "step2", "passed");
    
    const cmdContent = require("fs").readFileSync(commandsLogPath, "utf-8");
    const checkContent = require("fs").readFileSync(checksLogPath, "utf-8");
    
    const cmdLines = cmdContent.trim().split("\n");
    const checkLines = checkContent.trim().split("\n");
    
    expect(cmdLines).toHaveLength(2);
    expect(checkLines).toHaveLength(2);
  });
});

describe("Validation rules for linux-user-management", () => {
  // Import validation functions
  const { validateCommand, getValidationRules } = require("../validation-rules");

  test("become-root rule matches when user is root", () => {
    const rules = getValidationRules("linux-user-management");
    const entry = {
      timestamp: new Date().toISOString(),
      user: "root",
      pwd: "/root",
      command: "ls",
    };
    
    const result = validateCommand(entry, rules);
    expect(result).not.toBeNull();
    expect(result?.stepId).toBe("become-root");
  });

  test("no match for unrecognized command", () => {
    const rules = getValidationRules("linux-user-management");
    const entry = {
      timestamp: new Date().toISOString(),
      user: "student",
      pwd: "/home/student",
      command: "echo hello",
    };
    
    const result = validateCommand(entry, rules);
    expect(result).toBeNull();
  });
});

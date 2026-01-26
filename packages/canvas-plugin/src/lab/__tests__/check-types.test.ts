import { describe, test, expect } from "bun:test";
import { parseCheckLogEntry, type CheckLogEntry, type CheckConfig } from "../checks/types";

describe("CheckLogEntry validation", () => {
  test("valid passed entry", () => {
    const entry: CheckLogEntry = {
      stepId: "create-user",
      status: "passed",
      timestamp: "2026-01-21T10:30:45Z",
    };
    expect(entry.status).toBe("passed");
    expect(entry.stepId).toBe("create-user");
  });

  test("entry with optional fields", () => {
    const entry: CheckLogEntry = {
      stepId: "create-user",
      status: "passed",
      timestamp: "2026-01-21T10:30:45Z",
      taskIndex: 0,
      message: "User newuser exists",
    };
    expect(entry.taskIndex).toBe(0);
    expect(entry.message).toBe("User newuser exists");
  });

  test("failed status entry", () => {
    const entry: CheckLogEntry = {
      stepId: "set-permissions",
      status: "failed",
      timestamp: "2026-01-21T10:31:00Z",
      message: "Permissions not set correctly",
    };
    expect(entry.status).toBe("failed");
  });

  test("error status entry", () => {
    const entry: CheckLogEntry = {
      stepId: "check-service",
      status: "error",
      timestamp: "2026-01-21T10:32:00Z",
      message: "Script execution failed",
    };
    expect(entry.status).toBe("error");
  });
});

describe("parseCheckLogEntry", () => {
  test("parses valid JSON entry", () => {
    const line = '{"stepId":"create-user","status":"passed","timestamp":"2026-01-21T10:30:45Z"}';
    const entry = parseCheckLogEntry(line);
    expect(entry).not.toBeNull();
    expect(entry!.stepId).toBe("create-user");
    expect(entry!.status).toBe("passed");
  });

  test("parses entry with optional fields", () => {
    const line = '{"stepId":"create-user","status":"passed","timestamp":"2026-01-21T10:30:45Z","taskIndex":0,"message":"User exists"}';
    const entry = parseCheckLogEntry(line);
    expect(entry).not.toBeNull();
    expect(entry!.taskIndex).toBe(0);
    expect(entry!.message).toBe("User exists");
  });

  test("returns null for invalid JSON", () => {
    const entry = parseCheckLogEntry("not valid json");
    expect(entry).toBeNull();
  });

  test("returns null for missing required fields", () => {
    // Missing stepId
    const entry1 = parseCheckLogEntry('{"status":"passed","timestamp":"2026-01-21T10:30:45Z"}');
    expect(entry1).toBeNull();

    // Missing status
    const entry2 = parseCheckLogEntry('{"stepId":"create-user","timestamp":"2026-01-21T10:30:45Z"}');
    expect(entry2).toBeNull();

    // Missing timestamp
    const entry3 = parseCheckLogEntry('{"stepId":"create-user","status":"passed"}');
    expect(entry3).toBeNull();
  });

  test("returns null for invalid status value", () => {
    const entry = parseCheckLogEntry('{"stepId":"create-user","status":"invalid","timestamp":"2026-01-21T10:30:45Z"}');
    expect(entry).toBeNull();
  });

  test("handles empty string", () => {
    const entry = parseCheckLogEntry("");
    expect(entry).toBeNull();
  });
});

describe("CheckConfig type", () => {
  test("valid config with required fields", () => {
    const config: CheckConfig = {
      stepId: "create-user",
      script: "check-user-exists.sh",
    };
    expect(config.stepId).toBe("create-user");
    expect(config.script).toBe("check-user-exists.sh");
  });

  test("config with optional fields", () => {
    const config: CheckConfig = {
      stepId: "create-user",
      script: "check-user-exists.sh",
      pollIntervalMs: 3000,
      description: "Check if user exists",
    };
    expect(config.pollIntervalMs).toBe(3000);
    expect(config.description).toBe("Check if user exists");
  });
});

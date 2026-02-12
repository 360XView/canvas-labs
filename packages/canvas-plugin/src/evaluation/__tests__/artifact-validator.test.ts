import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { validateArtifacts } from "../artifact-validator";

describe("artifact validator", () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "artifact-test-"));
  });

  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  test("reports missing artifacts for empty directory", () => {
    const result = validateArtifacts(logDir);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("telemetry.jsonl");
    expect(result.missing).toContain("state.json");
    expect(result.missing).toContain("commands.log");
    expect(result.missing).toContain("checks.log");
  });

  test("reports empty artifacts", () => {
    writeFileSync(join(logDir, "telemetry.jsonl"), "");
    writeFileSync(join(logDir, "state.json"), "{}");
    writeFileSync(join(logDir, "commands.log"), "");
    writeFileSync(join(logDir, "checks.log"), "");
    const result = validateArtifacts(logDir);
    expect(result.valid).toBe(false);
    expect(result.empty).toContain("telemetry.jsonl");
  });

  test("validates complete artifacts", () => {
    writeFileSync(join(logDir, "telemetry.jsonl"), '{"event_type":"session_started"}\n');
    writeFileSync(join(logDir, "state.json"), '{"version":1,"steps":[]}');
    writeFileSync(join(logDir, "commands.log"), '{"command":"whoami"}\n');
    writeFileSync(join(logDir, "checks.log"), '{"stepId":"step-1","status":"passed"}\n');
    const result = validateArtifacts(logDir);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.empty).toHaveLength(0);
  });

  test("checks telemetry has expected event types", () => {
    const events = [
      '{"event_type":"session_started"}',
      '{"event_type":"step_started"}',
      '{"event_type":"student_action"}',
      '{"event_type":"check_passed"}',
      '{"event_type":"step_completed"}',
      '{"event_type":"session_ended"}',
    ].join("\n") + "\n";
    writeFileSync(join(logDir, "telemetry.jsonl"), events);
    writeFileSync(join(logDir, "state.json"), '{"version":1,"steps":[]}');
    writeFileSync(join(logDir, "commands.log"), '{"command":"whoami"}\n');
    writeFileSync(join(logDir, "checks.log"), '{"stepId":"s","status":"passed"}\n');

    const result = validateArtifacts(logDir);
    expect(result.telemetryEventTypes).toContain("session_started");
    expect(result.telemetryEventTypes).toContain("step_completed");
    expect(result.telemetryEventTypes).toContain("session_ended");
  });

  test("allows empty checks.log", () => {
    writeFileSync(join(logDir, "telemetry.jsonl"), '{"event_type":"session_started"}\n');
    writeFileSync(join(logDir, "state.json"), '{"version":1,"steps":[]}');
    writeFileSync(join(logDir, "commands.log"), '{"command":"whoami"}\n');
    writeFileSync(join(logDir, "checks.log"), "");
    const result = validateArtifacts(logDir);
    // checks.log can be empty if no checks have run yet
    expect(result.valid).toBe(true);
  });
});

// Tests for tutor control watcher and state writer

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { createTutorControlWatcher } from "../tutor-control/control-watcher";
import { createStateWriter } from "../tutor-control/state-writer";
import type { LabMessage } from "../../ipc/types";
import type { TutorCommandsFile } from "../tutor-control/types";

describe("TutorControlWatcher", () => {
  const testDir = `/tmp/test-tutor-control-${Date.now()}`;
  const commandsPath = join(testDir, "tutor-commands.json");
  let messages: LabMessage[] = [];
  let logs: string[] = [];

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(commandsPath, JSON.stringify({ commands: [] }, null, 2));
    messages = [];
    logs = [];
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("processes addStep command", async () => {
    const watcher = createTutorControlWatcher({
      logDir: testDir,
      sendMessage: (msg) => messages.push(msg),
      onLog: (msg) => logs.push(msg),
    });

    // Write a command
    const commandsFile: TutorCommandsFile = {
      commands: [{
        id: "test-cmd-1",
        type: "addStep",
        payload: {
          stepId: "bonus-task",
          step: {
            title: "Bonus: Test Task",
            type: "task",
            content: {
              instructions: "Do something extra",
              hints: ["Hint 1"],
            },
          },
        },
        status: "pending",
      }],
    };
    writeFileSync(commandsPath, JSON.stringify(commandsFile, null, 2));

    watcher.start();
    await Bun.sleep(100);
    watcher.stop();

    // Check that message was sent
    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe("addDynamicStep");
    if (messages[0].type === "addDynamicStep") {
      expect(messages[0].step.id).toBe("bonus-task");
      expect(messages[0].step.title).toBe("Bonus: Test Task");
      expect(messages[0].step.source).toBe("tutor");
    }

    // Check that status was updated
    const updated = JSON.parse(readFileSync(commandsPath, "utf-8")) as TutorCommandsFile;
    expect(updated.commands[0].status).toBe("done");
    expect(updated.commands[0].processedAt).toBeDefined();
  });

  test("processes markComplete command", async () => {
    const watcher = createTutorControlWatcher({
      logDir: testDir,
      sendMessage: (msg) => messages.push(msg),
      onLog: (msg) => logs.push(msg),
    });

    const commandsFile: TutorCommandsFile = {
      commands: [{
        id: "test-cmd-2",
        type: "markComplete",
        payload: {
          stepId: "bonus-task",
          source: "tutor",
        },
        status: "pending",
      }],
    };
    writeFileSync(commandsPath, JSON.stringify(commandsFile, null, 2));

    watcher.start();
    await Bun.sleep(100);
    watcher.stop();

    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe("taskCompleted");
    if (messages[0].type === "taskCompleted") {
      expect(messages[0].stepId).toBe("bonus-task");
      expect(messages[0].source).toBe("tutor");
    }
  });

  test("handles invalid JSON gracefully", async () => {
    const errors: Error[] = [];
    const watcher = createTutorControlWatcher({
      logDir: testDir,
      sendMessage: (msg) => messages.push(msg),
      onError: (err) => errors.push(err),
      onLog: (msg) => logs.push(msg),
    });

    writeFileSync(commandsPath, "{ invalid json }");

    watcher.start();
    await Bun.sleep(100);
    watcher.stop();

    // Should have logged an error but not crashed
    expect(errors.length).toBeGreaterThan(0);
    expect(messages.length).toBe(0);
  });

  test("skips already processed commands", async () => {
    const watcher = createTutorControlWatcher({
      logDir: testDir,
      sendMessage: (msg) => messages.push(msg),
      onLog: (msg) => logs.push(msg),
    });

    const commandsFile: TutorCommandsFile = {
      commands: [{
        id: "test-cmd-3",
        type: "markComplete",
        payload: {
          stepId: "already-done",
          source: "tutor",
        },
        status: "done", // Already processed
        processedAt: new Date().toISOString(),
      }],
    };
    writeFileSync(commandsPath, JSON.stringify(commandsFile, null, 2));

    watcher.start();
    await Bun.sleep(100);
    watcher.stop();

    // No new messages should be sent
    expect(messages.length).toBe(0);
  });
});

describe("StateWriter", () => {
  const testDir = `/tmp/test-state-writer-${Date.now()}`;
  const statePath = join(testDir, "state.json");
  let logs: string[] = [];

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    logs = [];
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("initializes state with step IDs", () => {
    const writer = createStateWriter({
      logDir: testDir,
      onLog: (msg) => logs.push(msg),
    });

    writer.initialize(["step-1", "step-2", "step-3"]);

    expect(existsSync(statePath)).toBe(true);
    const state = writer.getState();
    expect(state).not.toBeNull();
    expect(state!.steps.length).toBe(3);
    expect(state!.steps[0].id).toBe("step-1");
    expect(state!.steps[0].completed).toBe(false);
    expect(state!.steps[0].source).toBe("module");
  });

  test("marks step as completed", () => {
    const writer = createStateWriter({
      logDir: testDir,
      onLog: (msg) => logs.push(msg),
    });

    writer.initialize(["step-1", "step-2"]);
    writer.markCompleted("step-1", "check");

    const state = writer.getState();
    expect(state!.steps[0].completed).toBe(true);
    expect(state!.steps[0].completedBy).toBe("check");
    expect(state!.steps[0].completedAt).toBeDefined();
    expect(state!.steps[1].completed).toBe(false);
  });

  test("does not mark same step twice", () => {
    const writer = createStateWriter({
      logDir: testDir,
      onLog: (msg) => logs.push(msg),
    });

    writer.initialize(["step-1"]);
    writer.markCompleted("step-1", "command");
    const firstCompletedAt = writer.getState()!.steps[0].completedAt;

    // Try to mark again with different source
    writer.markCompleted("step-1", "tutor");

    const state = writer.getState();
    // Should still show original source
    expect(state!.steps[0].completedBy).toBe("command");
    expect(state!.steps[0].completedAt).toBe(firstCompletedAt);
  });

  test("adds dynamic step", () => {
    const writer = createStateWriter({
      logDir: testDir,
      onLog: (msg) => logs.push(msg),
    });

    writer.initialize(["intro", "task-1", "summary"]);
    writer.addStep("bonus-task", "task-1");

    const state = writer.getState();
    expect(state!.steps.length).toBe(4);
    // Should be inserted after task-1
    expect(state!.steps[2].id).toBe("bonus-task");
    expect(state!.steps[2].source).toBe("tutor");
    expect(state!.steps[2].completed).toBe(false);
  });

  test("adds step at end if afterStepId not found", () => {
    const writer = createStateWriter({
      logDir: testDir,
      onLog: (msg) => logs.push(msg),
    });

    writer.initialize(["step-1", "step-2"]);
    writer.addStep("bonus-task", "nonexistent");

    const state = writer.getState();
    expect(state!.steps.length).toBe(3);
    expect(state!.steps[2].id).toBe("bonus-task");
  });

  test("does not add duplicate step", () => {
    const writer = createStateWriter({
      logDir: testDir,
      onLog: (msg) => logs.push(msg),
    });

    writer.initialize(["step-1"]);
    writer.addStep("bonus-task");
    writer.addStep("bonus-task"); // Try to add again

    const state = writer.getState();
    expect(state!.steps.length).toBe(2);
  });
});

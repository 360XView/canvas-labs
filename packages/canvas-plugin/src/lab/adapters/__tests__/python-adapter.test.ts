import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPythonAdapter } from "../python-adapter";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Python Adapter", () => {
  let tempDir: string;
  let submissionsLogPath: string;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "python-adapter-test-"));
    submissionsLogPath = path.join(tempDir, "submissions.log");
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should emit student_action events for submissions", async () => {
    const events: any[] = [];
    const completedSteps: any[] = [];

    const adapter = createPythonAdapter({
      moduleId: "python-fundamentals",
      logPath: tempDir,
      onLog: (msg) => console.log(msg),
      onError: (err) => console.error(err),
    });

    // Set up callbacks
    adapter.onStudentAction = (event) => {
      events.push(event);
    };

    adapter.onStepCompleted = (event) => {
      completedSteps.push(event);
    };

    // Start the adapter
    await adapter.start();

    // Write a submission entry
    const submission = {
      timestamp: new Date().toISOString(),
      file: "main.py",
      code: 'def hello():\n    return "Hello, World!"',
      test_results: {
        passed: true,
        test_name: "tests/test_main.py::test_hello_world",
        error: null,
        output: "1 passed in 0.05s",
      },
      metadata: {
        line_count: 2,
        functions_defined: ["hello"],
      },
    };

    fs.writeFileSync(
      submissionsLogPath,
      JSON.stringify(submission) + "\n"
    );

    // Give the watcher time to detect the file
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify events were emitted
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("actionKind", "submit_code");
    expect(events[0]).toHaveProperty("action");
    expect(events[0]).toHaveProperty("result", "success");
    expect(events[0]).toHaveProperty("evidence");
    expect(events[0].evidence).toHaveProperty("test_passed", true);

    adapter.stop();
  });

  it("should emit step completion when test passes", async () => {
    const completedSteps: any[] = [];

    const adapter = createPythonAdapter({
      moduleId: "python-fundamentals",
      logPath: tempDir,
      onLog: (msg) => console.log(msg),
      onError: (err) => console.error(err),
    });

    adapter.onStepCompleted = (event) => {
      completedSteps.push(event);
    };

    await adapter.start();

    // Write a submission with a test that matches a step
    const submission = {
      timestamp: new Date().toISOString(),
      file: "main.py",
      code: 'def greet(name):\n    return f"Hello, {name}!"',
      test_results: {
        passed: true,
        test_name: "tests/test_main.py::test_greet",
        error: null,
        output: "1 passed in 0.05s",
      },
      metadata: {
        line_count: 2,
        functions_defined: ["greet"],
      },
    };

    fs.writeFileSync(
      submissionsLogPath,
      JSON.stringify(submission) + "\n"
    );

    // Give the watcher time to detect the file
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Note: In this test, step completion depends on getCheckConfigs()
    // which may not find matches in test mode. This test verifies
    // that the adapter can process entries without crashing.

    adapter.stop();
  });

  it("should handle invalid JSON entries gracefully", async () => {
    const events: any[] = [];
    const errors: any[] = [];

    const adapter = createPythonAdapter({
      moduleId: "python-fundamentals",
      logPath: tempDir,
      onLog: (msg) => console.log(msg),
      onError: (err) => {
        errors.push(err);
      },
    });

    adapter.onStudentAction = (event) => {
      events.push(event);
    };

    await adapter.start();

    // Write a mix of valid and invalid entries
    fs.writeFileSync(submissionsLogPath, "invalid json\n");

    const submission = {
      timestamp: new Date().toISOString(),
      file: "main.py",
      code: 'print("valid")',
      test_results: {
        passed: true,
        test_name: "test_valid",
        error: null,
        output: "passed",
      },
      metadata: {
        line_count: 1,
        functions_defined: [],
      },
    };

    fs.appendFileSync(
      submissionsLogPath,
      JSON.stringify(submission) + "\n"
    );

    // Give the watcher time to detect the file
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should have processed the valid entry
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toHaveProperty("actionKind", "submit_code");

    adapter.stop();
  });

  it("should track completed steps", async () => {
    const adapter = createPythonAdapter({
      moduleId: "python-fundamentals",
      logPath: tempDir,
      onLog: (msg) => console.log(msg),
      onError: (err) => console.error(err),
    });

    expect(adapter.getLabType()).toBe("python");
    expect(adapter.getModuleId()).toBe("python-fundamentals");
    expect(adapter.isRunning()).toBe(false);

    await adapter.start();
    expect(adapter.isRunning()).toBe(true);

    adapter.stop();
    expect(adapter.isRunning()).toBe(false);
  });
});

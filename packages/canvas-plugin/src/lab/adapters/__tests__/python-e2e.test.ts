import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createPythonAdapter } from "../python-adapter";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Python Adapter - End-to-End Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "python-e2e-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should emit complete event schema for successful code submission", async () => {
    let capturedEvent: any = null;

    const adapter = createPythonAdapter({
      moduleId: "python-fundamentals",
      logPath: tempDir,
    });

    adapter.onStudentAction = (event) => {
      capturedEvent = event;
    };

    await adapter.start();

    const submission = {
      timestamp: "2026-01-24T16:30:00.000Z",
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
      path.join(tempDir, "submissions.log"),
      JSON.stringify(submission) + "\n"
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    adapter.stop();

    // Verify the complete event schema
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent).toHaveProperty("actionKind", "submit_code");
    expect(capturedEvent).toHaveProperty("action");
    expect(capturedEvent.action).toContain("hello");
    expect(capturedEvent).toHaveProperty("result", "success");
    expect(capturedEvent).toHaveProperty("source", "tutor");
    expect(capturedEvent).toHaveProperty("timestamp", submission.timestamp);

    // Verify evidence structure
    expect(capturedEvent.evidence).toHaveProperty("file", "main.py");
    expect(capturedEvent.evidence).toHaveProperty("test_passed", true);
    expect(capturedEvent.evidence).toHaveProperty("test_name", "tests/test_main.py::test_hello_world");
    expect(capturedEvent.evidence).toHaveProperty("line_count", 2);
    expect(capturedEvent.evidence).toHaveProperty("functions_defined");
    expect(capturedEvent.evidence.functions_defined).toContain("hello");
  });

  it("should emit failure event for failed test", async () => {
    let capturedEvent: any = null;

    const adapter = createPythonAdapter({
      moduleId: "python-fundamentals",
      logPath: tempDir,
    });

    adapter.onStudentAction = (event) => {
      capturedEvent = event;
    };

    await adapter.start();

    const submission = {
      timestamp: "2026-01-24T16:31:00.000Z",
      file: "main.py",
      code: "def hello():\n    return 'wrong'",
      test_results: {
        passed: false,
        test_name: "tests/test_main.py::test_hello_world",
        error: "AssertionError: assert 'wrong' == 'Hello, World!'",
        output: "1 failed in 0.05s",
      },
      metadata: {
        line_count: 2,
        functions_defined: ["hello"],
      },
    };

    fs.writeFileSync(
      path.join(tempDir, "submissions.log"),
      JSON.stringify(submission) + "\n"
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    adapter.stop();

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.result).toBe("failure");
    expect(capturedEvent.evidence.test_passed).toBe(false);
    expect(capturedEvent.evidence.error).toContain("AssertionError");
  });

  it("should handle multiple submissions in sequence", async () => {
    const events: any[] = [];

    const adapter = createPythonAdapter({
      moduleId: "python-fundamentals",
      logPath: tempDir,
    });

    adapter.onStudentAction = (event) => {
      events.push(event);
    };

    await adapter.start();

    const logPath = path.join(tempDir, "submissions.log");

    // First submission
    const submission1 = {
      timestamp: "2026-01-24T16:32:00.000Z",
      file: "main.py",
      code: "def hello():\n    return 'Hello, World!'",
      test_results: {
        passed: true,
        test_name: "tests/test_main.py::test_hello_world",
        error: null,
        output: "1 passed",
      },
      metadata: {
        line_count: 2,
        functions_defined: ["hello"],
      },
    };

    fs.writeFileSync(logPath, JSON.stringify(submission1) + "\n");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second submission
    const submission2 = {
      timestamp: "2026-01-24T16:33:00.000Z",
      file: "main.py",
      code:
        'def hello():\n    return "Hello, World!"\n\ndef greet(name):\n    return f"Hello, {name}!"',
      test_results: {
        passed: true,
        test_name: "tests/test_main.py::test_greet",
        error: null,
        output: "2 passed",
      },
      metadata: {
        line_count: 4,
        functions_defined: ["hello", "greet"],
      },
    };

    fs.appendFileSync(logPath, JSON.stringify(submission2) + "\n");
    await new Promise((resolve) => setTimeout(resolve, 100));

    adapter.stop();

    // Verify both submissions were processed
    expect(events.length).toBe(2);
    expect(events[0].evidence.functions_defined).toContain("hello");
    expect(events[1].evidence.functions_defined).toContain("greet");
    expect(events[1].evidence.line_count).toBe(4);
  });

  it("should extract function definitions correctly", async () => {
    let capturedEvent: any = null;

    const adapter = createPythonAdapter({
      moduleId: "test-lab",
      logPath: tempDir,
    });

    adapter.onStudentAction = (event) => {
      capturedEvent = event;
    };

    await adapter.start();

    const submission = {
      timestamp: new Date().toISOString(),
      file: "main.py",
      code: `
def func1():
    pass

def func2(x):
    return x * 2

class MyClass:
    def method(self):
        pass

# This is not a function: def not_a_function
`,
      test_results: {
        passed: true,
        test_name: "test",
        error: null,
        output: "passed",
      },
      metadata: {
        line_count: 15,
        functions_defined: ["func1", "func2", "method"],
      },
    };

    fs.writeFileSync(
      path.join(tempDir, "submissions.log"),
      JSON.stringify(submission) + "\n"
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    adapter.stop();

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.evidence.functions_defined).toEqual(
      ["func1", "func2", "method"]
    );
  });

  it("should include source as 'tutor' for compatibility", async () => {
    let capturedEvent: any = null;

    const adapter = createPythonAdapter({
      moduleId: "test",
      logPath: tempDir,
    });

    adapter.onStudentAction = (event) => {
      capturedEvent = event;
    };

    await adapter.start();

    fs.writeFileSync(
      path.join(tempDir, "submissions.log"),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        file: "test.py",
        code: "print('test')",
        test_results: { passed: true, test_name: "test", error: null, output: "ok" },
        metadata: { line_count: 1, functions_defined: [] },
      }) + "\n"
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    adapter.stop();

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.source).toBe("tutor");
  });
});

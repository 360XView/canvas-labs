#!/usr/bin/env node

/**
 * Course Picker Test
 *
 * Tests the course picker TUI using the GenericAdapter framework.
 *
 * Verifies:
 * - Course selection interface displays correctly
 * - Python Mastery course is listed
 * - Course metadata (description, time, modules) is shown
 * - Course selection works properly
 * - Integration with course system functions
 *
 * Run:
 * bun run tui-testing/examples/course-picker-test.ts
 */

import { createGenericAdapter } from "../adapters/index.js";
import { TUITestRunner } from "../core/tui-test-runner.js";

const test = async () => {
  console.log("[course-picker-test] Starting test...");

  const adapter = createGenericAdapter("bun run src/cli.ts course-picker test-student", {
    readyIndicator: "Canvas Lab System - Course Selection",
    verbose: true,
  });

  const runner = new TUITestRunner({
    adapter,
    verbose: true,
    timeouts: {
      launch: 15000,
      ready: 10000,
      action: 5000,
    },
  });

  const report = await runner.run(async (ctx) => {
    console.log("[Test] Starting course picker test...");

    // Test 1: Course selection interface appears with title
    console.log("[Test] Verifying course picker interface displays");
    await ctx.assertPaneContains("Canvas Lab System - Course Selection");

    // Test 2: Python Mastery course is listed
    console.log("[Test] Verifying Python Mastery course is listed");
    await ctx.assertPaneContains("Python Mastery");

    // Test 3: Course description is shown
    console.log("[Test] Verifying course description is shown");
    await ctx.assertPaneContains("Learn Python programming");

    // Test 4: Course metadata (modules count and time) is displayed
    console.log("[Test] Verifying course metadata (modules and time)");
    await ctx.assertPaneContains("Modules: 4");
    await ctx.assertPaneContains("120 minutes");

    // Test 5: Selection prompt appears
    console.log("[Test] Verifying selection prompt appears");
    await ctx.assertPaneContains("Select course");

    // Test 6: Select the Python Mastery course (option 1)
    console.log("[Test] Selecting Python Mastery course...");
    await ctx.sendKeys("1");
    await ctx.waitForText("python-fundamentals", 3000);

    // Test 7: Starting module is identified correctly
    console.log("[Test] Verifying starting module is python-fundamentals");
    // The course picker should identify the first uncompleted module
    // For a new student, this should be python-fundamentals

    console.log("[Test] Course picker test completed successfully!");
  });

  return report;
};

// Run test and exit with appropriate status code
test()
  .then((report) => {
    console.log("\n========== TEST REPORT ==========");
    console.log(`Test: ${report.testName}`);
    console.log(`Date: ${report.date}`);
    console.log(`Result: ${report.passed ? "PASSED" : "FAILED"}`);
    console.log(`Steps: ${report.passedSteps}/${report.totalSteps} passed`);
    console.log(`Duration: ${report.totalDuration}ms`);

    if (report.failedSteps > 0) {
      console.log("\nFailed steps:");
      report.steps
        .filter((s) => !s.passed)
        .forEach((s) => {
          console.log(`  - ${s.description}: ${s.error}`);
        });
    }
    console.log("=================================\n");

    process.exit(report.passed ? 0 : 1);
  })
  .catch((error) => {
    console.error("[course-picker-test] Test execution failed:");
    console.error(error);
    process.exit(1);
  });

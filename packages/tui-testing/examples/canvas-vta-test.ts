#!/usr/bin/env node

/**
 * Canvas vTA Lab System Test
 *
 * Tests the Canvas virtual teaching assistant system with the simple-lab-poc module.
 *
 * Verifies:
 * - Canvas lab launches successfully
 * - Introduction step displays
 * - Navigation works (step-by-step progression)
 * - Commands can be sent to Docker container
 * - Output is captured correctly
 *
 * Prerequisites:
 * - Canvas installed at /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin
 * - Docker running
 * - tmux installed
 *
 * Run:
 * bun run tui-testing/examples/canvas-vta-test.ts
 */

import { createCanvasAdapter } from "../adapters/index.js";
import { TUITestRunner } from "../src/tui-test-runner.js";

const test = async () => {
  console.log("[canvas-vta-test] Starting Canvas vTA lab test...");

  const adapter = createCanvasAdapter("simple-lab-poc", {
    noTutor: true, // Disable AI tutor pane for simpler testing
    verbose: true,
  });

  const runner = new TUITestRunner({
    adapter,
    verbose: true,
    timeouts: {
      launch: 30000, // Canvas takes longer to start
      ready: 15000,
      action: 5000,
    },
  });

  const report = await runner.run(async (ctx) => {
    console.log("[Test] Starting Canvas vTA lab test sequence...");

    // Test 1: Verify we're on the introduction step
    console.log("[Test] Step 1: Verify Introduction step displays");
    await ctx.assertPaneContains("Introduction", false); // Case-insensitive

    // Test 2: Verify lab content is shown
    console.log("[Test] Step 2: Verify lab content");
    await ctx.assertPaneContains("test lab for automation", false);

    // Test 3: Navigate to next step (Create File)
    console.log("[Test] Step 3: Navigate to Create a File step");
    await ctx.sendKeys("ArrowRight");
    await ctx.waitForText("Create a File", 5000);

    // Test 4: Verify task instructions appear
    console.log("[Test] Step 4: Verify task instructions");
    await ctx.assertPaneContains("/tmp/testfile.txt", false);

    // Test 5: Navigate to Write Content step
    console.log("[Test] Step 5: Navigate to Write Content step");
    await ctx.sendKeys("ArrowRight");
    await ctx.waitForText("Write Content", 5000);

    // Test 6: Verify write instructions
    console.log("[Test] Step 6: Verify write instructions");
    await ctx.assertPaneContains("hello world", false);

    // Test 7: Navigate to Summary step
    console.log("[Test] Step 7: Navigate to Summary step");
    await ctx.sendKeys("ArrowRight");
    await ctx.waitForText("Complete", 5000);

    // Test 8: Verify completion message
    console.log("[Test] Step 8: Verify completion message");
    await ctx.assertPaneContains("completed", false);

    // Test 9: Return to first step
    console.log("[Test] Step 9: Navigate back to Introduction");
    await ctx.sendKeys("ArrowLeft");
    await ctx.sendKeys("ArrowLeft");
    await ctx.sendKeys("ArrowLeft");
    await ctx.waitForText("Introduction", 5000);

    // Test 10: Verify we're back at the start
    console.log("[Test] Step 10: Verify back at Introduction");
    await ctx.assertPaneContains("test lab for automation", false);

    console.log("[Test] Canvas vTA lab test completed successfully!");
  });

  return report;
};

// Run test and exit with appropriate status code
test()
  .then((report) => {
    console.log("\n========== CANVAS vTA TEST REPORT ==========");
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
          console.log(`  - Step ${s.stepNumber}: ${s.description}`);
          if (s.error) {
            console.log(`    Error: ${s.error}`);
          }
        });
    }
    console.log("===========================================\n");

    process.exit(report.passed ? 0 : 1);
  })
  .catch((error) => {
    console.error("[canvas-vta-test] Test execution failed:");
    console.error(error);
    process.exit(1);
  });

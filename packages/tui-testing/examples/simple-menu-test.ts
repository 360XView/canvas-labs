#!/usr/bin/env node

/**
 * Simple Menu App Test
 *
 * Tests the simple-menu.ts TUI application using the testing framework.
 *
 * Verifies:
 * - Menu displays correctly
 * - Menu options are present
 * - Selection feedback is shown
 * - Menu reappears after selection
 * - Exit works cleanly
 *
 * Run:
 * bun run tui-testing/examples/simple-menu-test.ts
 */

import { createGenericAdapter } from "../adapters/index.js";
import { TUITestRunner } from "../core/tui-test-runner.js";

const test = async () => {
  console.log("[simple-menu-test] Starting test...");

  const adapter = createGenericAdapter("bun run tui-testing/examples/simple-menu.ts", {
    readyIndicator: "Simple Menu",
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
    console.log("[Test] Starting menu app test...");

    // Test 1: Menu appears with title
    console.log("[Test] Verifying menu displays with title");
    await ctx.assertPaneContains("Simple Menu");

    // Test 2: Menu shows all options
    console.log("[Test] Verifying menu options are present");
    await ctx.assertPaneContains("Option A");
    await ctx.assertPaneContains("Option B");
    await ctx.assertPaneContains("Exit");

    // Test 3: Select option 1
    console.log("[Test] Selecting Option A...");
    await ctx.sendKeys("1");
    await ctx.waitForText("You selected Option A", 3000);

    // Test 4: Verify feedback message
    console.log("[Test] Verifying feedback for Option A");
    await ctx.assertPaneContains("This is Option A content");

    // Test 5: Return to menu
    console.log("[Test] Returning to menu...");
    await ctx.sendKeys("Enter");
    await ctx.waitForText("Simple Menu", 3000);

    // Test 6: Select option 2
    console.log("[Test] Selecting Option B...");
    await ctx.sendKeys("2");
    await ctx.waitForText("You selected Option B", 3000);

    // Test 7: Verify feedback for option B
    console.log("[Test] Verifying feedback for Option B");
    await ctx.assertPaneContains("This is Option B content");

    // Test 8: Return to menu again
    console.log("[Test] Returning to menu again...");
    await ctx.sendKeys("Enter");
    await ctx.waitForText("Simple Menu", 3000);

    // Test 9: Verify menu reappears
    console.log("[Test] Verifying menu reappeared");
    await ctx.assertPaneContains("1. Option A");
    await ctx.assertPaneContains("2. Option B");
    await ctx.assertPaneContains("3. Exit");

    // Test 10: Exit the application
    console.log("[Test] Exiting application...");
    await ctx.sendKeys("3");
    await ctx.waitForText("Exiting menu", 3000);

    console.log("[Test] Menu app test completed successfully!");
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
    console.error("[simple-menu-test] Test execution failed:");
    console.error(error);
    process.exit(1);
  });

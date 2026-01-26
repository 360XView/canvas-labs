#!/usr/bin/env bun
/**
 * VTA Navigation Demo
 *
 * Opens the lab in a visible tmux session and demonstrates:
 * - Step navigation (arrow keys)
 * - Debug panel toggle (d key)
 * - Hint reveal (h key)
 *
 * Run with: bun run src/test-harness/demos/vta-navigation-demo.ts
 *
 * Prerequisites:
 * - Must be run from within a tmux session
 * - Docker must be running
 */

import * as tmux from "../../../tui-testing/core/tmux-controller";
import { spawn } from "bun";

const DEMO_SESSION = process.env.TMUX ? tmux.getCurrentSession() : null;
const DEMO_WINDOW = "vta-demo";
const PAUSE_MS = 1500; // Pause between actions so you can see what's happening

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function log(msg: string) {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
  console.log(`[${timestamp}] ${msg}`);
}

async function runDemo() {
  if (!DEMO_SESSION) {
    console.error("❌ This demo must be run from within a tmux session.");
    console.error("   Start tmux first: tmux new-session -s demo");
    process.exit(1);
  }

  log("🎬 VTA Navigation Demo Starting...");
  log(`   Session: ${DEMO_SESSION}`);
  log(`   Window: ${DEMO_WINDOW}`);
  log("");

  // Create a new window for the demo
  log("Creating demo window...");
  let windowIndex: string;
  try {
    windowIndex = await tmux.createWindow(DEMO_SESSION, DEMO_WINDOW);
    log(`   Window created: ${DEMO_SESSION}:${windowIndex}`);
  } catch (err) {
    console.error("Failed to create window:", err);
    process.exit(1);
  }

  const vtaPane = `${DEMO_SESSION}:${windowIndex}.0`;

  try {
    // Start the lab
    log("Starting lab: linux-user-management...");
    await tmux.sendCommand(
      vtaPane,
      "cd /Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0 && bun run src/cli.ts lab linux-user-management --no-tutor"
    );

    // Wait for VTA to load
    log("Waiting for VTA canvas to load...");
    const ready = await tmux.waitForText(vtaPane, "Introduction", 30000, 500);
    if (!ready) {
      throw new Error("VTA did not load in time");
    }
    log("   ✓ VTA loaded!");
    await sleep(PAUSE_MS);

    // Demo: Navigate through steps
    log("");
    log("📍 DEMO: Step Navigation");
    log("   Press → to move to next step");

    for (let i = 0; i < 4; i++) {
      await sleep(PAUSE_MS);
      log(`   → Moving to step ${i + 2}...`);
      await tmux.sendKeys(vtaPane, "\x1b[C"); // Right arrow (ESC [ C)
      await sleep(500);
    }

    await sleep(PAUSE_MS);
    log("   ← Moving back...");
    await tmux.sendKeys(vtaPane, "\x1b[D"); // Left arrow
    await sleep(PAUSE_MS);
    await tmux.sendKeys(vtaPane, "\x1b[D"); // Left arrow
    await sleep(PAUSE_MS);

    // Demo: Debug panel
    log("");
    log("🔧 DEMO: Debug Panel");
    log("   Press 'd' to toggle debug panel");
    await sleep(PAUSE_MS);

    log("   Opening debug panel...");
    await tmux.sendKeys(vtaPane, "d");
    await sleep(PAUSE_MS * 2);

    // Capture and show what's on screen
    const content = await tmux.capturePane(vtaPane);
    if (content.includes("Debug") || content.includes("Status") || content.includes("Session")) {
      log("   ✓ Debug panel visible!");
    }

    log("   Closing debug panel...");
    await tmux.sendKeys(vtaPane, "d");
    await sleep(PAUSE_MS);

    // Demo: Hint
    log("");
    log("💡 DEMO: Hints");
    log("   Navigate to a task step and press 'h' for hint");

    // Go to step 2 (become-root)
    await tmux.sendKeys(vtaPane, "\x1b[C"); // Right to step 2
    await sleep(PAUSE_MS);

    log("   Revealing hint...");
    await tmux.sendKeys(vtaPane, "h");
    await sleep(PAUSE_MS * 2);

    // Demo complete
    log("");
    log("✅ Demo Complete!");
    log("");
    log("The VTA window is still open. You can:");
    log("   - Switch to it: Ctrl+b then select window");
    log("   - Try the keyboard shortcuts yourself");
    log("   - Press 'q' in the VTA to quit");
    log("");
    log(`To close the demo window: tmux kill-window -t ${DEMO_SESSION}:${DEMO_WINDOW}`);
  } catch (err) {
    console.error("Demo error:", err);
    log(`Cleaning up window: ${vtaPane}`);
    try {
      await tmux.killWindow(`${DEMO_SESSION}:${windowIndex}`);
    } catch {
      // Ignore cleanup errors
    }
    process.exit(1);
  }
}

// Run the demo
runDemo().catch(console.error);

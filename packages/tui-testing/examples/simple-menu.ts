#!/usr/bin/env node

/**
 * Simple Interactive Menu TUI Application
 *
 * A minimal terminal-based menu without external dependencies.
 * Uses Node.js stdlib readline for keyboard input.
 *
 * Menu:
 * 1. Option A
 * 2. Option B
 * 3. Exit
 *
 * Demonstrates:
 * - Raw terminal interaction
 * - Interactive loops
 * - Keyboard event handling
 * - Exit handling
 *
 * Run:
 * node simple-menu.ts
 *
 * Test with:
 * bun run tui-testing/examples/simple-menu.ts
 */

// @ts-ignore - Node.js built-in modules lack TypeScript definitions when used as ESM
import readline from "readline";

// Create readline interface for keyboard input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true, // Enable raw mode for better control
});

// Store the current state
let isRunning = true;

/**
 * Display the main menu
 */
function displayMenu(): void {
  console.clear?.() || process.stdout.write("\x1Bc"); // Clear screen (fallback method)

  console.log("Simple Menu");
  console.log("===========");
  console.log("1. Option A");
  console.log("2. Option B");
  console.log("3. Exit");
  console.log();
  console.log("Press a key to choose:");
}

/**
 * Handle a menu selection
 */
function handleSelection(choice: string): void {
  switch (choice.toLowerCase()) {
    case "1":
      console.clear?.() || process.stdout.write("\x1Bc");
      console.log("You selected Option A");
      console.log();
      console.log("This is Option A content.");
      console.log();
      console.log("Press any key to return to menu...");
      promptForMenu();
      break;

    case "2":
      console.clear?.() || process.stdout.write("\x1Bc");
      console.log("You selected Option B");
      console.log();
      console.log("This is Option B content.");
      console.log();
      console.log("Press any key to return to menu...");
      promptForMenu();
      break;

    case "3":
      console.log("Exiting menu...");
      exit();
      break;

    default:
      // Invalid selection, just redisplay menu
      displayMenu();
  }
}

/**
 * Wait for user input to return to menu
 */
function promptForMenu(): void {
  rl.question("", () => {
    if (isRunning) {
      displayMenu();
    }
  });
}

/**
 * Start the main menu loop
 */
function start(): void {
  displayMenu();

  // Listen for individual key presses
  rl.on("line", (input: string) => {
    if (isRunning) {
      handleSelection(input);
    }
  });

  // Handle Ctrl+C
  rl.on("close", () => {
    exit();
  });
}

/**
 * Clean exit
 */
function exit(): void {
  isRunning = false;
  rl.close();
  process.exit(0);
}

// Start the application
start();

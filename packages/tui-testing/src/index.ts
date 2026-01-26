// tui-testing/core - Generic TUI Testing Framework
//
// Reusable components for automated terminal UI testing.
// These modules have no framework-specific dependencies and can be used
// in any project that needs to test terminal applications via tmux.

export * as TmuxController from "./tmux-controller.js";
export * from "./reporter.js";
export * from "./state-observer.js";
export * from "./tui-test-runner.js";

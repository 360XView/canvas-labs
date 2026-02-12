// Baseline scenario for linux-user-management lab
// Simulates a student who completes all tasks, requests one hint, views one solution

import type { ScenarioDefinition } from "../types";

export const linuxUserMgmtBaseline: ScenarioDefinition = {
  id: "linux-user-mgmt-baseline",
  moduleId: "linux-user-management",
  description: "Baseline scenario: student completes all tasks, requests one hint, views one solution",
  stepIds: ["intro", "become-root", "create-user", "set-permissions", "add-to-group", "summary"],
  actions: [
    // View introduction
    { type: "vta_step_view", stepId: "intro", stepType: "introduction" },
    { type: "wait", seconds: 1, description: "Read intro" },

    // Step: become-root
    { type: "vta_step_view", stepId: "become-root", stepType: "task" },
    { type: "command", command: "sudo su", description: "Become root user" },
    { type: "wait_for_step", stepId: "become-root", timeoutSeconds: 10 },

    // Step: create-user — request a hint first, then complete
    { type: "vta_step_view", stepId: "create-user", stepType: "task" },
    { type: "wait", seconds: 1, description: "Student reads instructions" },
    { type: "vta_hint", stepId: "create-user", hintIndex: 0, totalHints: 2 },
    { type: "wait", seconds: 1, description: "Student reads hint" },
    { type: "command", command: "useradd -m devuser", description: "Create devuser with home dir" },
    { type: "wait_for_step", stepId: "create-user", timeoutSeconds: 10 },

    // Step: set-permissions — complete directly
    { type: "vta_step_view", stepId: "set-permissions", stepType: "task" },
    { type: "command", command: "chmod 750 /home/devuser", description: "Set permissions to 750" },
    { type: "wait_for_step", stepId: "set-permissions", timeoutSeconds: 10 },

    // Step: add-to-group — view solution first, then complete
    { type: "vta_step_view", stepId: "add-to-group", stepType: "task" },
    { type: "wait", seconds: 1, description: "Student struggles" },
    { type: "vta_solution", stepId: "add-to-group" },
    { type: "wait", seconds: 1, description: "Student reads solution" },
    { type: "command", command: "usermod -aG developers devuser", description: "Add to developers group" },
    { type: "wait_for_step", stepId: "add-to-group", timeoutSeconds: 10 },

    // View summary
    { type: "vta_step_view", stepId: "summary", stepType: "summary" },
    { type: "wait", seconds: 1, description: "Read summary" },
  ],
};

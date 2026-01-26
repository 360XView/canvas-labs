// What Can We Test?
// This shows the different levels of testing available

import { loadModule } from "../../lab/module-loader";
import { createMockEnvironment } from "../environment/mock-environment";
import { extractScore } from "../evaluation/score-extractor";

async function demo() {
  const module = loadModule("linux-user-management");

  console.log("=".repeat(60));
  console.log("LEVEL 1: Module Structure (what navigation shows)");
  console.log("=".repeat(60));
  console.log(`\nModule: ${module.title}`);
  console.log(`Lab Type: ${module.labType}`);
  console.log(`\nSteps (navigation items):`);
  module.steps.forEach((step, i) => {
    const icon = step.type === "task" ? "○" : step.type === "info" ? "ℹ" : "?";
    console.log(`  ${icon} [${i}] ${step.id}: ${step.title}`);
    if (step.content.tasks) {
      step.content.tasks.forEach((t) => console.log(`      • ${t.text}`));
    }
  });

  console.log("\n" + "=".repeat(60));
  console.log("LEVEL 2: Lab State (what debug panel shows)");
  console.log("=".repeat(60));

  const env = createMockEnvironment({
    moduleId: "linux-user-management",
    studentId: "demo",
  });
  await env.initialize(module);

  // Simulate some actions
  await env.executeAction({ type: "command", command: "sudo su" });
  await env.executeAction({ type: "hint", stepId: "create-user", hintIndex: 0 });
  await env.executeAction({ type: "command", command: "useradd -m devuser" });

  const state = env.getState();
  const events = env.getEvents();

  console.log(`\nSession ID: ${state.sessionId}`);
  console.log(`Current User: ${state.currentUser}`);
  console.log(`CWD: ${state.currentWorkingDirectory}`);
  console.log(`\nCompleted Steps: ${state.completedSteps.join(", ") || "(none)"}`);
  console.log(`\nEvents (${events.length} total):`);
  events.slice(0, 10).forEach((e) => {
    console.log(`  ${e.event_type}: ${JSON.stringify(e.payload).slice(0, 50)}...`);
  });

  console.log("\n" + "=".repeat(60));
  console.log("LEVEL 3: Scoring (what debug panel calculates)");
  console.log("=".repeat(60));

  const progress = extractScore({
    events,
    moduleId: "linux-user-management",
    studentId: "demo",
    sessionId: state.sessionId,
    stepIds: state.stepIds,
    presetId: "partial_credit",
  });

  console.log(`\nOverall Score: ${(progress.overall_score * 100).toFixed(1)}%`);
  console.log(`Completion: ${(progress.completion_percentage * 100).toFixed(1)}%`);
  console.log(`Passed: ${progress.passed ? "Yes" : "No"}`);
  console.log(`\nStep Progress:`);
  progress.step_progress.forEach((sp) => {
    const bar = "█".repeat(Math.round(sp.confidence_score * 10));
    console.log(`  ${sp.step_id}: ${bar} ${(sp.confidence_score * 100).toFixed(0)}%`);
  });
}

demo().catch(console.error);

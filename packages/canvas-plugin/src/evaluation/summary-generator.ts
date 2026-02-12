// Summary generator for evaluation scenario runs
// Produces human-readable summary from telemetry and state artifacts

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface ScenarioSummary {
  scenarioId: string;
  generatedAt: string;
  totalEvents: number;
  eventCounts: Record<string, number>;
  stepsCompleted: number;
  stepsTotal: number;
  tutorUtteranceCount: number;
  hintsRequested: number;
  solutionsViewed: number;
  commandsExecuted: number;
  toMarkdown(): string;
}

export function generateSummary(logDir: string, scenarioId: string): ScenarioSummary {
  const eventCounts: Record<string, number> = {};
  let totalEvents = 0;

  // Parse telemetry
  const telemetryPath = join(logDir, "telemetry.jsonl");
  if (existsSync(telemetryPath)) {
    const lines = readFileSync(telemetryPath, "utf-8").split("\n").filter(l => l.trim());
    totalEvents = lines.length;
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const type = event.event_type;
        if (type) eventCounts[type] = (eventCounts[type] || 0) + 1;
      } catch {}
    }
  }

  // Parse state.json
  let stepsCompleted = 0;
  let stepsTotal = 0;
  let steps: Array<{ id: string; completed: boolean; source?: string }> = [];
  const statePath = join(logDir, "state.json");
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf-8"));
      steps = state.steps || [];
      stepsTotal = steps.length;
      stepsCompleted = steps.filter((s) => s.completed).length;
    } catch {}
  }

  // Parse tutor speech
  let tutorUtteranceCount = 0;
  const speechPath = join(logDir, "tutor-speech.jsonl");
  if (existsSync(speechPath)) {
    const lines = readFileSync(speechPath, "utf-8").split("\n").filter(l => l.trim());
    tutorUtteranceCount = lines.length;
  }

  const summary: ScenarioSummary = {
    scenarioId,
    generatedAt: new Date().toISOString(),
    totalEvents,
    eventCounts,
    stepsCompleted,
    stepsTotal,
    tutorUtteranceCount,
    hintsRequested: eventCounts["hint_requested"] || 0,
    solutionsViewed: eventCounts["solution_viewed"] || 0,
    commandsExecuted: (eventCounts["student_action"] || 0) + (eventCounts["command_executed"] || 0),
    toMarkdown() {
      const lines = [
        `# Evaluation Baseline Summary`,
        ``,
        `**Scenario:** ${scenarioId}`,
        `**Generated:** ${summary.generatedAt}`,
        ``,
        `## Metrics`,
        ``,
        `- Total events: ${totalEvents}`,
        `- Steps completed: ${stepsCompleted}/${stepsTotal}`,
        `- Commands executed: ${summary.commandsExecuted}`,
        `- Hints requested: ${summary.hintsRequested}`,
        `- Solutions viewed: ${summary.solutionsViewed}`,
        `- Tutor utterances: ${tutorUtteranceCount}`,
        ``,
        `## Event Breakdown`,
        ``,
        `| Event Type | Count |`,
        `|-----------|-------|`,
        ...Object.entries(eventCounts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([type, count]) => `| ${type} | ${count} |`),
        ``,
        `## Step Completion`,
        ``,
        ...steps.map(step => {
          const icon = step.completed ? "x" : " ";
          return `- [${icon}] ${step.id}${step.source && step.source !== "module" ? ` (via ${step.source})` : ""}`;
        }),
      ];

      return lines.join("\n");
    },
  };

  return summary;
}

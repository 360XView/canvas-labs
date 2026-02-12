#!/usr/bin/env bun
// Run baseline evaluation scenario and save artifacts
// Usage: bun run src/evaluation/run-baseline.ts [--output dir] [--verbose]

import { runScenarioHeadless } from "./scenario-runner";
import { linuxUserMgmtBaseline } from "./scenarios/linux-user-mgmt-baseline";
import { validateArtifacts } from "./artifact-validator";
import { generateSummary } from "./summary-generator";
import { cpSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";

const args = process.argv.slice(2);
const outputIdx = args.indexOf("--output");
const dateStr = new Date().toISOString().split("T")[0];
const outputDir = outputIdx >= 0
  ? resolve(args[outputIdx + 1])
  : resolve(import.meta.dir, `../../test-fixtures/baseline-${dateStr}`);
const verbose = args.includes("--verbose");

console.log(`Evaluation Baseline Capture`);
console.log(`===========================`);
console.log(`Scenario: ${linuxUserMgmtBaseline.id}`);
console.log(`Output:   ${outputDir}`);
console.log();

// Run the scenario
const result = await runScenarioHeadless(linuxUserMgmtBaseline, { verbose });

if (!result.success) {
  console.error("\nScenario failed:");
  for (const err of result.errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

// Validate artifacts
const validation = validateArtifacts(result.logDir);
if (!validation.valid) {
  console.error("\nArtifact validation failed:");
  if (validation.missing.length > 0) console.error(`  Missing: ${validation.missing.join(", ")}`);
  if (validation.empty.length > 0) console.error(`  Empty: ${validation.empty.join(", ")}`);
  process.exit(1);
}

// Generate summary
const summary = generateSummary(result.logDir, linuxUserMgmtBaseline.id);

// Copy artifacts to output directory
mkdirSync(outputDir, { recursive: true });

const artifacts = [
  "telemetry.jsonl",
  "state.json",
  "commands.log",
  "checks.log",
  "tutor-speech.jsonl",
];

for (const file of artifacts) {
  const src = join(result.logDir, file);
  const dst = join(outputDir, file);
  if (existsSync(src)) {
    cpSync(src, dst);
  }
}

// Write summary
writeFileSync(join(outputDir, "summary.md"), summary.toMarkdown());

// Write scenario result metadata
writeFileSync(join(outputDir, "result.json"), JSON.stringify(result, null, 2));

console.log("\nBaseline captured successfully!");
console.log();
console.log(summary.toMarkdown());

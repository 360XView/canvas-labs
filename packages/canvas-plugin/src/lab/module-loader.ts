// Module loader for YAML-based lab definitions
// Reads module.yaml files from labs/ and converts them to TypeScript types

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type {
  Module,
  Step,
  StepContent,
  TaskItem,
  Hint,
  Solution,
  Question,
  QuestionOption,
} from "../canvases/vta/types";
import type { ValidationRule } from "../canvases/vta/lab-types";
import type { LabType } from "./telemetry/types";

// Check configuration for scripts that poll for task completion
export interface CheckConfig {
  stepId: string;
  script: string;
  pollInterval: number;
}

// Raw YAML types (before conversion to TypeScript interfaces)
interface YamlModule {
  title: string;
  description?: string;
  labType?: LabType;  // NEW: Lab type in YAML (optional)
  steps: YamlStep[];
}

interface YamlStep {
  id: string;
  title: string;
  type: "introduction" | "task" | "question" | "summary";
  content: YamlStepContent;
  hints?: string[];
  solution?: YamlSolution;
  validation?: YamlValidation;
}

interface YamlStepContent {
  instructions?: string;
  tasks?: YamlTask[];
  question?: YamlQuestion;
  tryIt?: string;
}

interface YamlQuestion {
  text: string;
  type: "single" | "multiple";
  options: YamlQuestionOption[];
  explanation?: string;
}

interface YamlQuestionOption {
  id: string;
  text: string;
  correct: boolean;
  feedback?: string;
}

interface YamlTask {
  text: string;
  details?: string[];
}

interface YamlSolution {
  command?: string;
  description?: string;
  explanation?: string;
}

interface YamlValidation {
  type: "user-check" | "command-pattern" | "check-script";
  user?: string;
  pattern?: string;
  script?: string;
  poll_interval?: number;
}

/**
 * Get the absolute path to the labs/ directory
 * Resolved relative to this module's location
 */
export function getLabsPath(): string {
  // import.meta.dir gives us the directory containing this file (src/lab/)
  // Labs are at ../../labs relative to this file
  const moduleDir = import.meta.dir;
  return path.resolve(moduleDir, "../../labs");
}

/**
 * Discover all available module IDs by scanning the labs/ directory
 * Returns an array of directory names that contain a module.yaml file
 */
export function discoverModules(): string[] {
  const labsPath = getLabsPath();

  if (!fs.existsSync(labsPath)) {
    throw new Error(`Labs directory not found: ${labsPath}`);
  }

  const entries = fs.readdirSync(labsPath, { withFileTypes: true });
  const modules: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const moduleYamlPath = path.join(labsPath, entry.name, "module.yaml");
      if (fs.existsSync(moduleYamlPath)) {
        modules.push(entry.name);
      }
    }
  }

  return modules.sort();
}

/**
 * Get the path to a module's directory
 */
function getModulePath(moduleId: string): string {
  return path.join(getLabsPath(), moduleId);
}

/**
 * Get the path to a module's YAML file
 */
function getModuleYamlPath(moduleId: string): string {
  return path.join(getModulePath(moduleId), "module.yaml");
}

/**
 * Read and parse a module's YAML file
 */
function parseModuleYaml(moduleId: string): YamlModule {
  const yamlPath = getModuleYamlPath(moduleId);

  if (!fs.existsSync(yamlPath)) {
    throw new Error(
      `Module YAML not found for '${moduleId}': ${yamlPath}\n` +
        `Available modules: ${discoverModules().join(", ") || "(none)"}`
    );
  }

  const content = fs.readFileSync(yamlPath, "utf-8");

  try {
    const parsed = yaml.load(content) as YamlModule;

    if (!parsed || typeof parsed !== "object") {
      throw new Error("YAML file is empty or invalid");
    }

    if (!parsed.title) {
      throw new Error("Module must have a 'title' field");
    }

    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error("Module must have at least one step");
    }

    return parsed;
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      throw new Error(
        `Invalid YAML in ${yamlPath}: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Convert YAML hints array (strings) to Hint objects with generated IDs
 */
function convertHints(hints: string[] | undefined, stepId: string): Hint[] {
  if (!hints || hints.length === 0) {
    return [];
  }

  return hints.map((text, index) => ({
    id: `${stepId}-hint-${index + 1}`,
    text,
    revealed: false,
  }));
}

/**
 * Convert YAML solution to Solution object
 */
function convertSolution(solution: YamlSolution | undefined): Solution | undefined {
  if (!solution) {
    return undefined;
  }

  return {
    command: solution.command,
    description: solution.description,
    explanation: solution.explanation,
    revealed: false,
  };
}

/**
 * Convert YAML tasks to TaskItem objects
 */
function convertTasks(tasks: YamlTask[] | undefined): TaskItem[] | undefined {
  if (!tasks || tasks.length === 0) {
    return undefined;
  }

  return tasks.map((task) => ({
    text: task.text,
    details: task.details,
    completed: false,
  }));
}

/**
 * Convert YAML question to Question object
 */
function convertQuestion(question: YamlQuestion | undefined): Question | undefined {
  if (!question) {
    return undefined;
  }

  return {
    text: question.text,
    type: question.type,
    options: question.options.map((opt) => ({
      id: opt.id,
      text: opt.text,
      correct: opt.correct,
      feedback: opt.feedback,
    })),
    explanation: question.explanation,
    answered: false,
  };
}

/**
 * Convert a YAML step to a Step object
 */
function convertStep(yamlStep: YamlStep): Step {
  const content: StepContent = {
    instructions: yamlStep.content.instructions,
    tasks: convertTasks(yamlStep.content.tasks),
    hints: convertHints(yamlStep.hints, yamlStep.id),
    solution: convertSolution(yamlStep.solution),
    question: convertQuestion(yamlStep.content.question),
    tryIt: yamlStep.content.tryIt,
  };

  return {
    id: yamlStep.id,
    title: yamlStep.title,
    type: yamlStep.type,
    content,
    completed: false,
  };
}

/**
 * Load a module by ID and convert it to the Module TypeScript type
 */
export function loadModule(moduleId: string): Module {
  const yamlModule = parseModuleYaml(moduleId);

  return {
    id: moduleId,
    title: yamlModule.title,
    description: yamlModule.description,
    labType: yamlModule.labType ?? "linux_cli",  // NEW: Extract labType, default to linux_cli
    steps: yamlModule.steps.map(convertStep),
  };
}

/**
 * Extract validation rules from a module's YAML
 * Handles user-check and command-pattern types
 * check-script types are handled separately by getCheckConfigs
 */
export function getValidationRules(moduleId: string): ValidationRule[] {
  const yamlModule = parseModuleYaml(moduleId);
  const rules: ValidationRule[] = [];

  for (const step of yamlModule.steps) {
    if (!step.validation) {
      continue;
    }

    const { validation } = step;

    switch (validation.type) {
      case "user-check":
        if (!validation.user) {
          console.warn(
            `Step '${step.id}' has user-check validation but no 'user' specified`
          );
          continue;
        }
        rules.push({
          stepId: step.id,
          userCheck: validation.user,
          description: step.title,
        });
        break;

      case "command-pattern":
        if (!validation.pattern) {
          console.warn(
            `Step '${step.id}' has command-pattern validation but no 'pattern' specified`
          );
          continue;
        }
        rules.push({
          stepId: step.id,
          pattern: new RegExp(validation.pattern),
          description: step.title,
        });
        break;

      case "check-script":
        // Skip - handled by getCheckConfigs
        break;

      default:
        console.warn(
          `Step '${step.id}' has unknown validation type: ${(validation as YamlValidation).type}`
        );
    }
  }

  return rules;
}

/**
 * Extract check script configurations from a module's YAML
 * These are validation scripts that poll for task completion
 */
export function getCheckConfigs(moduleId: string): CheckConfig[] {
  const yamlModule = parseModuleYaml(moduleId);
  const configs: CheckConfig[] = [];

  for (const step of yamlModule.steps) {
    if (!step.validation || step.validation.type !== "check-script") {
      continue;
    }

    const { validation } = step;

    if (!validation.script) {
      console.warn(
        `Step '${step.id}' has check-script validation but no 'script' specified`
      );
      continue;
    }

    configs.push({
      stepId: step.id,
      script: validation.script,
      pollInterval: validation.poll_interval ?? 2000, // Default 2 seconds
    });
  }

  return configs;
}

/**
 * Generate a markdown tutor prompt for a module
 * This can be used to brief an AI tutor about the lab
 */
export function generateTutorPrompt(moduleId: string): string {
  const yamlModule = parseModuleYaml(moduleId);
  const lines: string[] = [];

  // Header
  lines.push(`# ${yamlModule.title}`);
  lines.push("");
  if (yamlModule.description) {
    lines.push(yamlModule.description);
    lines.push("");
  }

  // Step table
  lines.push("## Steps Overview");
  lines.push("");
  lines.push("| Step ID | Task | Success Criteria | Hint |");
  lines.push("|---------|------|------------------|------|");

  for (const step of yamlModule.steps) {
    // Get first task text or use step title
    const taskText =
      step.content.tasks?.[0]?.text || step.content.instructions?.split("\n")[0] || "-";

    // Get success criteria from validation
    let criteria = "-";
    if (step.validation) {
      switch (step.validation.type) {
        case "user-check":
          criteria = `User is '${step.validation.user}'`;
          break;
        case "command-pattern":
          criteria = `Command matches: ${step.validation.pattern}`;
          break;
        case "check-script":
          criteria = `Script: ${step.validation.script}`;
          break;
      }
    }

    // Get first hint or "-"
    const hint = step.hints?.[0] || "-";

    // Escape pipe characters in content
    const escapeCell = (text: string) =>
      text.replace(/\|/g, "\\|").replace(/\n/g, " ");

    lines.push(
      `| ${step.id} | ${escapeCell(taskText)} | ${escapeCell(criteria)} | ${escapeCell(hint)} |`
    );
  }

  lines.push("");

  // Log file documentation
  lines.push("## Log File Format");
  lines.push("");
  lines.push("The lab environment writes logs that can be used to monitor student progress:");
  lines.push("");
  lines.push("### commands.log");
  lines.push("```");
  lines.push('{"timestamp":"ISO8601","user":"username","pwd":"/current/dir","command":"typed command"}');
  lines.push("```");
  lines.push("");
  lines.push("### checks.log");
  lines.push("```");
  lines.push('{"timestamp":"ISO8601","step_id":"step-name","status":"PASS|FAIL","message":"details"}');
  lines.push("```");
  lines.push("");

  // Solution reference
  lines.push("## Solution Reference");
  lines.push("");
  for (const step of yamlModule.steps) {
    if (step.solution?.command) {
      lines.push(`### ${step.title}`);
      lines.push("```bash");
      lines.push(step.solution.command);
      lines.push("```");
      if (step.solution.explanation) {
        lines.push(`> ${step.solution.explanation}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * List all available modules with their titles
 */
export function listModules(): Array<{ id: string; title: string; description?: string }> {
  const moduleIds = discoverModules();
  return moduleIds.map((id) => {
    try {
      const module = loadModule(id);
      return {
        id: module.id,
        title: module.title,
        description: module.description,
      };
    } catch (error) {
      return {
        id,
        title: `(Error loading: ${error instanceof Error ? error.message : "Unknown error"})`,
      };
    }
  });
}

// ============================================================================
// Draft Support
// ============================================================================

/**
 * Get the path to the drafts directory
 */
export function getDraftsPath(): string {
  return path.join(getLabsPath(), ".drafts");
}

/**
 * Get the path to the templates directory
 */
export function getTemplatesPath(): string {
  return path.join(getLabsPath(), ".templates");
}

/**
 * Ensure drafts directory exists
 */
export function ensureDraftsDir(): string {
  const draftsPath = getDraftsPath();
  if (!fs.existsSync(draftsPath)) {
    fs.mkdirSync(draftsPath, { recursive: true });
  }
  return draftsPath;
}

/**
 * Discover all draft module IDs
 */
export function discoverDrafts(): string[] {
  const draftsPath = getDraftsPath();

  if (!fs.existsSync(draftsPath)) {
    return [];
  }

  const entries = fs.readdirSync(draftsPath, { withFileTypes: true });
  const drafts: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const moduleYamlPath = path.join(draftsPath, entry.name, "module.yaml");
      if (fs.existsSync(moduleYamlPath)) {
        drafts.push(entry.name);
      }
    }
  }

  return drafts.sort();
}

/**
 * List all draft modules with their titles
 */
export function listDrafts(): Array<{ id: string; title: string; description?: string; status: "draft" }> {
  const draftIds = discoverDrafts();
  return draftIds.map((id) => {
    try {
      const module = loadDraft(id);
      return {
        id: module.id,
        title: module.title,
        description: module.description,
        status: "draft" as const,
      };
    } catch (error) {
      return {
        id,
        title: `(Error loading: ${error instanceof Error ? error.message : "Unknown error"})`,
        status: "draft" as const,
      };
    }
  });
}

/**
 * Load a draft module by ID
 */
export function loadDraft(moduleId: string): Module {
  const draftsPath = getDraftsPath();
  const yamlPath = path.join(draftsPath, moduleId, "module.yaml");

  if (!fs.existsSync(yamlPath)) {
    throw new Error(
      `Draft module YAML not found for '${moduleId}': ${yamlPath}`
    );
  }

  const content = fs.readFileSync(yamlPath, "utf-8");

  try {
    const parsed = yaml.load(content) as YamlModule;

    if (!parsed || typeof parsed !== "object") {
      throw new Error("YAML file is empty or invalid");
    }

    if (!parsed.title) {
      throw new Error("Module must have a 'title' field");
    }

    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      throw new Error("Module must have at least one step");
    }

    return {
      id: moduleId,
      title: parsed.title,
      description: parsed.description,
      steps: parsed.steps.map(convertStep),
    };
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      throw new Error(`Invalid YAML in ${yamlPath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Save a module as a draft
 */
export function saveDraft(moduleId: string, content: string): void {
  const draftsPath = ensureDraftsDir();
  const modulePath = path.join(draftsPath, moduleId);

  if (!fs.existsSync(modulePath)) {
    fs.mkdirSync(modulePath, { recursive: true });
  }

  const yamlPath = path.join(modulePath, "module.yaml");
  fs.writeFileSync(yamlPath, content);
}

/**
 * Publish a draft (move from .drafts to main labs directory)
 */
export function publishDraft(moduleId: string): void {
  const draftsPath = getDraftsPath();
  const labsPath = getLabsPath();

  const srcPath = path.join(draftsPath, moduleId);
  const destPath = path.join(labsPath, moduleId);

  if (!fs.existsSync(srcPath)) {
    throw new Error(`Draft not found: ${moduleId}`);
  }

  if (fs.existsSync(destPath)) {
    throw new Error(`Published module already exists: ${moduleId}. Delete it first or use a different ID.`);
  }

  // Move the directory
  fs.renameSync(srcPath, destPath);
}

/**
 * Delete a draft
 */
export function deleteDraft(moduleId: string): void {
  const draftsPath = getDraftsPath();
  const modulePath = path.join(draftsPath, moduleId);

  if (!fs.existsSync(modulePath)) {
    throw new Error(`Draft not found: ${moduleId}`);
  }

  fs.rmSync(modulePath, { recursive: true });
}

/**
 * Check if a module exists (published or draft)
 */
export function moduleExists(moduleId: string): { exists: boolean; location: "published" | "draft" | null } {
  const labsPath = getLabsPath();
  const draftsPath = getDraftsPath();

  const publishedPath = path.join(labsPath, moduleId, "module.yaml");
  const draftPath = path.join(draftsPath, moduleId, "module.yaml");

  if (fs.existsSync(publishedPath)) {
    return { exists: true, location: "published" };
  }

  if (fs.existsSync(draftPath)) {
    return { exists: true, location: "draft" };
  }

  return { exists: false, location: null };
}

/**
 * Load a template
 */
export function loadTemplate(templateId: string = "basic"): string {
  const templatesPath = getTemplatesPath();
  const templatePath = path.join(templatesPath, `${templateId}.yaml`);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateId}`);
  }

  return fs.readFileSync(templatePath, "utf-8");
}

/**
 * Create a new draft from a template
 */
export function createDraftFromTemplate(moduleId: string, templateId: string = "basic"): void {
  const { exists } = moduleExists(moduleId);
  if (exists) {
    throw new Error(`Module already exists: ${moduleId}`);
  }

  const templateContent = loadTemplate(templateId);

  // Replace placeholder ID in template
  const content = templateContent.replace(/^id:\s*new-lab$/m, `id: ${moduleId}`);

  saveDraft(moduleId, content);
}

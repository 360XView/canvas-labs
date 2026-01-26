// Developer Prompt Generator
// Creates CLAUDE.md for the developer assistant in lab editing mode
// Focuses on lab content creation, validation scripts, and testing

import { join } from "path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { listModules, loadModule, loadDraft, getLabsPath, getDraftsPath, moduleExists } from "../../lab/module-loader";
import { TUTOR_BASE_DIR } from "../defaults";

// Developer workspace directory
const DEVELOPER_WORKSPACE_DIR = join(TUTOR_BASE_DIR, "workspaces", "developer");

export interface DeveloperPromptConfig {
  workspaceDir?: string;
  moduleId?: string;       // Lab being edited (null for new lab)
  isNewLab?: boolean;      // Creating a new lab
}

/**
 * Get example check script content
 */
function getExampleCheckScript(): string {
  return `#!/bin/bash
# Example check script for verifying a lab task
# Exit 0 = PASS, Exit 1 = FAIL
# stdout is captured as the check message

# Check if user exists
if id "devuser" &>/dev/null; then
    echo "User devuser exists"
    exit 0
else
    echo "User devuser does not exist"
    exit 1
fi`;
}

/**
 * Get example setup script content
 */
function getExampleSetupScript(): string {
  return `#!/bin/bash
# Setup script for lab module
# Runs as root before student session starts

# Clean up any previous state (idempotent)
userdel devuser 2>/dev/null || true
groupdel developers 2>/dev/null || true
rm -rf /home/devuser 2>/dev/null || true

# Create the developers group
groupadd developers

# Set up any required files/directories
mkdir -p /opt/lab-data
echo "Lab environment ready" > /opt/lab-data/status.txt`;
}

/**
 * Generate the developer CLAUDE.md content
 */
export function generateDeveloperCLAUDEmd(config: DeveloperPromptConfig = {}): string {
  const modules = listModules();
  const labsPath = getLabsPath();
  const draftsPath = getDraftsPath();

  // Get current module info if editing
  let currentModuleInfo = "";
  if (config.moduleId) {
    // Check if module exists and where (draft or published)
    const { exists, location } = moduleExists(config.moduleId);

    if (exists) {
      try {
        // Load from correct location
        const module = location === "draft"
          ? loadDraft(config.moduleId)
          : loadModule(config.moduleId);
        const taskCount = module.steps.filter(s => s.type === "task").length;
        const isDraft = location === "draft";
        const modulePath = isDraft
          ? `${draftsPath}/${config.moduleId}`
          : `${labsPath}/${config.moduleId}`;

        currentModuleInfo = `
## Currently Editing: ${config.moduleId}${isDraft ? " (DRAFT)" : ""}

**Title:** ${module.title}
**Description:** ${module.description || "(none)"}
**Steps:** ${module.steps.length} total, ${taskCount} tasks
**Status:** ${isDraft ? "Draft - not yet published" : "Published"}

### Steps Overview
${module.steps.map((s, i) => `${i + 1}. [${s.type}] ${s.title} (${s.id})`).join("\n")}

### File Locations
- Module YAML: \`${modulePath}/module.yaml\`
- Check scripts: \`${modulePath}/checks/\`
- Setup script: \`${modulePath}/setup.sh\`
`;
      } catch (e) {
        currentModuleInfo = `
## Currently Editing: ${config.moduleId}

**Status:** Error loading module - ${e instanceof Error ? e.message : "Unknown error"}
`;
      }
    } else {
      // Module doesn't exist yet - this shouldn't happen normally
      // but handle it gracefully
      currentModuleInfo = `
## Creating New Lab: ${config.moduleId}

The lab draft hasn't been created yet. It will be created at:
- \`${draftsPath}/${config.moduleId}/module.yaml\`

Use the template at \`labs/.templates/basic.yaml\` as reference.
`;
    }
  } else if (config.isNewLab) {
    currentModuleInfo = `
## Creating New Lab

Use the template at \`labs/.templates/basic.yaml\` as a starting point.

1. Create a new directory in \`labs/.drafts/\`
2. Copy the template: \`cp labs/.templates/basic.yaml labs/.drafts/<new-id>/module.yaml\`
3. Edit the module.yaml
4. Create check scripts in \`labs/.drafts/<new-id>/checks/\`
5. Create setup script at \`labs/.drafts/<new-id>/setup.sh\`
6. When ready, publish with: move from .drafts to labs/
`;
  }

  const content = `# Lab Developer

You are helping a developer create and edit lab modules for the teaching system.

## Your Role

- **Create** new lab modules from templates
- **Edit** existing lab content (steps, tasks, hints, solutions)
- **Write** validation check scripts that verify task completion
- **Write** setup scripts that prepare the Docker environment
- **Test** labs to ensure they work correctly
- **Debug** issues with validation and task detection

## Lab Structure

Each lab module consists of:

\`\`\`
labs/<module-id>/           # Published labs
├── module.yaml             # Lab definition (steps, tasks, validation)
├── setup.sh                # Setup script run before student session
├── checks/                 # Check scripts for task validation
│   ├── check-step-1.sh
│   └── check-step-2.sh
└── assets/                 # Optional images, files, etc.

labs/.drafts/<module-id>/   # Draft labs (same structure)
├── module.yaml
├── setup.sh
└── checks/
\`\`\`

${currentModuleInfo}

## Module YAML Structure

\`\`\`yaml
title: Lab Title
description: What students will learn

steps:
  - id: unique-step-id
    title: Step Display Title
    type: introduction | task | question | summary
    content:
      instructions: |
        Markdown content explaining the step.
        Can include code blocks, lists, etc.
      tasks:                    # Only for type: task
        - text: "What the student should do"
          details:
            - "Additional detail 1"
            - "Additional detail 2"
    hints:                      # Optional hints array
      - "First hint (revealed on request)"
      - "Second hint (revealed after first)"
    solution:                   # Optional solution
      command: "the exact command"
      description: "Brief description"
      explanation: "Why this works"
    validation:                 # How to verify completion
      type: user-check | command-pattern | check-script
      # For user-check:
      user: root
      # For command-pattern:
      pattern: "useradd.*devuser"
      # For check-script:
      script: check-step-id.sh
      poll_interval: 2000       # ms between checks (default 2000)
\`\`\`

## Check Script Format

Check scripts must:
- Be executable bash scripts
- Exit 0 for PASS, non-zero for FAIL
- Print a message to stdout explaining the result

### Example Check Script
\`\`\`bash
${getExampleCheckScript()}
\`\`\`

## Setup Script Format

Setup scripts:
- Run as root before the student session
- Should be idempotent (safe to run multiple times)
- Clean up previous state before creating new state

### Example Setup Script
\`\`\`bash
${getExampleSetupScript()}
\`\`\`

## Testing Workflow

### 1. Validate Module Structure
\`\`\`bash
bun run src/cli.ts lab-validate <moduleId>
\`\`\`
Returns: step count, task count, validation rules, check scripts

### 2. Full Integration Test (recommended)
\`\`\`bash
bun run src/cli.ts lab-test <moduleId>
\`\`\`
Validates module, runs setup script, and tests all check scripts in Docker.

### 3. Interactive Test
\`\`\`bash
bun run src/cli.ts lab <moduleId> --profile test-dev
\`\`\`
Open lab as student to manually test the full experience.

### 4. Debug Check Script Manually
\`\`\`bash
# Rebuild Docker image first (picks up your changes)
cd docker/lab-environment && ./build.sh

# Run the container interactively
docker run -it --rm --entrypoint /bin/bash canvas-lab:latest

# Inside container, scripts are at /opt/lab/modules/<moduleId>/
source /opt/lab/modules/<moduleId>/setup.sh
/opt/lab/modules/<moduleId>/checks/check-step.sh
echo "Exit code: $?"
\`\`\`

## Common Development Tasks

### Add a New Step
1. Add step entry to module.yaml
2. If type is "task", add validation section
3. If using check-script validation, create the check script in \`<moduleId>/checks/\`
4. Test: \`bun run src/cli.ts lab-test <moduleId>\`

### Add Hints
Hints are revealed progressively. Add them as an array:
\`\`\`yaml
hints:
  - "Think about what command creates users..."
  - "The command is 'useradd'. What flags do you need?"
  - "Try: useradd -m username"
\`\`\`

## Available Labs for Reference

${modules.length === 0 ? "(No labs found)" : modules.map(m => `- **${m.id}**: ${m.title}`).join("\n")}

## File Paths

| Path | Description |
|------|-------------|
| \`${labsPath}/<id>/module.yaml\` | Published lab definition |
| \`${labsPath}/<id>/setup.sh\` | Setup script (runs as root) |
| \`${labsPath}/<id>/checks/\` | Check scripts directory |
| \`${draftsPath}/<id>/\` | Draft labs (same structure) |
| \`${labsPath}/.templates/\` | Lab templates |
| \`docker/lab-environment/Dockerfile\` | Lab container image |
| \`docker/lab-environment/build.sh\` | Rebuild Docker image |

## Best Practices

1. **Make setup idempotent** - Clean up before creating
2. **Test check scripts in isolation** - Debug faster
3. **Use descriptive step IDs** - Easier to track in logs
4. **Provide progressive hints** - Start vague, get specific
5. **Include solutions** - Students can learn from them
6. **Test the full flow** - Run through as a student would
`;

  return content;
}

/**
 * Ensure developer workspace exists and write CLAUDE.md
 */
export function setupDeveloperWorkspace(config: DeveloperPromptConfig = {}): string {
  const workspaceDir = config.workspaceDir || DEVELOPER_WORKSPACE_DIR;

  // Create workspace directory
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  // Generate and write CLAUDE.md
  const claudeMdPath = join(workspaceDir, "CLAUDE.md");
  const content = generateDeveloperCLAUDEmd(config);
  writeFileSync(claudeMdPath, content);

  return workspaceDir;
}

/**
 * Get the developer workspace directory path
 */
export function getDeveloperWorkspaceDir(): string {
  return DEVELOPER_WORKSPACE_DIR;
}

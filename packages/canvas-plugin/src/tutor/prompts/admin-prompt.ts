// Admin Prompt Generator
// Creates CLAUDE.md for the admin assistant in developer mode (Launcher)
// Focuses on system management, profiles, and lab configuration

import { join } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { listProfiles, getProgress, formatDuration } from "../profile-manager";
import { listModules } from "../../lab/module-loader";
import { TUTOR_BASE_DIR, PROFILES_DIR } from "../defaults";

// Admin workspace directory
const ADMIN_WORKSPACE_DIR = join(TUTOR_BASE_DIR, "workspaces", "admin");

export interface AdminPromptConfig {
  workspaceDir?: string;
}

/**
 * Generate statistics summary for a profile
 */
function generateProfileStats(profileId: string): string {
  const progress = getProgress(profileId);
  if (!progress) {
    return "  No progress data";
  }

  const labIds = Object.keys(progress.labs);
  if (labIds.length === 0) {
    return "  No labs attempted";
  }

  const lines: string[] = [];
  for (const labId of labIds) {
    const lab = progress.labs[labId];
    const attempts = lab.attempts.length;
    const bestTime = lab.bestTime ? formatDuration(lab.bestTime) : "N/A";
    lines.push(`  - ${labId}: ${lab.status} (${attempts} attempts, best: ${bestTime})`);
  }

  lines.push("");
  lines.push(`  Total: ${progress.aggregate.totalLabsCompleted} completed, ${progress.aggregate.totalAttempts} attempts`);
  lines.push(`  Time spent: ${formatDuration(progress.aggregate.totalTimeSpent)}`);
  lines.push(`  Hints used: ${progress.aggregate.totalHintsUsed}`);

  return lines.join("\n");
}

/**
 * Generate the admin CLAUDE.md content
 */
export function generateAdminCLAUDEmd(): string {
  const profiles = listProfiles();
  const modules = listModules();

  const content = `# Lab System Administrator

You are helping an administrator manage the lab system. You have full access to profile data and system configuration.

## Your Role

- **Manage** student/user profiles (create, delete, reset progress)
- **Monitor** lab usage and statistics across all profiles
- **Configure** lab settings and system behavior
- **Troubleshoot** issues with labs, Docker, or progress tracking
- **Author** new lab content (switch to Developer mode for detailed editing)

## System Overview

The lab system consists of:
- **Labs**: Interactive Docker-based learning environments in \`labs/\`
- **Profiles**: User progress tracking in \`~/.claude/tutor/profiles/\`
- **vTA Canvas**: Visual teaching assistant UI for lab guidance
- **Lab Launcher**: Browse and launch labs from terminal

## Available Labs

| Lab ID | Title | Description | Status |
|--------|-------|-------------|--------|
${modules.length === 0 ? "| (none) | No labs found | - | - |" : modules.map(m => `| ${m.id} | ${m.title} | ${m.description || "-"} | published |`).join("\n")}

## Current Profiles

${profiles.length === 0 ? "No profiles found. Create one with: `profile-create <id> --name \"Display Name\"`" : profiles.map(p => {
  const stats = generateProfileStats(p.id);
  return `### ${p.name} (${p.id})
- Created: ${new Date(p.createdAt).toLocaleDateString()}
- Last active: ${new Date(p.lastActiveAt).toLocaleDateString()}
${stats}`;
}).join("\n\n")}

## Admin Commands

### Profile Management
\`\`\`bash
# List all profiles
bun run src/cli.ts profile-list

# Create a new profile
bun run src/cli.ts profile-create <id> --name "Display Name"

# Switch to a profile
bun run src/cli.ts profile-use <id>

# View profile statistics
bun run src/cli.ts profile-stats --profile <id>
\`\`\`

### Lab Commands
\`\`\`bash
# List available labs
bun run src/cli.ts lab-list

# Validate a lab module
bun run src/cli.ts lab-validate <moduleId>

# Start a lab with a specific profile
bun run src/cli.ts lab <moduleId> --profile <profileId>

# Edit a lab in developer mode
bun run src/cli.ts lab-edit <moduleId>

# Create a new lab from template
bun run src/cli.ts lab-edit --new

# Run lab tests
bun run src/cli.ts lab-test <moduleId>
\`\`\`

### System Commands
\`\`\`bash
# Launch lab browser (user mode - mentor assistant)
bun run src/cli.ts labs

# Launch lab browser (dev mode - admin assistant)
bun run src/cli.ts labs --dev

# Rebuild Docker image
docker build -t canvas-lab:latest docker/lab-environment/

# Clean up containers
docker ps -a | grep canvas-lab | awk '{print $1}' | xargs docker rm -f
\`\`\`

## File Paths

| Path | Description |
|------|-------------|
| \`${TUTOR_BASE_DIR}\` | Tutor base directory |
| \`${PROFILES_DIR}\` | All profiles |
| \`${PROFILES_DIR}/<id>/profile.json\` | Profile metadata |
| \`${PROFILES_DIR}/<id>/progress.json\` | Progress data |
| \`${ADMIN_WORKSPACE_DIR}\` | Admin workspace |
| \`labs/\` | Published lab modules |
| \`labs/.drafts/\` | Draft lab modules |
| \`labs/.templates/\` | Lab templates |

## Common Admin Tasks

### Create a Test Profile
\`\`\`bash
bun run src/cli.ts profile-create test-student --name "Test Student"
bun run src/cli.ts lab linux-user-management --profile test-student
\`\`\`

### Reset a Profile's Progress
Delete the progress.json file:
\`\`\`bash
rm ~/.claude/tutor/profiles/<id>/progress.json
\`\`\`

### Check Lab Detection Issues
1. Verify Docker is running: \`docker info\`
2. Check log files: \`cat /tmp/lab-logs-*/commands.log\`
3. Check check results: \`cat /tmp/lab-logs-*/checks.log\`
4. Verify module validation: \`bun run src/cli.ts lab-validate <moduleId>\`

### Add a New Lab
1. Create directory: \`mkdir labs/new-lab-id\`
2. Copy template: \`cp labs/.templates/basic.yaml labs/new-lab-id/module.yaml\`
3. Edit module.yaml with lab content
4. Add check scripts to \`docker/lab-environment/checks/new-lab-id/\`
5. Add setup script to \`docker/lab-environment/setup/new-lab-id.sh\`
6. Validate: \`bun run src/cli.ts lab-validate new-lab-id\`
7. Test: \`bun run src/cli.ts lab-test new-lab-id\`
`;

  return content;
}

/**
 * Ensure admin workspace exists and write CLAUDE.md
 */
export function setupAdminWorkspace(config: AdminPromptConfig = {}): string {
  const workspaceDir = config.workspaceDir || ADMIN_WORKSPACE_DIR;

  // Create workspace directory
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  // Generate and write CLAUDE.md
  const claudeMdPath = join(workspaceDir, "CLAUDE.md");
  const content = generateAdminCLAUDEmd();
  writeFileSync(claudeMdPath, content);

  return workspaceDir;
}

/**
 * Get the admin workspace directory path
 */
export function getAdminWorkspaceDir(): string {
  return ADMIN_WORKSPACE_DIR;
}

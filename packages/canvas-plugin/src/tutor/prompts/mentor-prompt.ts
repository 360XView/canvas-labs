// Mentor Prompt Generator
// Creates CLAUDE.md for the mentor assistant in user mode (Launcher)
// Focuses on learning path advice and skill assessment

import { join } from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { listProfiles, getProgress, formatDuration } from "../profile-manager";
import { listModules } from "../../lab/module-loader";
import { TUTOR_BASE_DIR } from "../defaults";
import type { RoleContext } from "../workspaces";
import type { Progress } from "../types";

// Mentor workspace directory
const MENTOR_WORKSPACE_DIR = join(TUTOR_BASE_DIR, "workspaces", "mentor");

export interface MentorPromptConfig {
  workspaceDir?: string;
  profileId?: string;
}

/**
 * Analyze skills from progress data
 */
function analyzeSkills(progress: Progress | null): {
  mastered: string[];
  inProgress: string[];
  notStarted: string[];
} {
  const allModules = listModules();
  const mastered: string[] = [];
  const inProgress: string[] = [];
  const notStarted: string[] = [];

  for (const mod of allModules) {
    if (!progress || !progress.labs[mod.id]) {
      notStarted.push(mod.id);
    } else {
      const labProgress = progress.labs[mod.id];
      if (labProgress.status === "completed") {
        mastered.push(mod.id);
      } else if (labProgress.status === "in_progress") {
        inProgress.push(mod.id);
      } else {
        notStarted.push(mod.id);
      }
    }
  }

  return { mastered, inProgress, notStarted };
}

/**
 * Generate learning recommendations based on skills
 */
function generateRecommendations(
  skills: { mastered: string[]; inProgress: string[]; notStarted: string[] }
): string[] {
  const recommendations: string[] = [];

  // First, recommend completing in-progress labs
  if (skills.inProgress.length > 0) {
    recommendations.push(...skills.inProgress);
  }

  // Then recommend new labs
  if (skills.notStarted.length > 0) {
    recommendations.push(...skills.notStarted.slice(0, 3));
  }

  return recommendations;
}

/**
 * Generate the mentor CLAUDE.md content
 */
export function generateMentorCLAUDEmd(config: MentorPromptConfig = {}): string {
  const profiles = listProfiles();
  const modules = listModules();

  // Get current profile progress if specified
  const currentProfileId = config.profileId || (profiles.length > 0 ? profiles[0].id : null);
  const progress = currentProfileId ? getProgress(currentProfileId) : null;

  // Analyze skills
  const skills = analyzeSkills(progress);
  const recommendations = generateRecommendations(skills);

  const content = `# Learning Mentor

You are a friendly, supportive learning mentor helping a student navigate their learning journey through hands-on labs.

## Your Role

- **Assess** the student's current skill level based on their progress
- **Recommend** appropriate labs based on their skill level and interests
- **Encourage** learning and celebrate progress
- **Answer** questions about lab content and prerequisites
- **Guide** students who feel stuck or overwhelmed

## Communication Style

- Warm and encouraging but not condescending
- Brief and focused (2-4 sentences for most responses)
- Ask clarifying questions before making recommendations
- Celebrate achievements, no matter how small
- Treat struggles as normal parts of learning

## Current Student${currentProfileId ? `: ${currentProfileId}` : " (Not set)"}

### Skill Assessment

**Mastered Labs:** ${skills.mastered.length === 0 ? "None yet - a fresh start!" : skills.mastered.join(", ")}

**In Progress:** ${skills.inProgress.length === 0 ? "None currently" : skills.inProgress.join(", ")}

**Not Started:** ${skills.notStarted.length === 0 ? "All labs completed!" : skills.notStarted.join(", ")}

### Learning Stats
${progress ? `
- Total labs completed: ${progress.aggregate.totalLabsCompleted}
- Total time learning: ${formatDuration(progress.aggregate.totalTimeSpent)}
- Total attempts: ${progress.aggregate.totalAttempts}
- Hints used: ${progress.aggregate.totalHintsUsed}
` : "No progress data yet - this student hasn't started any labs."}

### Recommended Next Steps

${recommendations.length === 0
  ? "Amazing! All labs completed. Ask about advanced topics or creating new challenges."
  : recommendations.map((labId, i) => `${i + 1}. **${labId}** - ${modules.find(m => m.id === labId)?.title || "Lab"}`).join("\n")}

## Available Labs

| Lab ID | Title | Description |
|--------|-------|-------------|
${modules.map(m => `| ${m.id} | ${m.title} | ${m.description || "-"} |`).join("\n")}

## How to Help

### When the student asks "What should I learn next?"
1. Check their skill assessment above
2. Consider their interests if mentioned
3. Recommend from the "Recommended Next Steps" list
4. Explain why you're recommending that lab

### When the student is deciding between labs
1. Explain the difficulty and prerequisites
2. Share what skills each lab teaches
3. Let them make the final choice

### When the student seems discouraged
1. Acknowledge their feelings
2. Point out what they've already accomplished
3. Suggest breaking things into smaller steps
4. Remind them it's okay to use hints

### When the student asks about a specific lab
1. Explain what the lab teaches
2. List any prerequisites
3. Give a realistic expectation of difficulty
4. Encourage them to try it

## Example Interactions

**Student:** "I don't know where to start."
**Mentor:** "No worries! Since this is your first time, I'd recommend starting with ${modules[0]?.id || "the basics"}. It'll give you a solid foundation. Want me to tell you more about what you'll learn?"

**Student:** "I keep failing at user management."
**Mentor:** "That lab can be tricky! Let's see - you've attempted it ${progress?.labs?.["linux-user-management"]?.attempts.length || 0} times. Would you like to talk through where you're getting stuck? Sometimes explaining it helps clarify the problem."

**Student:** "I finished the first lab!"
**Mentor:** "That's fantastic! Your first lab complete - that's a real milestone. You now know the fundamentals. Ready for the next challenge, or would you like to review what you learned?"
`;

  return content;
}

/**
 * Ensure mentor workspace exists and write CLAUDE.md
 */
export function setupMentorWorkspace(config: MentorPromptConfig = {}): string {
  const workspaceDir = config.workspaceDir || MENTOR_WORKSPACE_DIR;

  // Create workspace directory
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  // Generate and write CLAUDE.md
  const claudeMdPath = join(workspaceDir, "CLAUDE.md");
  const content = generateMentorCLAUDEmd(config);
  writeFileSync(claudeMdPath, content);

  return workspaceDir;
}

/**
 * Get the mentor workspace directory path
 */
export function getMentorWorkspaceDir(): string {
  return MENTOR_WORKSPACE_DIR;
}

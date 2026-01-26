// Prompt Generators Index
// Re-exports all prompt generators for role-based Claude Code contexts

export {
  generateMentorCLAUDEmd,
  setupMentorWorkspace,
  getMentorWorkspaceDir,
  type MentorPromptConfig,
} from "./mentor-prompt";

export {
  generateAdminCLAUDEmd,
  setupAdminWorkspace,
  getAdminWorkspaceDir,
  type AdminPromptConfig,
} from "./admin-prompt";

export {
  generateDeveloperCLAUDEmd,
  setupDeveloperWorkspace,
  getDeveloperWorkspaceDir,
  type DeveloperPromptConfig,
} from "./developer-prompt";

export {
  generateTutorCLAUDEmd,
  setupTutorWorkspace,
  type TutorPromptConfig,
} from "./tutor-prompt";

// Virtual Teaching Assistant Canvas Types

import type { LabType } from "../../lab/telemetry/types";

export interface VTAConfig {
  module?: Module;           // Direct module object
  moduleId?: string;         // Or just the module ID (VTA will load it)
  currentStepIndex?: number;
}

export interface Module {
  id: string;
  title: string;
  description?: string;
  steps: Step[];
  labType?: LabType;  // NEW: Lab type, defaults to "linux_cli"
}

export interface Step {
  id: string;
  title: string;
  type: "introduction" | "task" | "question" | "summary";
  content: StepContent;
  completed?: boolean;
}

export interface StepContent {
  instructions?: string;
  tasks?: TaskItem[];
  hints?: Hint[];
  solution?: Solution;
  question?: Question;
}

export interface TaskItem {
  text: string;
  details?: string[];
  completed?: boolean;
}

export interface Hint {
  id: string;
  text: string;
  revealed?: boolean;
}

export interface Solution {
  description?: string;
  command?: string;
  explanation?: string;
  revealed?: boolean;
}

export interface Question {
  text: string;
  type: "single" | "multiple";
  options: QuestionOption[];
  answered?: boolean;
  // Feedback fields
  explanation?: string;  // Shown after answering
  userAnswer?: string[]; // Option IDs selected by user
  isCorrect?: boolean;   // Result of evaluation
}

export interface QuestionOption {
  id: string;
  text: string;
  selected?: boolean;
  correct?: boolean;  // Marks correct answer(s)
  feedback?: string;  // Optional per-option feedback
}

export interface VTAResult {
  moduleId: string;
  completedSteps: string[];
  currentStepId: string;
  answers?: Record<string, string[]>;
  action: "completed" | "cancelled" | "next" | "previous";
}

// Color palette for vTA
export const VTA_COLORS = {
  primary: "cyan",
  secondary: "blue",
  success: "green",
  warning: "yellow",
  error: "red",
  muted: "gray",
  highlight: "magenta",
  bg: "black",
} as const;

// Demo data for testing
export function getDemoModule(): Module {
  return {
    id: "linux-user-management",
    title: "Linux User Management",
    description: "Learn to manage users, groups, and permissions in Linux",
    steps: [
      {
        id: "introduction",
        title: "Introduction",
        type: "introduction",
        content: {
          instructions: `Your supervisor Anna assigned you the role of the new junior system administrator for Angels and Scooters servers. You are now connected to the server where you need to manage users.

In this lab, you will:
1. Become the root user
2. Create a new user account
3. Configure proper permissions
4. Set up group membership

The system will automatically verify when you complete each task.`,
        },
      },
      {
        id: "become-root",
        title: "Become the Root User",
        type: "task",
        content: {
          instructions:
            "After successfully logging in to the server with SSH, become the root user. You'll need root privileges to create users and modify system settings.",
          tasks: [
            {
              text: "Change to the **root** user",
            },
          ],
          hints: [
            {
              id: "hint-1",
              text: "Use the `sudo` command to execute commands as the superuser, or `su` to switch users.",
            },
          ],
          solution: {
            description: "Execute one of the following commands:",
            command: "sudo su\n# or\nsu root",
            explanation:
              "The `sudo su` command switches to the root user using your current user's sudo privileges.",
          },
        },
      },
      {
        id: "create-user",
        title: "Create a New User",
        type: "task",
        content: {
          instructions:
            "Anna needs you to create a new user account for a developer joining the team. Create a user named `devuser` with a home directory.",
          tasks: [
            {
              text: "Create a new user named **devuser**",
              details: [
                "The user should have a home directory at `/home/devuser`",
                "Use the standard user creation command",
              ],
            },
          ],
          hints: [
            {
              id: "hint-1",
              text: "The `useradd` command creates new users. Use the `-m` flag to create a home directory:\n\n    useradd -m <username>",
            },
          ],
          solution: {
            command: "useradd -m devuser",
            explanation:
              "The `-m` flag ensures a home directory is created for the new user.",
          },
        },
      },
      {
        id: "set-permissions",
        title: "Set Home Directory Permissions",
        type: "task",
        content: {
          instructions:
            "For security, the developer's home directory should only be accessible by the owner and readable by their group. Set the permissions to `750` (rwxr-x---).",
          tasks: [
            {
              text: "Set permissions on `/home/devuser` to **750**",
              details: [
                "Owner: read, write, execute (7)",
                "Group: read, execute (5)",
                "Others: no access (0)",
              ],
            },
          ],
          hints: [
            {
              id: "hint-1",
              text: "Use the `chmod` command to change permissions:\n\n    chmod <mode> <path>",
            },
          ],
          solution: {
            command: "chmod 750 /home/devuser",
            explanation:
              "This sets the directory so only the owner has full access, group members can read and enter, and others have no access.",
          },
        },
      },
      {
        id: "add-to-group",
        title: "Add User to Developers Group",
        type: "task",
        content: {
          instructions:
            "The company uses a `developers` group for all development team members. Add `devuser` to this group so they can access shared development resources.",
          tasks: [
            {
              text: "Add **devuser** to the **developers** group",
              details: [
                "The `developers` group already exists on the system",
                "Add as a supplementary group (don't change primary group)",
              ],
            },
          ],
          hints: [
            {
              id: "hint-1",
              text: "Use `usermod` with the `-aG` flags to append a user to a group:\n\n    usermod -aG <group> <user>",
            },
          ],
          solution: {
            command: "usermod -aG developers devuser",
            explanation:
              "The `-a` flag appends (rather than replaces) and `-G` specifies supplementary groups.",
          },
        },
      },
      {
        id: "summary",
        title: "Lab Complete!",
        type: "summary",
        content: {
          instructions: `Congratulations! You have successfully:

✓ Connected to the server via SSH
✓ Elevated to root privileges
✓ Created a new user account
✓ Set appropriate directory permissions
✓ Configured group membership

These are fundamental skills for Linux system administration. The user \`devuser\` is now ready to use the system with proper security settings.`,
        },
      },
    ],
  };
}

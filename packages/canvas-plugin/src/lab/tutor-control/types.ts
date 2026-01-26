// Types for tutor control commands
// Used for communication between Claude Code tutor and the lab monitor

export type TutorCommandType = "addStep" | "markComplete";

export interface AddStepPayload {
  stepId: string;
  step: {
    title: string;
    type: "task";
    content: {
      instructions: string;
      tasks?: Array<{ text: string }>;
      hints?: string[];
    };
  };
  afterStepId?: string; // Insert after this step (defaults to before summary)
}

export interface MarkCompletePayload {
  stepId: string;
  source: "tutor";
}

export type CommandPayload = AddStepPayload | MarkCompletePayload;

export interface TutorCommand {
  id: string;
  type: TutorCommandType;
  payload: CommandPayload;
  status: "pending" | "done" | "error";
  error?: string;
  processedAt?: string;
}

export interface TutorCommandsFile {
  commands: TutorCommand[];
}

export function isAddStepPayload(payload: CommandPayload): payload is AddStepPayload {
  return "step" in payload;
}

export function isMarkCompletePayload(payload: CommandPayload): payload is MarkCompletePayload {
  return "source" in payload && (payload as MarkCompletePayload).source === "tutor";
}

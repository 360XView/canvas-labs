// Lab configuration types for vTA integration

export interface LabConfig {
  moduleId: string;
  dockerImage: string;
  logDirectory: string;
  socketPath: string;
  validationRulesModule: string;
}

export interface ValidationRule {
  stepId: string;
  taskIndex?: number;
  pattern?: RegExp;
  userCheck?: "root" | "student" | string;
  description: string;
}

export interface LabState {
  status: "starting" | "running" | "stopped" | "error";
  containerId?: string;
  monitorPid?: number;
  message?: string;
  completedSteps: Set<string>;
}

export interface LabFeedbackOptions {
  socketPath: string;
  onTaskCompleted: (stepId: string, taskId: string) => void;
  onStatusChange: (status: "running" | "stopped", message?: string) => void;
  onError?: (error: Error) => void;
}

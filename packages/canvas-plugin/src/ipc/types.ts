// IPC Message Types for Canvas Communication

// Messages sent from Controller (Claude) to Canvas
export type ControllerMessage =
  | { type: "close" }
  | { type: "update"; config: unknown }
  | { type: "ping" }
  | { type: "getSelection" }
  | { type: "getContent" };

// Messages sent from Canvas to Controller (Claude)
export type CanvasMessage =
  | { type: "ready"; scenario: string }
  | { type: "selected"; data: unknown }
  | { type: "cancelled"; reason?: string }
  | { type: "error"; message: string }
  | { type: "pong" }
  | { type: "selection"; data: { selectedText: string; startOffset: number; endOffset: number } | null }
  | { type: "content"; data: { content: string; cursorPosition: number } };

// Dynamic step added by tutor during lab session
export interface DynamicStep {
  id: string;
  title: string;
  type: "task" | "question";  // Support question type
  content: {
    instructions?: string;
    tasks?: Array<{ text: string }>;
    hints?: string[];
    // Question-specific content
    question?: {
      text: string;
      type: "single" | "multiple";
      options: Array<{ id: string; text: string; correct: boolean; feedback?: string }>;
      explanation?: string;
    };
  };
  source: "tutor";
}

// Question answer result for state tracking
export interface QuestionResult {
  answered: boolean;
  isCorrect: boolean;
  selectedOptions: string[];
  correctOptions: string[];
  attempts: number;
}

// Lab environment messages (sent from Monitor to vTA Canvas)
export type LabMessage =
  | { type: "taskCompleted"; taskId: string; stepId: string; source?: "command" | "check" | "tutor" }
  | { type: "labStatus"; status: "running" | "stopped"; message?: string }
  | { type: "addDynamicStep"; step: DynamicStep; afterStepId?: string }
  | { type: "tutorCommandAck"; commandId: string; status: "done" | "error"; message?: string }
  | { type: "questionAnswered"; stepId: string; isCorrect: boolean; selectedOptions: string[]; correctOptions: string[]; attempts: number }
  | { type: "ping" }
  // Interactive presentation messages (Tutor → VTA)
  | { type: "highlight"; segmentIndex: number }
  | { type: "clearHighlight" };

// Socket path convention
export function getSocketPath(id: string): string {
  return `/tmp/canvas-${id}.sock`;
}

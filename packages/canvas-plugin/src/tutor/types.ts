// Tutor Profile System Types

export interface Profile {
  version: "1.0";
  name: string;
  id: string;
  createdAt: string; // ISO 8601
  lastActiveAt: string; // ISO 8601
}

export interface StepProgress {
  status: "pending" | "in_progress" | "completed";
  timeSpent?: number; // seconds
  hintsRevealed?: number;
}

export interface Mistake {
  stepId: string;
  command: string;
  category: "wrong_arguments" | "wrong_command" | "permission_error" | "syntax_error" | "other";
  timestamp?: string;
}

export interface LabAttempt {
  id: string;
  startedAt: string; // ISO 8601
  completedAt?: string; // ISO 8601 - set when lab is fully completed
  abandonedAt?: string; // ISO 8601 - set when session is abandoned/quit before completion
  totalTime?: number; // seconds
  hintsUsed: number;
  steps: Record<string, StepProgress>;
  mistakes: Mistake[];
}

export interface LabProgress {
  status: "not_started" | "in_progress" | "completed";
  attempts: LabAttempt[];
  bestTime?: number; // seconds
  bestAttemptId?: string;
}

export interface AggregateStats {
  totalLabsCompleted: number;
  totalTimeSpent: number; // seconds
  totalHintsUsed: number;
  totalAttempts: number;
}

export interface Progress {
  version: "1.0";
  profileId: string;
  labs: Record<string, LabProgress>;
  aggregate: AggregateStats;
}

export interface TutorConfig {
  version: "1.0";
  defaultProfile: string;
}

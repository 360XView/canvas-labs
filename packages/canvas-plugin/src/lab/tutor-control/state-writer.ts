// State Writer
// Maintains state.json for tutor to read current lab state
// Extended to include confidence scores from telemetry

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ScoreModifier } from "../telemetry/types";

export interface QuestionResult {
  answered: boolean;
  isCorrect: boolean;
  selectedOptions: string[];
  correctOptions: string[];
  attempts: number;
}

export interface StepState {
  id: string;
  completed: boolean;
  completedBy?: "command" | "check" | "tutor" | "question";
  completedAt?: string;
  source?: "module" | "tutor"; // Whether step is from original module or dynamically added
  questionResult?: QuestionResult; // Present for question steps

  // Scoring fields (populated from telemetry)
  confidence?: number; // 0.0 - 1.0
  modifiers?: ScoreModifier[]; // Score adjustments (hints, retries, etc.)
  hintsRevealed?: number;
  solutionViewed?: boolean;
  checkAttempts?: number;
}

export interface LabState {
  version: number;
  lastUpdated: string;
  steps: StepState[];

  // Overall scoring (computed from steps)
  scoring?: {
    presetId: string;
    overallScore: number;
    completionPct: number;
    passed: boolean;
    sessionId?: string;
  };
}

export interface StateWriterOptions {
  logDir: string;
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
}

export interface StepScoreUpdate {
  confidence: number;
  modifiers: ScoreModifier[];
  hintsRevealed?: number;
  solutionViewed?: boolean;
  checkAttempts?: number;
}

export interface OverallScoreUpdate {
  presetId: string;
  overallScore: number;
  completionPct: number;
  passed: boolean;
  sessionId?: string;
}

export interface StateWriter {
  initialize: (stepIds: string[]) => void;
  markCompleted: (stepId: string, source: "command" | "check" | "tutor") => void;
  addStep: (stepId: string, afterStepId?: string) => void;
  recordQuestionAnswer: (stepId: string, result: QuestionResult) => void;
  updateStepScore: (stepId: string, score: StepScoreUpdate) => void;
  updateOverallScore: (score: OverallScoreUpdate) => void;
  recordHintRevealed: (stepId: string, hintIndex: number) => void;
  recordSolutionViewed: (stepId: string) => void;
  getState: () => LabState | null;
}

export function createStateWriter(options: StateWriterOptions): StateWriter {
  const { logDir, onLog, onError } = options;
  const statePath = join(logDir, "state.json");

  const log = (msg: string) => onLog?.(msg);

  function readState(): LabState | null {
    try {
      if (!existsSync(statePath)) {
        return null;
      }
      const content = readFileSync(statePath, "utf-8").trim();
      if (!content) {
        return null;
      }
      return JSON.parse(content) as LabState;
    } catch (e) {
      onError?.(new Error(`Failed to read state.json: ${e}`));
      return null;
    }
  }

  function writeState(state: LabState): void {
    try {
      state.lastUpdated = new Date().toISOString();
      writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch (e) {
      onError?.(new Error(`Failed to write state.json: ${e}`));
    }
  }

  return {
    initialize(stepIds: string[]) {
      const state: LabState = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        steps: stepIds.map((id) => ({
          id,
          completed: false,
          source: "module",
        })),
      };
      writeState(state);
      log(`State initialized with ${stepIds.length} steps`);
    },

    markCompleted(stepId: string, source: "command" | "check" | "tutor") {
      const state = readState();
      if (!state) {
        log(`Cannot mark completed: state not initialized`);
        return;
      }

      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        if (!step.completed) {
          step.completed = true;
          step.completedBy = source;
          step.completedAt = new Date().toISOString();
          writeState(state);
          log(`Step ${stepId} marked completed via ${source}`);
        }
      } else {
        log(`Step ${stepId} not found in state`);
      }
    },

    addStep(stepId: string, afterStepId?: string) {
      const state = readState();
      if (!state) {
        log(`Cannot add step: state not initialized`);
        return;
      }

      // Check if step already exists
      if (state.steps.some((s) => s.id === stepId)) {
        log(`Step ${stepId} already exists`);
        return;
      }

      const newStep: StepState = {
        id: stepId,
        completed: false,
        source: "tutor",
      };

      if (afterStepId) {
        const afterIndex = state.steps.findIndex((s) => s.id === afterStepId);
        if (afterIndex >= 0) {
          state.steps.splice(afterIndex + 1, 0, newStep);
        } else {
          state.steps.push(newStep);
        }
      } else {
        // Insert before last step (summary)
        const insertIndex = Math.max(0, state.steps.length - 1);
        state.steps.splice(insertIndex, 0, newStep);
      }

      writeState(state);
      log(`Added dynamic step ${stepId}`);
    },

    recordQuestionAnswer(stepId: string, result: QuestionResult) {
      const state = readState();
      if (!state) {
        log(`Cannot record question answer: state not initialized`);
        return;
      }

      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        // Increment attempts if re-answering
        const previousAttempts = step.questionResult?.attempts || 0;
        step.completed = true;
        step.completedBy = "question";
        step.completedAt = new Date().toISOString();
        step.questionResult = {
          ...result,
          attempts: previousAttempts + 1,
        };
        writeState(state);
        log(`Question ${stepId} answered: ${result.isCorrect ? "correct" : "incorrect"} (attempt ${previousAttempts + 1})`);
      } else {
        log(`Step ${stepId} not found in state`);
      }
    },

    updateStepScore(stepId: string, score: StepScoreUpdate) {
      const state = readState();
      if (!state) {
        log(`Cannot update step score: state not initialized`);
        return;
      }

      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        step.confidence = score.confidence;
        step.modifiers = score.modifiers;
        if (score.hintsRevealed !== undefined) {
          step.hintsRevealed = score.hintsRevealed;
        }
        if (score.solutionViewed !== undefined) {
          step.solutionViewed = score.solutionViewed;
        }
        if (score.checkAttempts !== undefined) {
          step.checkAttempts = score.checkAttempts;
        }
        writeState(state);
        log(`Step ${stepId} score updated: ${Math.round(score.confidence * 100)}%`);
      } else {
        log(`Step ${stepId} not found in state`);
      }
    },

    updateOverallScore(score: OverallScoreUpdate) {
      const state = readState();
      if (!state) {
        log(`Cannot update overall score: state not initialized`);
        return;
      }

      state.scoring = {
        presetId: score.presetId,
        overallScore: score.overallScore,
        completionPct: score.completionPct,
        passed: score.passed,
        sessionId: score.sessionId,
      };
      writeState(state);
      log(`Overall score updated: ${Math.round(score.overallScore * 100)}% (${score.completionPct}% complete)`);
    },

    recordHintRevealed(stepId: string, hintIndex: number) {
      const state = readState();
      if (!state) {
        log(`Cannot record hint: state not initialized`);
        return;
      }

      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        // Track the highest hint index revealed (0-indexed)
        const currentHints = step.hintsRevealed || 0;
        step.hintsRevealed = Math.max(currentHints, hintIndex + 1);
        writeState(state);
        log(`Hint ${hintIndex + 1} revealed for step ${stepId}`);
      } else {
        log(`Step ${stepId} not found in state`);
      }
    },

    recordSolutionViewed(stepId: string) {
      const state = readState();
      if (!state) {
        log(`Cannot record solution viewed: state not initialized`);
        return;
      }

      const step = state.steps.find((s) => s.id === stepId);
      if (step) {
        step.solutionViewed = true;
        writeState(state);
        log(`Solution viewed for step ${stepId}`);
      } else {
        log(`Step ${stepId} not found in state`);
      }
    },

    getState() {
      return readState();
    },
  };
}

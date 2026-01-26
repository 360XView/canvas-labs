// Scoring Presets Configuration
// Configurable scoring rules for different assessment modes
// Following Readiness Radar patterns: penalties, bonuses, thresholds

import type { ScoringPreset, ScoringModifiers, ScoreModifier } from "./types";

// ============================================================================
// PRESET DEFINITIONS
// ============================================================================

export const SCORING_PRESETS: Record<string, ScoringPreset> = {
  strict: {
    id: "strict",
    name: "Strict Binary",
    description:
      "No partial credit. Any hint, solution, or retry results in failure. Used for certification assessments.",
    modifiers: {
      hint_penalty: 1.0, // Any hint = fail
      solution_penalty: 1.0, // Any solution view = fail
      retry_penalty: 1.0, // Any retry = fail
      first_try_bonus: 0, // No bonus in strict mode
    },
    min_confidence: 0.0, // No floor
    pass_threshold: 1.0, // Must be perfect
  },

  partial_credit: {
    id: "partial_credit",
    name: "Partial Credit",
    description:
      "Gradual penalties for hints and retries. Rewards first-try success. Recommended for learning environments.",
    modifiers: {
      hint_penalty: 0.15, // -15% per hint
      solution_penalty: 0.25, // -25% for viewing solution
      retry_penalty: 0.1, // -10% per retry after first
      first_try_bonus: 0.1, // +10% for first try success
    },
    min_confidence: 0.2, // Floor at 20%
    pass_threshold: 0.7, // 70% to pass
  },

  practice_mode: {
    id: "practice_mode",
    name: "Practice Mode",
    description:
      "Minimal penalties. Hints and solutions encouraged for learning. No pass/fail threshold.",
    modifiers: {
      hint_penalty: 0.05, // -5% per hint (minimal)
      solution_penalty: 0.1, // -10% for solution
      retry_penalty: 0.05, // -5% per retry
      first_try_bonus: 0.05, // +5% for first try
    },
    min_confidence: 0.5, // Floor at 50%
    pass_threshold: 0.0, // No pass threshold (always pass)
  },
};

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate confidence score based on modifiers
 * Starts at 1.0 and applies penalties/bonuses
 */
export function calculateConfidence(
  preset: ScoringPreset,
  hintsUsed: number,
  solutionViewed: boolean,
  retryAttempts: number,
  isFirstTrySuccess: boolean
): { confidence: number; modifiers: ScoreModifier[] } {
  const modifiers: ScoreModifier[] = [];
  let confidence = 1.0;

  // Apply hint penalties
  if (hintsUsed > 0) {
    const penalty = hintsUsed * preset.modifiers.hint_penalty;
    confidence -= penalty;
    modifiers.push({
      kind: "hint_used",
      count: hintsUsed,
      delta: -penalty,
      note: `Revealed ${hintsUsed} hint${hintsUsed > 1 ? "s" : ""}`,
    });
  }

  // Apply solution penalty
  if (solutionViewed) {
    confidence -= preset.modifiers.solution_penalty;
    modifiers.push({
      kind: "solution_viewed",
      count: 1,
      delta: -preset.modifiers.solution_penalty,
      note: "Viewed solution",
    });
  }

  // Apply retry penalties (only for attempts after the first)
  if (retryAttempts > 0) {
    const penalty = retryAttempts * preset.modifiers.retry_penalty;
    confidence -= penalty;
    modifiers.push({
      kind: "retry_attempt",
      count: retryAttempts,
      delta: -penalty,
      note: `${retryAttempts} retry attempt${retryAttempts > 1 ? "s" : ""}`,
    });
  }

  // Apply first try bonus
  if (isFirstTrySuccess && preset.modifiers.first_try_bonus > 0) {
    confidence += preset.modifiers.first_try_bonus;
    modifiers.push({
      kind: "first_try_bonus",
      count: 1,
      delta: preset.modifiers.first_try_bonus,
      note: "Completed on first try",
    });
  }

  // Apply floor
  confidence = Math.max(confidence, preset.min_confidence);

  // Cap at 1.0
  confidence = Math.min(confidence, 1.0);

  return { confidence, modifiers };
}

/**
 * Determine if a task passes based on confidence and preset threshold
 */
export function isPassing(confidence: number, preset: ScoringPreset): boolean {
  return confidence >= preset.pass_threshold;
}

/**
 * Calculate weighted average score for a lab
 */
export function calculateOverallScore(
  tasks: Array<{ confidence: number; weight: number }>
): number {
  if (tasks.length === 0) {
    return 0;
  }

  const totalWeight = tasks.reduce((sum, t) => sum + t.weight, 0);
  if (totalWeight === 0) {
    return 0;
  }

  const weightedSum = tasks.reduce((sum, t) => sum + t.confidence * t.weight, 0);
  return weightedSum / totalWeight;
}

/**
 * Calculate completion percentage
 */
export function calculateCompletionPct(
  completedTasks: number,
  totalTasks: number
): number {
  if (totalTasks === 0) {
    return 100;
  }
  return Math.round((completedTasks / totalTasks) * 100);
}

/**
 * Get preset by ID, with fallback to partial_credit
 */
export function getPreset(presetId: string): ScoringPreset {
  return SCORING_PRESETS[presetId] || SCORING_PRESETS.partial_credit;
}

/**
 * List all available preset IDs
 */
export function listPresetIds(): string[] {
  return Object.keys(SCORING_PRESETS);
}

/**
 * Format confidence as percentage string
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Format score with color hint (for terminal output)
 */
export function getScoreColor(
  confidence: number,
  preset: ScoringPreset
): "green" | "yellow" | "red" {
  if (confidence >= preset.pass_threshold) {
    return "green";
  }
  if (confidence >= preset.min_confidence + 0.1) {
    return "yellow";
  }
  return "red";
}

/**
 * Generate human-readable score explanation
 */
export function explainScore(
  confidence: number,
  modifiers: ScoreModifier[],
  preset: ScoringPreset
): string {
  const parts: string[] = [];

  parts.push(`Score: ${formatConfidence(confidence)}`);

  if (modifiers.length > 0) {
    parts.push("Modifiers:");
    for (const mod of modifiers) {
      const sign = mod.delta >= 0 ? "+" : "";
      parts.push(`  ${sign}${Math.round(mod.delta * 100)}% - ${mod.note}`);
    }
  }

  const passing = isPassing(confidence, preset);
  parts.push(`Status: ${passing ? "PASS" : "NEEDS IMPROVEMENT"} (threshold: ${formatConfidence(preset.pass_threshold)})`);

  return parts.join("\n");
}

// ============================================================================
// PRESET CUSTOMIZATION
// ============================================================================

/**
 * Create a custom preset by modifying an existing one
 */
export function createCustomPreset(
  basePresetId: string,
  overrides: Partial<{
    name: string;
    description: string;
    modifiers: Partial<ScoringModifiers>;
    min_confidence: number;
    pass_threshold: number;
  }>
): ScoringPreset {
  const base = getPreset(basePresetId);

  return {
    id: "custom" as ScoringPreset["id"],
    name: overrides.name || `Custom (based on ${base.name})`,
    description: overrides.description || base.description,
    modifiers: {
      ...base.modifiers,
      ...overrides.modifiers,
    },
    min_confidence: overrides.min_confidence ?? base.min_confidence,
    pass_threshold: overrides.pass_threshold ?? base.pass_threshold,
  };
}

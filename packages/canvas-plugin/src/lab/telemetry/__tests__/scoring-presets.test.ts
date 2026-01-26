// Scoring Presets Tests
// Tests for confidence scoring calculations across all three presets

import { describe, test, expect } from "bun:test";
import {
  SCORING_PRESETS,
  calculateConfidence,
  isPassing,
  calculateOverallScore,
  calculateCompletionPct,
  getPreset,
  listPresetIds,
  formatConfidence,
  getScoreColor,
  explainScore,
  createCustomPreset,
} from "../scoring-presets";

describe("Scoring Presets", () => {
  describe("Strict Mode", () => {
    const preset = SCORING_PRESETS.strict;

    test("preset has correct configuration", () => {
      expect(preset.id).toBe("strict");
      expect(preset.modifiers.hint_penalty).toBe(1.0);
      expect(preset.modifiers.solution_penalty).toBe(1.0);
      expect(preset.modifiers.retry_penalty).toBe(1.0);
      expect(preset.modifiers.first_try_bonus).toBe(0);
      expect(preset.min_confidence).toBe(0.0);
      expect(preset.pass_threshold).toBe(1.0);
    });

    test("first try success = 1.0 confidence", () => {
      const result = calculateConfidence(preset, 0, false, 0, true);
      expect(result.confidence).toBe(1.0);
      expect(result.modifiers.length).toBe(0); // No bonus in strict mode
    });

    test("any hint used = 0.0 confidence", () => {
      const result = calculateConfidence(preset, 1, false, 0, false);
      expect(result.confidence).toBe(0.0);
      expect(result.modifiers.some((m) => m.kind === "hint_used")).toBe(true);
    });

    test("any retry = 0.0 confidence", () => {
      const result = calculateConfidence(preset, 0, false, 1, false);
      expect(result.confidence).toBe(0.0);
      expect(result.modifiers.some((m) => m.kind === "retry_attempt")).toBe(true);
    });

    test("solution viewed = 0.0 confidence", () => {
      const result = calculateConfidence(preset, 0, true, 0, false);
      expect(result.confidence).toBe(0.0);
      expect(result.modifiers.some((m) => m.kind === "solution_viewed")).toBe(true);
    });

    test("isPassing() requires 1.0 (perfect)", () => {
      expect(isPassing(1.0, preset)).toBe(true);
      expect(isPassing(0.99, preset)).toBe(false);
      expect(isPassing(0.5, preset)).toBe(false);
      expect(isPassing(0.0, preset)).toBe(false);
    });
  });

  describe("Partial Credit Mode", () => {
    const preset = SCORING_PRESETS.partial_credit;

    test("preset has correct configuration", () => {
      expect(preset.id).toBe("partial_credit");
      expect(preset.modifiers.hint_penalty).toBe(0.15);
      expect(preset.modifiers.solution_penalty).toBe(0.25);
      expect(preset.modifiers.retry_penalty).toBe(0.1);
      expect(preset.modifiers.first_try_bonus).toBe(0.1);
      expect(preset.min_confidence).toBe(0.2);
      expect(preset.pass_threshold).toBe(0.7);
    });

    test("first try success = 1.0 + 0.10 bonus = 1.0 (capped)", () => {
      const result = calculateConfidence(preset, 0, false, 0, true);
      expect(result.confidence).toBe(1.0); // Capped at 1.0
      expect(result.modifiers.some((m) => m.kind === "first_try_bonus")).toBe(true);
      expect(result.modifiers.find((m) => m.kind === "first_try_bonus")?.delta).toBe(0.1);
    });

    test("one hint = 1.0 - 0.15 = 0.85", () => {
      const result = calculateConfidence(preset, 1, false, 0, false);
      expect(result.confidence).toBe(0.85);
      expect(result.modifiers.find((m) => m.kind === "hint_used")?.delta).toBe(-0.15);
    });

    test("two hints = 1.0 - 0.30 = 0.70", () => {
      const result = calculateConfidence(preset, 2, false, 0, false);
      expect(result.confidence).toBe(0.7);
      expect(result.modifiers.find((m) => m.kind === "hint_used")?.count).toBe(2);
    });

    test("solution viewed = 1.0 - 0.25 = 0.75", () => {
      const result = calculateConfidence(preset, 0, true, 0, false);
      expect(result.confidence).toBe(0.75);
    });

    test("one retry = 1.0 - 0.10 = 0.90", () => {
      const result = calculateConfidence(preset, 0, false, 1, false);
      expect(result.confidence).toBe(0.9);
    });

    test("combined: hint + retry = 1.0 - 0.15 - 0.10 = 0.75", () => {
      const result = calculateConfidence(preset, 1, false, 1, false);
      expect(result.confidence).toBe(0.75);
      expect(result.modifiers.length).toBe(2);
    });

    test("combined: hint + solution + retry", () => {
      // 1.0 - 0.15 (hint) - 0.25 (solution) - 0.10 (retry) = 0.50
      const result = calculateConfidence(preset, 1, true, 1, false);
      expect(result.confidence).toBe(0.5);
      expect(result.modifiers.length).toBe(3);
    });

    test("floor at 0.20 (never goes below 20%)", () => {
      // Even with many penalties, should never go below floor
      const result = calculateConfidence(preset, 10, true, 10, false);
      // 1.0 - 1.5 (10 hints) - 0.25 (solution) - 1.0 (10 retries) = -1.75, capped at 0.20
      expect(result.confidence).toBe(0.2);
    });

    test("isPassing() requires >= 0.70 (70%)", () => {
      expect(isPassing(0.7, preset)).toBe(true);
      expect(isPassing(0.8, preset)).toBe(true);
      expect(isPassing(1.0, preset)).toBe(true);
      expect(isPassing(0.69, preset)).toBe(false);
      expect(isPassing(0.5, preset)).toBe(false);
    });
  });

  describe("Practice Mode", () => {
    const preset = SCORING_PRESETS.practice_mode;

    test("preset has correct configuration", () => {
      expect(preset.id).toBe("practice_mode");
      expect(preset.modifiers.hint_penalty).toBe(0.05);
      expect(preset.modifiers.solution_penalty).toBe(0.1);
      expect(preset.modifiers.retry_penalty).toBe(0.05);
      expect(preset.modifiers.first_try_bonus).toBe(0.05);
      expect(preset.min_confidence).toBe(0.5);
      expect(preset.pass_threshold).toBe(0.0);
    });

    test("minimal penalties applied", () => {
      // 1 hint = 1.0 - 0.05 = 0.95
      const hintResult = calculateConfidence(preset, 1, false, 0, false);
      expect(hintResult.confidence).toBe(0.95);

      // solution = 1.0 - 0.10 = 0.90
      const solutionResult = calculateConfidence(preset, 0, true, 0, false);
      expect(solutionResult.confidence).toBe(0.9);

      // retry = 1.0 - 0.05 = 0.95
      const retryResult = calculateConfidence(preset, 0, false, 1, false);
      expect(retryResult.confidence).toBe(0.95);
    });

    test("floor at 0.50 (50%)", () => {
      // Many penalties should floor at 0.50
      const result = calculateConfidence(preset, 20, true, 20, false);
      expect(result.confidence).toBe(0.5);
    });

    test("first try bonus is smaller (5%)", () => {
      const result = calculateConfidence(preset, 0, false, 0, true);
      expect(result.confidence).toBe(1.0); // Capped
      expect(result.modifiers.find((m) => m.kind === "first_try_bonus")?.delta).toBe(0.05);
    });

    test("isPassing() requires >= 0.0 (always passes)", () => {
      // Practice mode has 0.0 threshold - everything passes
      expect(isPassing(0.0, preset)).toBe(true);
      expect(isPassing(0.5, preset)).toBe(true);
      expect(isPassing(1.0, preset)).toBe(true);
    });
  });

  describe("Score Explanation", () => {
    test("explainScore() returns human-readable breakdown", () => {
      const preset = SCORING_PRESETS.partial_credit;
      const { confidence, modifiers } = calculateConfidence(preset, 2, true, 1, false);

      const explanation = explainScore(confidence, modifiers, preset);

      expect(explanation).toContain("Score:");
      expect(explanation).toContain("Modifiers:");
      expect(explanation).toContain("hint");
      expect(explanation).toContain("solution");
      expect(explanation).toContain("retry");
      expect(explanation).toContain("Status:");
    });

    test("shows base score + modifiers correctly", () => {
      const preset = SCORING_PRESETS.partial_credit;
      const { confidence, modifiers } = calculateConfidence(preset, 1, false, 0, true);

      const explanation = explainScore(confidence, modifiers, preset);

      // Should show first try bonus and hint penalty (but no hint here)
      expect(explanation).toContain("+10%");
      expect(explanation).toContain("first try");
    });

    test("lists each penalty with reason", () => {
      const preset = SCORING_PRESETS.partial_credit;
      const { confidence, modifiers } = calculateConfidence(preset, 2, true, 3, false);

      const explanation = explainScore(confidence, modifiers, preset);

      // Check for hint penalty
      expect(explanation).toContain("-30%"); // 2 hints × 15%
      expect(explanation).toContain("2 hints");

      // Check for solution penalty
      expect(explanation).toContain("-25%");
      expect(explanation).toContain("solution");

      // Check for retry penalty
      expect(explanation).toContain("-30%"); // 3 retries × 10%
      expect(explanation).toContain("3 retry");
    });
  });

  describe("Overall Score Calculation", () => {
    test("calculateOverallScore() weights tasks correctly", () => {
      const tasks = [
        { confidence: 1.0, weight: 30 }, // Critical task
        { confidence: 0.5, weight: 20 }, // Medium task
        { confidence: 0.8, weight: 10 }, // Optional task
      ];

      // Weighted sum = (30*1.0 + 20*0.5 + 10*0.8) / 60 = (30 + 10 + 8) / 60 = 48/60 = 0.80
      const overall = calculateOverallScore(tasks);
      expect(overall).toBe(0.8);
    });

    test("handles empty tasks array", () => {
      const overall = calculateOverallScore([]);
      expect(overall).toBe(0);
    });

    test("handles zero total weight", () => {
      const tasks = [
        { confidence: 1.0, weight: 0 },
        { confidence: 0.5, weight: 0 },
      ];
      const overall = calculateOverallScore(tasks);
      expect(overall).toBe(0);
    });

    test("single task returns its confidence", () => {
      const tasks = [{ confidence: 0.75, weight: 1 }];
      const overall = calculateOverallScore(tasks);
      expect(overall).toBe(0.75);
    });

    test("equal weights = simple average", () => {
      const tasks = [
        { confidence: 1.0, weight: 1 },
        { confidence: 0.5, weight: 1 },
        { confidence: 0.8, weight: 1 },
      ];
      // (1.0 + 0.5 + 0.8) / 3 = 2.3 / 3 ≈ 0.767
      const overall = calculateOverallScore(tasks);
      expect(overall).toBeCloseTo(0.767, 2);
    });
  });
});

describe("Utility Functions", () => {
  describe("getPreset()", () => {
    test("returns correct preset by ID", () => {
      expect(getPreset("strict").id).toBe("strict");
      expect(getPreset("partial_credit").id).toBe("partial_credit");
      expect(getPreset("practice_mode").id).toBe("practice_mode");
    });

    test("falls back to partial_credit for unknown ID", () => {
      const preset = getPreset("unknown");
      expect(preset.id).toBe("partial_credit");
    });
  });

  describe("listPresetIds()", () => {
    test("returns all preset IDs", () => {
      const ids = listPresetIds();
      expect(ids).toContain("strict");
      expect(ids).toContain("partial_credit");
      expect(ids).toContain("practice_mode");
      expect(ids.length).toBe(3);
    });
  });

  describe("formatConfidence()", () => {
    test("formats as percentage string", () => {
      expect(formatConfidence(1.0)).toBe("100%");
      expect(formatConfidence(0.75)).toBe("75%");
      expect(formatConfidence(0.5)).toBe("50%");
      expect(formatConfidence(0.0)).toBe("0%");
    });

    test("rounds to nearest integer", () => {
      expect(formatConfidence(0.756)).toBe("76%");
      expect(formatConfidence(0.754)).toBe("75%");
    });
  });

  describe("getScoreColor()", () => {
    const preset = SCORING_PRESETS.partial_credit;

    test("returns green for passing scores", () => {
      expect(getScoreColor(0.7, preset)).toBe("green");
      expect(getScoreColor(0.8, preset)).toBe("green");
      expect(getScoreColor(1.0, preset)).toBe("green");
    });

    test("returns yellow for below threshold but above floor + 0.1", () => {
      // Floor is 0.20, so yellow range is > 0.30 and < 0.70
      expect(getScoreColor(0.5, preset)).toBe("yellow");
      expect(getScoreColor(0.4, preset)).toBe("yellow");
      expect(getScoreColor(0.31, preset)).toBe("yellow");
    });

    test("returns red for low scores", () => {
      // At or below floor + 0.1 = 0.30
      expect(getScoreColor(0.3, preset)).toBe("red");
      expect(getScoreColor(0.2, preset)).toBe("red");
    });
  });

  describe("calculateCompletionPct()", () => {
    test("calculates percentage correctly", () => {
      expect(calculateCompletionPct(5, 10)).toBe(50);
      expect(calculateCompletionPct(3, 4)).toBe(75);
      expect(calculateCompletionPct(0, 10)).toBe(0);
      expect(calculateCompletionPct(10, 10)).toBe(100);
    });

    test("handles zero total tasks", () => {
      expect(calculateCompletionPct(0, 0)).toBe(100);
    });

    test("rounds to nearest integer", () => {
      expect(calculateCompletionPct(1, 3)).toBe(33);
      expect(calculateCompletionPct(2, 3)).toBe(67);
    });
  });
});

describe("Custom Preset Creation", () => {
  describe("createCustomPreset()", () => {
    test("creates preset based on existing one", () => {
      const custom = createCustomPreset("partial_credit", {
        name: "Custom Scoring",
        pass_threshold: 0.8,
      });

      expect(custom.name).toBe("Custom Scoring");
      expect(custom.pass_threshold).toBe(0.8);
      // Inherited values
      expect(custom.modifiers.hint_penalty).toBe(0.15);
      expect(custom.min_confidence).toBe(0.2);
    });

    test("can override individual modifiers", () => {
      const custom = createCustomPreset("partial_credit", {
        modifiers: {
          hint_penalty: 0.2,
        },
      });

      expect(custom.modifiers.hint_penalty).toBe(0.2);
      expect(custom.modifiers.solution_penalty).toBe(0.25); // Unchanged
    });

    test("falls back to partial_credit for unknown base", () => {
      const custom = createCustomPreset("unknown", {
        name: "Fallback Test",
      });

      expect(custom.modifiers.hint_penalty).toBe(0.15);
    });

    test("generates default name if not provided", () => {
      const custom = createCustomPreset("strict", {});
      expect(custom.name).toContain("Custom");
      expect(custom.name).toContain("Strict Binary");
    });
  });
});

describe("Edge Cases", () => {
  const preset = SCORING_PRESETS.partial_credit;

  test("confidence cannot exceed 1.0", () => {
    // First try with no penalties should still cap at 1.0
    const result = calculateConfidence(preset, 0, false, 0, true);
    expect(result.confidence).toBe(1.0);
  });

  test("confidence cannot go below min_confidence", () => {
    // Extreme penalties
    const result = calculateConfidence(preset, 100, true, 100, false);
    expect(result.confidence).toBe(0.2); // Floor
  });

  test("handles fractional hint counts (rounds to integer)", () => {
    // Should handle non-integer hint counts gracefully
    const result = calculateConfidence(preset, 1.5 as unknown as number, false, 0, false);
    // TypeScript should catch this, but runtime should handle
    expect(result.confidence).toBeLessThan(1.0);
  });

  test("modifiers array is populated correctly", () => {
    const result = calculateConfidence(preset, 2, true, 3, false);

    expect(result.modifiers.length).toBe(3);

    const hintMod = result.modifiers.find((m) => m.kind === "hint_used");
    expect(hintMod).toBeDefined();
    expect(hintMod?.count).toBe(2);
    expect(hintMod?.delta).toBe(-0.3);

    const solutionMod = result.modifiers.find((m) => m.kind === "solution_viewed");
    expect(solutionMod).toBeDefined();
    expect(solutionMod?.count).toBe(1);

    const retryMod = result.modifiers.find((m) => m.kind === "retry_attempt");
    expect(retryMod).toBeDefined();
    expect(retryMod?.count).toBe(3);
    expect(retryMod?.delta).toBeCloseTo(-0.3, 5);
  });

  test("first try bonus not applied when hints used", () => {
    // Can't be first try success if hints were used
    const result = calculateConfidence(preset, 1, false, 0, false);
    expect(result.modifiers.some((m) => m.kind === "first_try_bonus")).toBe(false);
  });

  test("first try bonus not applied on retry", () => {
    // Can't be first try success with retries
    const result = calculateConfidence(preset, 0, false, 1, false);
    expect(result.modifiers.some((m) => m.kind === "first_try_bonus")).toBe(false);
  });
});

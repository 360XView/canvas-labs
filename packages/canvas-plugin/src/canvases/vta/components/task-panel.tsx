import React from "react";
import { Box, Text } from "ink";
import type { Step, Hint, Solution, Question } from "../types";
import { VTA_COLORS } from "../types";

interface TaskPanelProps {
  step: Step;
  width: number;
  height: number;
  focused: boolean;
  hintsRevealed: Set<string>;
  solutionRevealed: boolean;
  selectedOptions: Set<string>;
  scrollOffset: number;
}

export function TaskPanel({
  step,
  width,
  height,
  focused,
  hintsRevealed,
  solutionRevealed,
  selectedOptions,
  scrollOffset,
}: TaskPanelProps) {
  const contentWidth = width - 4;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={focused ? VTA_COLORS.primary : VTA_COLORS.muted}
      paddingX={1}
    >
      {/* Title */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={VTA_COLORS.primary}>
          {step.title}
        </Text>
        <Box marginTop={0}>
          <Text dimColor>─────────────────────────────────────────────</Text>
        </Box>
      </Box>

      {/* Scrollable Content */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {/* Instructions */}
        {step.content.instructions && (
          <Box flexDirection="column" marginBottom={1}>
            <Text wrap="wrap">{step.content.instructions}</Text>
          </Box>
        )}

        {/* Tasks */}
        {step.content.tasks && step.content.tasks.length > 0 && (
          <TaskList tasks={step.content.tasks} width={contentWidth} />
        )}

        {/* Question */}
        {step.content.question && (
          <QuestionSection
            question={step.content.question}
            selectedOptions={selectedOptions}
            width={contentWidth}
          />
        )}

        {/* Hints */}
        {step.content.hints && step.content.hints.length > 0 && (
          <HintsSection
            hints={step.content.hints}
            hintsRevealed={hintsRevealed}
            width={contentWidth}
          />
        )}

        {/* Solution */}
        {step.content.solution && (
          <SolutionSection
            solution={step.content.solution}
            revealed={solutionRevealed}
            width={contentWidth}
          />
        )}
      </Box>

      {/* Footer with controls hint */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          ←/→ nav • h hint • s solution • d debug • Enter next • b back • q quit
        </Text>
      </Box>
    </Box>
  );
}

interface TaskListProps {
  tasks: { text: string; details?: string[]; completed?: boolean }[];
  width: number;
}

function TaskList({ tasks, width }: TaskListProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="single"
        borderColor={VTA_COLORS.muted}
        paddingX={1}
        flexDirection="column"
      >
        <Box marginBottom={1}>
          <Text color={VTA_COLORS.secondary}>📋 Task</Text>
        </Box>
        {tasks.map((task, idx) => (
          <Box key={idx} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={VTA_COLORS.primary}>• </Text>
              <Text wrap="wrap">{renderBoldText(task.text)}</Text>
            </Box>
            {task.details && (
              <Box flexDirection="column" marginLeft={2}>
                {task.details.map((detail, dIdx) => (
                  <Text key={dIdx} dimColor>
                    - {renderInlineCode(detail)}
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

interface HintsSectionProps {
  hints: Hint[];
  hintsRevealed: Set<string>;
  width: number;
}

function HintsSection({ hints, hintsRevealed, width }: HintsSectionProps) {
  const availableHints = hints.length;
  const revealedCount = hintsRevealed.size;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color={VTA_COLORS.warning}>💡 Hints</Text>
        <Text dimColor>
          {" "}
          ({revealedCount}/{availableHints} revealed) [Press H]
        </Text>
      </Box>

      {hints.map((hint, idx) => {
        const isRevealed = hintsRevealed.has(hint.id);
        if (!isRevealed) return null;

        return (
          <Box
            key={hint.id}
            flexDirection="column"
            marginBottom={1}
            paddingX={1}
            borderStyle="single"
            borderColor={VTA_COLORS.warning}
          >
            <Text color={VTA_COLORS.warning}>Hint {idx + 1}:</Text>
            <Text wrap="wrap">{renderCodeBlock(hint.text)}</Text>
          </Box>
        );
      })}

      {revealedCount < availableHints && (
        <Box>
          <Text dimColor italic>
            Press H to reveal next hint ({availableHints - revealedCount} remaining)
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface SolutionSectionProps {
  solution: Solution;
  revealed: boolean;
  width: number;
}

function SolutionSection({ solution, revealed, width }: SolutionSectionProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={1}>
        <Text color={VTA_COLORS.success}>✅ Solution</Text>
        <Text dimColor> [Press S to {revealed ? "hide" : "reveal"}]</Text>
      </Box>

      {revealed ? (
        <Box
          flexDirection="column"
          paddingX={1}
          borderStyle="single"
          borderColor={VTA_COLORS.success}
        >
          {solution.description && (
            <Text wrap="wrap">{solution.description}</Text>
          )}
          {solution.command && (
            <Box marginY={1} paddingX={1} borderStyle="round">
              <Text color={VTA_COLORS.primary}>$ {solution.command}</Text>
            </Box>
          )}
          {solution.explanation && (
            <Text dimColor wrap="wrap">
              {solution.explanation}
            </Text>
          )}
        </Box>
      ) : (
        <Box>
          <Text dimColor italic>
            Press S to reveal the solution
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface QuestionSectionProps {
  question: Question;
  selectedOptions: Set<string>;
  width: number;
}

function QuestionSection({
  question,
  selectedOptions,
  width,
}: QuestionSectionProps) {
  const isAnswered = question.answered ?? false;
  const isCorrect = question.isCorrect ?? false;
  const userAnswer = question.userAnswer ?? [];

  // Get correct option IDs
  const correctOptionIds = question.options
    .filter((opt) => opt.correct)
    .map((opt) => opt.id);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header with result indicator */}
      <Box marginBottom={1}>
        <Text color={VTA_COLORS.highlight}>❓ Question</Text>
        {isAnswered ? (
          <Text color={isCorrect ? VTA_COLORS.success : VTA_COLORS.error}>
            {" "}
            {isCorrect ? "✓ Correct!" : "✗ Incorrect"}
          </Text>
        ) : (
          <Text dimColor>
            {" "}
            ({question.type === "single" ? "Select one" : "Select all that apply"})
          </Text>
        )}
      </Box>

      <Text bold wrap="wrap">
        {question.text}
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {question.options.map((option, idx) => {
          const isSelected = selectedOptions.has(option.id);
          const wasUserAnswer = userAnswer.includes(option.id);
          const isCorrectOption = option.correct ?? false;

          if (isAnswered) {
            // Answered state: show which was selected and which was correct
            let marker = "  ";
            let color: string | undefined = undefined;
            let suffix = "";

            if (wasUserAnswer && isCorrectOption) {
              // User selected this and it's correct
              marker = "●";
              color = VTA_COLORS.success;
              suffix = " ← Your answer ✓";
            } else if (wasUserAnswer && !isCorrectOption) {
              // User selected this but it's wrong
              marker = "●";
              color = VTA_COLORS.error;
              suffix = " ← Your answer ✗";
            } else if (!wasUserAnswer && isCorrectOption) {
              // User didn't select but it's correct
              marker = "●";
              color = VTA_COLORS.success;
              suffix = " ← Correct answer";
            } else {
              // Neither selected nor correct
              marker = " ";
              color = VTA_COLORS.muted;
            }

            return (
              <Box key={option.id}>
                <Text color={color}>
                  [{idx + 1}] {marker}{" "}
                </Text>
                <Text color={color}>{option.text}</Text>
                <Text color={color} dimColor={!suffix}>
                  {suffix}
                </Text>
              </Box>
            );
          } else {
            // Unanswered state: show selection
            const marker = isSelected ? "●" : "○";
            const color = isSelected ? VTA_COLORS.primary : undefined;

            return (
              <Box key={option.id}>
                <Text color={color}>
                  [{idx + 1}] {marker}{" "}
                </Text>
                <Text color={color}>{option.text}</Text>
              </Box>
            );
          }
        })}
      </Box>

      {/* Explanation (shown after answering) */}
      {isAnswered && question.explanation && (
        <Box
          marginTop={1}
          paddingX={1}
          borderStyle="single"
          borderColor={isCorrect ? VTA_COLORS.success : VTA_COLORS.warning}
          flexDirection="column"
        >
          <Text color={VTA_COLORS.secondary} bold>
            Explanation:
          </Text>
          <Text wrap="wrap">{question.explanation}</Text>
        </Box>
      )}

      {/* Footer instructions */}
      <Box marginTop={1}>
        {isAnswered ? (
          <Text dimColor>Press Enter to continue</Text>
        ) : selectedOptions.size > 0 ? (
          <Text dimColor>
            Press 1-{question.options.length} to change selection, Enter to submit
          </Text>
        ) : (
          <Text dimColor>Press 1-{question.options.length} to select</Text>
        )}
      </Box>
    </Box>
  );
}

// Helper functions for basic markdown-like rendering
function renderBoldText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={idx} bold>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={idx}>{part}</Text>;
  });
}

function renderInlineCode(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={idx} color={VTA_COLORS.primary}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={idx}>{part}</Text>;
  });
}

function renderCodeBlock(text: string): React.ReactNode {
  // Simple code block detection (indented with 4 spaces)
  const lines = text.split("\n");
  return lines.map((line, idx) => {
    if (line.startsWith("    ")) {
      return (
        <Text key={idx} color={VTA_COLORS.primary}>
          {line}
        </Text>
      );
    }
    return <Text key={idx}>{renderInlineCode(line)}</Text>;
  });
}

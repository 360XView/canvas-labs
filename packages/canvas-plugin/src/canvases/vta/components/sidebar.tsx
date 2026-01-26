import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import type { Module, Step } from "../types";
import { VTA_COLORS } from "../types";

// Celebration animation frames (sparkles around the checkmark)
const CELEBRATION_FRAMES = [
  "✨●✨",
  "⭐●⭐",
  "✦●✦",
  "★●★",
  "✧●✧",
  "·●·",
  " ● ",
];
const CELEBRATION_DURATION = 3000; // 3 seconds
const CELEBRATION_FRAME_RATE = 150; // ms per frame

interface SidebarProps {
  module: Module;
  currentStepIndex: number;
  width: number;
  height: number;
  focused: boolean;
}

export function Sidebar({
  module,
  currentStepIndex,
  width,
  height,
  focused,
}: SidebarProps) {
  // Track recently completed steps for celebration animation
  const [celebratingSteps, setCelebratingSteps] = useState<Set<string>>(new Set());
  const prevCompletedRef = useRef<Set<string>>(new Set());

  // Detect newly completed steps
  useEffect(() => {
    const currentCompleted = new Set(
      module.steps.filter((s) => s.completed).map((s) => s.id)
    );
    const prevCompleted = prevCompletedRef.current;

    // Find newly completed steps
    const newlyCompleted = [...currentCompleted].filter(
      (id) => !prevCompleted.has(id)
    );

    if (newlyCompleted.length > 0) {
      // Add to celebrating set
      setCelebratingSteps((prev) => {
        const next = new Set(prev);
        newlyCompleted.forEach((id) => next.add(id));
        return next;
      });

      // Remove from celebrating after duration
      setTimeout(() => {
        setCelebratingSteps((prev) => {
          const next = new Set(prev);
          newlyCompleted.forEach((id) => next.delete(id));
          return next;
        });
      }, CELEBRATION_DURATION);
    }

    prevCompletedRef.current = currentCompleted;
  }, [module.steps]);

  const completedCount = module.steps.filter((s) => s.completed).length;
  const totalSteps = module.steps.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  // Calculate progress bar
  const barWidth = width - 6;
  const filledWidth = Math.round((progressPercent / 100) * barWidth);
  const progressBar =
    "█".repeat(filledWidth) + "░".repeat(barWidth - filledWidth);

  // Calculate visible steps (scroll if needed)
  const maxVisibleSteps = height - 10; // Account for header, progress bar, etc.
  let startIndex = 0;
  if (currentStepIndex >= maxVisibleSteps) {
    startIndex = currentStepIndex - maxVisibleSteps + 1;
  }
  const visibleSteps = module.steps.slice(
    startIndex,
    startIndex + maxVisibleSteps
  );

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={focused ? VTA_COLORS.primary : VTA_COLORS.muted}
      paddingX={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={VTA_COLORS.primary}>
          Module Info
        </Text>
      </Box>

      {/* Step List */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleSteps.map((step, idx) => {
          const actualIndex = startIndex + idx;
          const isCurrent = actualIndex === currentStepIndex;
          const isCompleted = step.completed;

          return (
            <StepItem
              key={step.id}
              step={step}
              isCurrent={isCurrent}
              isCompleted={isCompleted}
              isCelebrating={celebratingSteps.has(step.id)}
              width={width - 4}
            />
          );
        })}

        {/* Scroll indicator */}
        {module.steps.length > maxVisibleSteps && (
          <Box marginTop={1}>
            <Text dimColor>
              [{startIndex + 1}-{Math.min(startIndex + maxVisibleSteps, totalSteps)}/{totalSteps}]
            </Text>
          </Box>
        )}
      </Box>

      {/* Progress Bar */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={VTA_COLORS.success}>{progressPercent}%</Text>
        <Text color={VTA_COLORS.success}>{progressBar}</Text>
      </Box>
    </Box>
  );
}

interface StepItemProps {
  step: Step;
  isCurrent: boolean;
  isCompleted: boolean;
  isCelebrating: boolean;
  width: number;
}

function StepItem({ step, isCurrent, isCompleted, isCelebrating, width }: StepItemProps) {
  // Animation frame for celebration
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!isCelebrating) {
      setFrameIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % CELEBRATION_FRAMES.length);
    }, CELEBRATION_FRAME_RATE);

    return () => clearInterval(interval);
  }, [isCelebrating]);

  // Icons: ● = completed (green), ◉ = current (cyan), ○ = pending (gray)
  // When celebrating, show animated sparkles
  const icon = isCelebrating
    ? CELEBRATION_FRAMES[frameIndex]
    : isCompleted
      ? "●"
      : isCurrent
        ? "◉"
        : "○";

  const iconColor = isCompleted
    ? VTA_COLORS.success
    : isCurrent
      ? VTA_COLORS.primary
      : VTA_COLORS.muted;

  // Truncate title if too long (account for wider celebration icon)
  const iconWidth = isCelebrating ? 3 : 1;
  const maxTitleLength = width - iconWidth - 3;
  const title =
    step.title.length > maxTitleLength
      ? step.title.slice(0, maxTitleLength - 2) + "…"
      : step.title;

  return (
    <Box>
      <Text color={iconColor} bold={isCelebrating}>{icon} </Text>
      <Text
        color={isCurrent ? VTA_COLORS.primary : isCompleted ? VTA_COLORS.success : undefined}
        bold={isCurrent || isCelebrating}
        dimColor={!isCurrent && !isCompleted}
      >
        {title}
      </Text>
    </Box>
  );
}

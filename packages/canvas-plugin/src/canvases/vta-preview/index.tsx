// VTA Preview Canvas - Read-only preview for lab editing
// Displays module steps without Docker/task completion

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { loadModule, loadDraft, moduleExists } from "../../lab/module-loader";
import type { Module, Step } from "../vta/types";
import { type VTAPreviewConfig, type VTAPreviewResult, PREVIEW_COLORS } from "./types";

interface Props {
  id: string;
  config?: VTAPreviewConfig;
  socketPath?: string;
  scenario?: string;
}

export function VTAPreviewCanvas({
  id,
  config,
  socketPath,
  scenario = "preview",
}: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal dimensions
  const [termWidth, setTermWidth] = useState(stdout?.columns || 80);
  const [termHeight, setTermHeight] = useState(stdout?.rows || 24);

  // Module state
  const [module, setModule] = useState<Module | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [showHints, setShowHints] = useState(false);

  // Load module on mount (checks both published and draft locations)
  useEffect(() => {
    if (!config?.moduleId) {
      setError("No module ID provided");
      return;
    }

    try {
      // Check if module exists and where
      const { exists, location } = moduleExists(config.moduleId);
      if (!exists) {
        setError(`Module not found: ${config.moduleId}`);
        return;
      }

      // Load from appropriate location
      const mod = location === "draft"
        ? loadDraft(config.moduleId)
        : loadModule(config.moduleId);
      setModule(mod);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load module");
    }
  }, [config?.moduleId]);

  // Handle terminal resize
  useEffect(() => {
    const handleResize = () => {
      setTermWidth(stdout?.columns || 80);
      setTermHeight(stdout?.rows || 24);
    };

    stdout?.on("resize", handleResize);
    return () => {
      stdout?.off("resize", handleResize);
    };
  }, [stdout]);

  // Reset state when step changes
  useEffect(() => {
    setScrollOffset(0);
    setShowSolution(false);
    setShowHints(false);
  }, [currentStepIndex]);

  // Handle back to launcher
  const handleBackToLauncher = useCallback(() => {
    // Get base path for the CLI
    const basePath = resolve(dirname(import.meta.path), "../../..");
    const launcherCmd = `cd ${basePath} && bun run src/cli.ts labs --dev`;

    // Check if we're in tmux
    const inTmux = !!process.env.TMUX;

    if (inTmux) {
      // Create new window with launcher in dev mode and kill current window
      spawnSync("tmux", [
        "new-window",
        "-n", "labs",
        launcherCmd,
      ]);

      // Kill the current window (the edit window)
      spawnSync("tmux", ["kill-window", "-t", "!"]);
    }

    exit();
  }, [exit]);

  // Keyboard input handler
  useInput((input, key) => {
    // Quit
    if (input === "q" || key.escape) {
      exit();
      return;
    }

    // Back to launcher
    if (input === "b" || input === "B") {
      handleBackToLauncher();
      return;
    }

    // Test lab (would trigger lab-test command)
    if (input === "t" || input === "T") {
      console.log(`Test: ${config?.moduleId}`);
      // TODO: Trigger lab-test via IPC or exit with action
      return;
    }

    // Save (for drafts)
    if (input === "s" || input === "S") {
      console.log(`Save: ${config?.moduleId}`);
      // TODO: Trigger save via IPC or exit with action
      return;
    }

    // Toggle solution view
    if (input === "o" || input === "O") {
      setShowSolution((prev) => !prev);
      return;
    }

    // Toggle hints view
    if (input === "h" || input === "H") {
      setShowHints((prev) => !prev);
      return;
    }

    // Navigation between steps
    if (key.leftArrow && currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      return;
    }

    if (key.rightArrow && module && currentStepIndex < module.steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      return;
    }

    // Scroll content
    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setScrollOffset((prev) => prev + 1);
      return;
    }
  });

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={PREVIEW_COLORS.error}>Error: {error}</Text>
        <Text color={PREVIEW_COLORS.muted}>Press q to quit</Text>
      </Box>
    );
  }

  // Loading state
  if (!module) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={PREVIEW_COLORS.muted}>Loading module...</Text>
      </Box>
    );
  }

  const currentStep = module.steps[currentStepIndex];
  const sidebarWidth = Math.max(24, Math.floor(termWidth * 0.3));
  const contentWidth = termWidth - sidebarWidth - 3;
  const contentHeight = termHeight - 6; // Header + status bar

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Header */}
      <Box
        borderStyle="double"
        borderColor={PREVIEW_COLORS.primary}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box>
          <Text color={PREVIEW_COLORS.primary} bold>
            VTA PREVIEW
          </Text>
          <Text color={PREVIEW_COLORS.muted}> │ </Text>
          <Text color={PREVIEW_COLORS.highlight} bold>
            {module.title}
          </Text>
        </Box>
        <Text color={PREVIEW_COLORS.muted}>
          Step {currentStepIndex + 1}/{module.steps.length}
        </Text>
      </Box>

      {/* Main content */}
      <Box flexDirection="row" height={contentHeight}>
        {/* Sidebar - Step list */}
        <Box
          flexDirection="column"
          width={sidebarWidth}
          borderStyle="single"
          borderColor={PREVIEW_COLORS.muted}
          paddingX={1}
        >
          <Text color={PREVIEW_COLORS.secondary} bold>
            Steps
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {module.steps.map((step, idx) => {
              const isActive = idx === currentStepIndex;
              const icon = step.type === "task" ? "○" : "·";
              return (
                <Text
                  key={step.id}
                  color={isActive ? PREVIEW_COLORS.primary : PREVIEW_COLORS.muted}
                  bold={isActive}
                >
                  {isActive ? "▸ " : "  "}
                  {icon} {step.title.slice(0, sidebarWidth - 6)}
                </Text>
              );
            })}
          </Box>
        </Box>

        {/* Content panel */}
        <Box
          flexDirection="column"
          width={contentWidth}
          borderStyle="single"
          borderColor={PREVIEW_COLORS.primary}
          paddingX={1}
        >
          {/* Step header */}
          <Box marginBottom={1}>
            <Text color={PREVIEW_COLORS.highlight} bold>
              {currentStep.title}
            </Text>
            <Text color={PREVIEW_COLORS.muted}> ({currentStep.type})</Text>
          </Box>

          {/* Step content */}
          <StepContentView
            step={currentStep}
            showSolution={showSolution}
            showHints={showHints}
            scrollOffset={scrollOffset}
            maxHeight={contentHeight - 4}
          />
        </Box>
      </Box>

      {/* Status bar */}
      <Box
        borderStyle="single"
        borderColor={PREVIEW_COLORS.primary}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text color={PREVIEW_COLORS.muted}>
          ←/→ nav │ h hints │ o solution │ t test │ b back │ q quit
        </Text>
        <Text color={PREVIEW_COLORS.primary}>PREVIEW MODE</Text>
      </Box>
    </Box>
  );
}

// Step content view component
function StepContentView({
  step,
  showSolution,
  showHints,
  scrollOffset,
  maxHeight,
}: {
  step: Step;
  showSolution: boolean;
  showHints: boolean;
  scrollOffset: number;
  maxHeight: number;
}) {
  const lines: React.ReactNode[] = [];

  // Instructions
  if (step.content.instructions) {
    lines.push(
      <Text key="instructions" color={PREVIEW_COLORS.muted}>
        {step.content.instructions}
      </Text>
    );
    lines.push(<Text key="spacer1">{""}</Text>);
  }

  // Tasks
  if (step.content.tasks && step.content.tasks.length > 0) {
    lines.push(
      <Text key="tasks-header" color={PREVIEW_COLORS.secondary} bold>
        Tasks:
      </Text>
    );
    step.content.tasks.forEach((task, idx) => {
      lines.push(
        <Text key={`task-${idx}`} color={PREVIEW_COLORS.highlight}>
          • {task.text}
        </Text>
      );
      if (task.details) {
        task.details.forEach((detail, dIdx) => {
          lines.push(
            <Text key={`task-${idx}-detail-${dIdx}`} color={PREVIEW_COLORS.muted}>
              {"  "}- {detail}
            </Text>
          );
        });
      }
    });
    lines.push(<Text key="spacer2">{""}</Text>);
  }

  // Hints (if toggled on)
  if (showHints && step.content.hints && step.content.hints.length > 0) {
    lines.push(
      <Text key="hints-header" color={PREVIEW_COLORS.warning} bold>
        Hints:
      </Text>
    );
    step.content.hints.forEach((hint, idx) => {
      lines.push(
        <Text key={`hint-${idx}`} color={PREVIEW_COLORS.warning}>
          {idx + 1}. {hint.text}
        </Text>
      );
    });
    lines.push(<Text key="spacer3">{""}</Text>);
  }

  // Solution (if toggled on)
  if (showSolution && step.content.solution) {
    lines.push(
      <Text key="solution-header" color={PREVIEW_COLORS.success} bold>
        Solution:
      </Text>
    );
    if (step.content.solution.description) {
      lines.push(
        <Text key="solution-desc" color={PREVIEW_COLORS.muted}>
          {step.content.solution.description}
        </Text>
      );
    }
    if (step.content.solution.command) {
      lines.push(
        <Text key="solution-cmd" color={PREVIEW_COLORS.success}>
          $ {step.content.solution.command}
        </Text>
      );
    }
    if (step.content.solution.explanation) {
      lines.push(
        <Text key="solution-exp" color={PREVIEW_COLORS.muted}>
          {step.content.solution.explanation}
        </Text>
      );
    }
  }

  // Apply scroll offset
  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxHeight);

  return (
    <Box flexDirection="column" height={maxHeight} overflow="hidden">
      {visibleLines}
    </Box>
  );
}

// Re-export types
export type { VTAPreviewConfig, VTAPreviewResult } from "./types";

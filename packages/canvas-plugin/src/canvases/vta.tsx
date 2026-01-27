import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { spawnSync } from "child_process";
import { resolve, dirname, basename } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { Sidebar } from "./vta/components/sidebar";
import { TaskPanel } from "./vta/components/task-panel";
import { DebugPanel } from "./vta/components/debug-panel";
import { PresentationContent } from "./vta/components/presentation-content";
import {
  type VTAConfig,
  type VTAResult,
  type Module,
  VTA_COLORS,
  getDemoModule,
} from "./vta/types";
import { useLabFeedback } from "./vta/hooks/use-lab-feedback";
import type { DynamicStep, LabMessage } from "../ipc/types";
import { loadModule as loadModuleFromFile } from "../lab/module-loader";
import { cleanupLabSession } from "../lab/cleanup";
import type { NarrationSegment, PresentationMode } from "../presentation/types";

// Derive log directory from socket path
// Socket: /tmp/lab-{moduleId}-{timestamp}.sock -> Log dir: /tmp/lab-logs-{moduleId}-{timestamp}/
// Socket: /tmp/presentation-{presId}-{timestamp}.sock -> Log dir: /tmp/presentation-logs-{presId}-{timestamp}/
function deriveLogDir(socketPath: string): string {
  const filename = basename(socketPath, ".sock");

  // Handle presentation sockets
  if (filename.startsWith("presentation-")) {
    const id = filename.replace(/^presentation-/, "");
    return `/tmp/presentation-logs-${id}`;
  }

  // Handle lab sockets
  const id = filename.replace(/^lab-/, "");
  return `/tmp/lab-logs-${id}`;
}

// Get containerId from log directory if it exists
function getContainerId(logDir: string): string | undefined {
  const containerIdFile = `${logDir}/container.id`;
  if (existsSync(containerIdFile)) {
    try {
      return readFileSync(containerIdFile, "utf-8").trim();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// Write presentation state update for tutor to read
function writePresentationStateUpdate(
  logDir: string,
  update: { mode?: PresentationMode; slideIndex?: number; highlight?: number | null; explainRequested?: boolean }
) {
  const statePath = `${logDir}/presentation-state.json`;

  try {
    let state: Record<string, unknown> = {};
    if (existsSync(statePath)) {
      state = JSON.parse(readFileSync(statePath, "utf-8"));
    }

    if (update.mode !== undefined) {
      state.mode = update.mode;
    }
    if (update.slideIndex !== undefined) {
      state.slideIndex = update.slideIndex;
      state.slideNumber = update.slideIndex + 1; // Human-readable (1-indexed)
    }
    if (update.highlight !== undefined) {
      state.highlightedSegment = update.highlight;
    }
    if (update.explainRequested) {
      // Use timestamp so watcher can detect new requests
      state.explainRequestedAt = new Date().toISOString();
    }
    state.lastUpdated = new Date().toISOString();

    writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch {
    // Silently fail - state file may not exist yet
  }
}

interface VTACanvasProps {
  id: string;
  config?: VTAConfig;
  socketPath?: string;
  scenario?: string;
  logDir?: string; // Explicit log directory (for presentations)
}

export type { VTAConfig, VTAResult };
export { getDemoModule };

export function VTACanvas({
  id,
  config,
  socketPath,
  scenario = "learn",
  logDir: explicitLogDir,
}: VTACanvasProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal dimensions
  const [termWidth, setTermWidth] = useState(stdout?.columns || 120);
  const [termHeight, setTermHeight] = useState(stdout?.rows || 40);

  // Module state - load from moduleId if provided, otherwise use module or demo
  const getInitialModule = (): Module => {
    if (config?.module) return config.module;
    if (config?.moduleId) {
      try {
        return loadModuleFromFile(config.moduleId);
      } catch (e) {
        console.error(`Failed to load module '${config.moduleId}':`, e);
      }
    }
    return getDemoModule();
  };
  const [module, setModule] = useState<Module>(getInitialModule);
  const [currentStepIndex, setCurrentStepIndex] = useState(
    config?.currentStepIndex || 0
  );

  // UI state
  const [focusMode, setFocusMode] = useState<"sidebar" | "content">("content");
  const [hintsRevealed, setHintsRevealed] = useState<Set<string>>(new Set());
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(
    new Set()
  );
  const [scrollOffset, setScrollOffset] = useState(0);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Interactive presentation state
  const [presentationMode, setPresentationMode] = useState<PresentationMode>("guided");
  const [highlightedSegment, setHighlightedSegment] = useState<number | null>(null);
  const isInteractivePresentation = scenario === "interactive-presentation";

  // Get effective log directory (explicit prop or derived from socket)
  const effectiveLogDir = explicitLogDir || (socketPath ? deriveLogDir(socketPath) : undefined);

  // Current step
  const currentStep = module.steps[currentStepIndex];

  // Lab mode - mark step complete when task is validated
  const handleLabTaskCompleted = useCallback(
    (stepId: string) => {
      setModule((prev) => ({
        ...prev,
        steps: prev.steps.map((step) =>
          step.id === stepId ? { ...step, completed: true } : step
        ),
      }));

      // Auto-advance to the completed step if it's ahead of current
      const stepIndex = module.steps.findIndex((s) => s.id === stepId);
      if (stepIndex > currentStepIndex) {
        setCurrentStepIndex(stepIndex);
      }
    },
    [module.steps, currentStepIndex]
  );

  // Lab mode - add dynamic step from tutor
  const handleAddDynamicStep = useCallback(
    (step: DynamicStep, afterStepId?: string) => {
      setModule((prev) => {
        // Check if step already exists
        if (prev.steps.some((s) => s.id === step.id)) {
          return prev;
        }

        const steps = [...prev.steps];

        // Find insertion point
        let insertIndex: number;
        if (afterStepId) {
          const afterIndex = steps.findIndex((s) => s.id === afterStepId);
          insertIndex = afterIndex >= 0 ? afterIndex + 1 : steps.length - 1;
        } else {
          // Default: insert before summary (last step)
          insertIndex = steps.length - 1;
        }

        // Convert DynamicStep to module Step format
        const newStep = {
          id: step.id,
          title: step.title,
          type: step.type as "task" | "question",
          completed: false,
          content: {
            instructions: step.content.instructions,
            tasks: step.content.tasks?.map((t, i) => ({
              id: `${step.id}-task-${i}`,
              text: t.text,
            })),
            hints: step.content.hints?.map((h, i) => ({
              id: `${step.id}-hint-${i}`,
              text: h,
            })),
            // Support question type steps
            question: step.content.question
              ? {
                  text: step.content.question.text,
                  type: step.content.question.type,
                  options: step.content.question.options.map((opt) => ({
                    id: opt.id,
                    text: opt.text,
                    correct: opt.correct,
                    feedback: opt.feedback,
                  })),
                  explanation: step.content.question.explanation,
                }
              : undefined,
          },
        };

        steps.splice(insertIndex, 0, newStep);
        return { ...prev, steps };
      });
    },
    []
  );

  // Handle highlight message from tutor (interactive presentation)
  const handleHighlight = useCallback((segmentIndex: number) => {
    setHighlightedSegment(segmentIndex);
  }, []);

  const handleClearHighlight = useCallback(() => {
    setHighlightedSegment(null);
  }, []);

  // Handle navigation messages from tutor (interactive presentation)
  const handleNextSlide = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const newIndex = Math.min(prev + 1, module.steps.length - 1);
      if (effectiveLogDir && newIndex !== prev) {
        writePresentationStateUpdate(effectiveLogDir, { slideIndex: newIndex });
      }
      return newIndex;
    });
  }, [module.steps.length, effectiveLogDir]);

  const handlePreviousSlide = useCallback(() => {
    setCurrentStepIndex((prev) => {
      const newIndex = Math.max(prev - 1, 0);
      if (effectiveLogDir && newIndex !== prev) {
        writePresentationStateUpdate(effectiveLogDir, { slideIndex: newIndex });
      }
      return newIndex;
    });
  }, [effectiveLogDir]);

  const handleNavigateToSlide = useCallback((slideIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(slideIndex, module.steps.length - 1));
    setCurrentStepIndex(clampedIndex);
    if (effectiveLogDir) {
      writePresentationStateUpdate(effectiveLogDir, { slideIndex: clampedIndex });
    }
  }, [module.steps.length, effectiveLogDir]);

  // Lab feedback hook - active in lab mode and interactive presentation mode
  const isLabMode = scenario === "lab" && !!socketPath;
  const useIPC = (isLabMode || isInteractivePresentation) && !!socketPath;
  const labState = useLabFeedback(
    useIPC
      ? {
          socketPath,
          onTaskCompleted: handleLabTaskCompleted,
          onAddDynamicStep: handleAddDynamicStep,
          onHighlight: handleHighlight,
          onClearHighlight: handleClearHighlight,
          onNextSlide: handleNextSlide,
          onPreviousSlide: handlePreviousSlide,
          onNavigateToSlide: handleNavigateToSlide,
        }
      : null
  );

  // Handle terminal resize
  useEffect(() => {
    const handleResize = () => {
      setTermWidth(stdout?.columns || 120);
      setTermHeight(stdout?.rows || 40);
    };

    stdout?.on("resize", handleResize);
    return () => {
      stdout?.off("resize", handleResize);
    };
  }, [stdout]);

  // Reset state when step changes
  useEffect(() => {
    setHintsRevealed(new Set());
    setSolutionRevealed(false);
    setSelectedOptions(new Set());
    setScrollOffset(0);
  }, [currentStepIndex]);

  // Auto-complete view-only steps (introduction, summary) when entering them
  useEffect(() => {
    const step = module.steps[currentStepIndex];
    if (!step) return;

    const isViewOnlyStep = step.type === "introduction" || step.type === "summary";
    if (isViewOnlyStep && !step.completed) {
      setModule((prev) => ({
        ...prev,
        steps: prev.steps.map((s, idx) =>
          idx === currentStepIndex ? { ...s, completed: true } : s
        ),
      }));
    }
  }, [currentStepIndex, module.steps]);

  // Handle back to launcher
  const handleBackToLauncher = useCallback(() => {
    // Clean up lab session before exiting
    if (socketPath) {
      const logDir = deriveLogDir(socketPath);
      const containerId = getContainerId(logDir);
      cleanupLabSession(logDir, containerId);
    }

    // Get base path for the CLI
    const basePath = resolve(dirname(import.meta.path), "../..");
    const launcherCmd = `cd ${basePath} && bun run src/cli.ts labs`;

    // Check if we're in tmux
    const inTmux = !!process.env.TMUX;

    if (inTmux) {
      // Kill all panes in current window except this one, then respawn with launcher
      // Use tmux to create new window with launcher and kill current window
      spawnSync("tmux", [
        "new-window",
        "-n", "labs",
        launcherCmd,
      ]);

      // Kill the current window (the lab window)
      spawnSync("tmux", ["kill-window", "-t", "!"]);
    }

    exit();
  }, [exit, socketPath]);

  // Keyboard input handler
  useInput((input, key) => {
    // Quit
    if (input === "q" || key.escape) {
      // Clean up lab session before exiting
      if (socketPath) {
        const logDir = deriveLogDir(socketPath);
        const containerId = getContainerId(logDir);
        cleanupLabSession(logDir, containerId);
      }
      exit();
      return;
    }

    // Back to launcher
    if (input === "b" || input === "B") {
      handleBackToLauncher();
      return;
    }

    // Debug panel toggle
    if (input === "d" || input === "D") {
      setShowDebugPanel((prev) => !prev);
      return;
    }

    // Interactive presentation mode controls
    if (isInteractivePresentation) {
      // 'e' - Request explanation of current slide
      if (input === "e" || input === "E") {
        setPresentationMode("guided");
        setHighlightedSegment(null);
        // Write explain request to state file
        if (effectiveLogDir) {
          writePresentationStateUpdate(effectiveLogDir, { mode: "guided", explainRequested: true });
        }
        return;
      }

      // 'g' - Enter guided mode
      if (input === "g" || input === "G") {
        setPresentationMode("guided");
        setHighlightedSegment(null);
        if (effectiveLogDir) {
          writePresentationStateUpdate(effectiveLogDir, { mode: "guided" });
        }
        return;
      }

      // Arrow navigation switches to browse mode
      if (key.leftArrow || key.rightArrow) {
        if (presentationMode === "guided") {
          setPresentationMode("browse");
          setHighlightedSegment(null);
          if (effectiveLogDir) {
            writePresentationStateUpdate(effectiveLogDir, { mode: "browse" });
          }
        }
      }
    }

    // Tab to switch focus
    if (key.tab) {
      setFocusMode((prev) => (prev === "sidebar" ? "content" : "sidebar"));
      return;
    }

    // Navigation between steps
    if (key.leftArrow || input === "p") {
      if (currentStepIndex > 0) {
        setCurrentStepIndex((prev) => prev - 1);
        // Update state file for interactive presentations
        if (isInteractivePresentation && effectiveLogDir) {
          writePresentationStateUpdate(effectiveLogDir, { slideIndex: currentStepIndex - 1 });
        }
      }
      return;
    }

    if (key.rightArrow || input === "n" || key.return) {
      // Special handling for question steps on Enter
      if (key.return && currentStep.type === "question" && currentStep.content.question) {
        const question = currentStep.content.question;

        // If no selection, do nothing
        if (selectedOptions.size === 0) {
          return;
        }

        // If not yet answered, evaluate and show feedback
        if (!question.answered) {
          // Evaluate the answer
          const correctOptionIds = question.options
            .filter((opt) => opt.correct)
            .map((opt) => opt.id);
          const userAnswerIds = Array.from(selectedOptions);

          // Check correctness
          const isCorrect =
            correctOptionIds.length === userAnswerIds.length &&
            correctOptionIds.every((id) => userAnswerIds.includes(id));

          // Update the question state
          setModule((prev) => ({
            ...prev,
            steps: prev.steps.map((step, idx) => {
              if (idx !== currentStepIndex || !step.content.question) {
                return step;
              }
              return {
                ...step,
                completed: isCorrect, // Only mark complete if answer is correct
                content: {
                  ...step.content,
                  question: {
                    ...step.content.question,
                    answered: true,
                    isCorrect,
                    userAnswer: userAnswerIds,
                  },
                },
              };
            }),
          }));

          // Send IPC message to monitor (for tutor awareness and state.json)
          if (isLabMode) {
            const msg: LabMessage = {
              type: "questionAnswered",
              stepId: currentStep.id,
              isCorrect,
              selectedOptions: userAnswerIds,
              correctOptions: correctOptionIds,
              attempts: 1, // First attempt tracking could be enhanced
            };
            labState.sendMessage(msg);
          }

          return;
        }

        // If already answered, proceed to next step (fall through)
      }

      if (currentStepIndex < module.steps.length - 1) {
        // In lab mode: only auto-complete view-only steps (introduction, summary)
        // Task and question steps must be completed via lab detection
        const stepType = currentStep.type;
        const isViewOnlyStep = stepType === "introduction" || stepType === "summary";
        const shouldAutoComplete = !isLabMode || isViewOnlyStep;

        if (shouldAutoComplete) {
          setModule((prev) => ({
            ...prev,
            steps: prev.steps.map((step, idx) =>
              idx === currentStepIndex ? { ...step, completed: true } : step
            ),
          }));
        }
        const newIndex = currentStepIndex + 1;
        setCurrentStepIndex(newIndex);
        // Update state file for interactive presentations
        if (isInteractivePresentation && effectiveLogDir) {
          writePresentationStateUpdate(effectiveLogDir, { slideIndex: newIndex });
        }
      }
      return;
    }

    // Vertical navigation in sidebar mode
    if (focusMode === "sidebar") {
      if (key.upArrow && currentStepIndex > 0) {
        setCurrentStepIndex((prev) => prev - 1);
      } else if (
        key.downArrow &&
        currentStepIndex < module.steps.length - 1
      ) {
        setCurrentStepIndex((prev) => prev + 1);
      }
      return;
    }

    // Content mode controls
    if (focusMode === "content") {
      // Reveal hint
      if (input === "h" || input === "H") {
        const hints = currentStep.content.hints || [];
        const nextHint = hints.find((h) => !hintsRevealed.has(h.id));
        if (nextHint) {
          setHintsRevealed((prev) => new Set([...prev, nextHint.id]));
        }
        return;
      }

      // Toggle solution
      if (input === "s" || input === "S") {
        setSolutionRevealed((prev) => !prev);
        return;
      }

      // Scroll
      if (key.upArrow) {
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setScrollOffset((prev) => prev + 1);
        return;
      }

      // Question options (1-9 keys)
      if (currentStep.content.question) {
        const optionIndex = parseInt(input) - 1;
        if (
          optionIndex >= 0 &&
          optionIndex < currentStep.content.question.options.length
        ) {
          const optionId = currentStep.content.question.options[optionIndex].id;
          const question = currentStep.content.question;

          if (question.type === "single") {
            // Single select - replace selection
            setSelectedOptions(new Set([optionId]));
          } else {
            // Multi select - toggle
            setSelectedOptions((prev) => {
              const next = new Set(prev);
              if (next.has(optionId)) {
                next.delete(optionId);
              } else {
                next.add(optionId);
              }
              return next;
            });
          }
          return;
        }
      }
    }

    // Number keys (1-9) for direct slide navigation
    // Only when not in a question step (where numbers select options)
    if (!currentStep.content.question) {
      const slideNum = parseInt(input);
      if (slideNum >= 1 && slideNum <= 9 && slideNum <= module.steps.length) {
        setCurrentStepIndex(slideNum - 1);
        return;
      }
    }
  });

  // Layout calculations
  const sidebarWidth = Math.max(28, Math.floor(termWidth * 0.25));
  const contentWidth = termWidth - sidebarWidth - 1;
  const contentHeight = termHeight - 4; // Account for header

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Header */}
      <Box
        justifyContent="center"
        paddingY={1}
        borderStyle="double"
        borderColor={VTA_COLORS.primary}
      >
        <Text bold color={VTA_COLORS.primary}>
          Virtual Teaching Assistant
        </Text>
        <Text dimColor> │ </Text>
        <Text bold color={VTA_COLORS.highlight}>
          {module.title}
        </Text>
        {isLabMode && (
          <>
            <Text dimColor> │ </Text>
            <Text
              color={
                labState.stale
                  ? VTA_COLORS.warning
                  : labState.connected
                  ? VTA_COLORS.success
                  : labState.status === "error"
                  ? VTA_COLORS.error
                  : VTA_COLORS.warning
              }
            >
              {labState.stale
                ? "⚠ Lab Stale"
                : labState.connected
                ? "● Lab Connected"
                : labState.status === "error"
                ? "● Lab Error"
                : "○ Lab Starting..."}
            </Text>
            {labState.lastCompletion && (
              <>
                <Text dimColor> │ </Text>
                <Text color={VTA_COLORS.success}>
                  ✓ {labState.lastCompletion.stepId}
                </Text>
                <Text dimColor> [{labState.lastCompletion.source}]</Text>
              </>
            )}
          </>
        )}
      </Box>

      {/* Main Content */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Sidebar */}
        <Sidebar
          module={module}
          currentStepIndex={currentStepIndex}
          width={sidebarWidth}
          height={contentHeight}
          focused={focusMode === "sidebar"}
        />

        {/* Content Panel - varies by mode */}
        {showDebugPanel && isLabMode ? (
          <DebugPanel
            labState={labState}
            width={contentWidth}
            height={contentHeight}
            logDir={socketPath ? deriveLogDir(socketPath) : undefined}
          />
        ) : isInteractivePresentation ? (
          <PresentationContent
            title={currentStep.title}
            instructions={currentStep.content.instructions || ""}
            segments={currentStep.content.narrationSegments || []}
            highlightedSegment={highlightedSegment}
            mode={presentationMode}
            slideIndex={currentStepIndex}
            totalSlides={module.steps.length}
            width={contentWidth}
            height={contentHeight}
            focused={focusMode === "content"}
          />
        ) : (
          <TaskPanel
            step={currentStep}
            width={contentWidth}
            height={contentHeight}
            focused={focusMode === "content"}
            hintsRevealed={hintsRevealed}
            solutionRevealed={solutionRevealed}
            selectedOptions={selectedOptions}
            scrollOffset={scrollOffset}
          />
        )}
      </Box>
    </Box>
  );
}

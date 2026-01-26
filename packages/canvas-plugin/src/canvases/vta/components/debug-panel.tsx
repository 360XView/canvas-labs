import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { existsSync, readFileSync, watch } from "fs";
import { join } from "path";
import { VTA_COLORS } from "../types";
import type { DebugEvent, LabFeedbackState } from "../hooks/use-lab-feedback";
import type { LabState } from "../../../lab/tutor-control/state-writer";

interface DebugPanelProps {
  labState: LabFeedbackState;
  width: number;
  height: number;
  logDir?: string; // Path to lab log directory for reading state.json
}

export function DebugPanel({ labState, width, height, logDir }: DebugPanelProps) {
  const { connected, stale, status, events, completedSteps, lastCompletion } = labState;

  // Read state.json for scoring info
  const [labStateFile, setLabStateFile] = useState<LabState | null>(null);

  useEffect(() => {
    if (!logDir) return;

    // Check if log directory exists before watching
    if (!existsSync(logDir)) {
      return;
    }

    const statePath = join(logDir, "state.json");

    const readState = () => {
      try {
        if (existsSync(statePath)) {
          const content = readFileSync(statePath, "utf-8");
          setLabStateFile(JSON.parse(content));
        }
      } catch (e) {
        // Ignore read errors
      }
    };

    // Initial read
    readState();

    // Watch for changes
    let watcher: ReturnType<typeof watch> | null = null;
    try {
      watcher = watch(logDir, (eventType, filename) => {
        if (filename === "state.json") {
          readState();
        }
      });
    } catch (e) {
      // Ignore watch errors (directory might not exist)
    }

    return () => watcher?.close();
  }, [logDir]);

  // Separate ping events from other events for compression
  const pingEvents = events.filter(
    (e) => e.type === "message" && (e.data as any)?.type === "ping"
  );
  const nonPingEvents = events.filter(
    (e) => !(e.type === "message" && (e.data as any)?.type === "ping")
  );
  const lastPing = pingEvents[pingEvents.length - 1];
  const pingCount = pingEvents.length;

  // Calculate how much space for events based on whether we have scoring
  const hasScoring = labStateFile?.scoring;
  const scoringLines = hasScoring ? 6 : 0;
  const pingLine = pingCount > 0 ? 1 : 0;
  const recentEvents = [...nonPingEvents].reverse().slice(0, height - 12 - scoringLines - pingLine);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={VTA_COLORS.warning}
      paddingX={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={VTA_COLORS.warning}>
          Debug Panel
        </Text>
        <Text dimColor> (press d to close)</Text>
      </Box>

      {/* Connection Status */}
      <Box marginBottom={1}>
        <Text color={VTA_COLORS.muted}>Status: </Text>
        {stale ? (
          <Text color={VTA_COLORS.warning}>
            ⚠ Stale Connection (no heartbeat)
          </Text>
        ) : (
          <Text color={connected ? VTA_COLORS.success : VTA_COLORS.error}>
            {connected ? "● Connected" : "○ Disconnected"}
          </Text>
        )}
        <Text dimColor> ({status})</Text>
      </Box>

      {/* Scoring Section */}
      {hasScoring && (
        <Box marginBottom={1} flexDirection="column">
          <Text color={VTA_COLORS.muted} underline>
            Scoring ({labStateFile.scoring!.presetId}):
          </Text>
          <Box paddingLeft={1} flexDirection="column">
            <Box>
              <Text color={VTA_COLORS.muted}>Overall: </Text>
              <Text color={getScoreColor(labStateFile.scoring!.overallScore)}>
                {Math.round(labStateFile.scoring!.overallScore * 100)}%
              </Text>
              <Text dimColor> | </Text>
              <Text color={VTA_COLORS.muted}>Completion: </Text>
              <Text>{labStateFile.scoring!.completionPct}%</Text>
              <Text dimColor> | </Text>
              <Text color={labStateFile.scoring!.passed ? VTA_COLORS.success : VTA_COLORS.warning}>
                {labStateFile.scoring!.passed ? "PASS" : "IN PROGRESS"}
              </Text>
            </Box>
            {/* Step scores */}
            <Box>
              <Text dimColor>Steps: </Text>
              {labStateFile.steps
                .filter((s) => s.confidence !== undefined)
                .map((s, idx) => (
                  <Box key={s.id}>
                    {idx > 0 && <Text dimColor>, </Text>}
                    <Text color={getScoreColor(s.confidence!)}>
                      {s.id.slice(0, 8)}:{Math.round(s.confidence! * 100)}%
                    </Text>
                  </Box>
                ))}
            </Box>
          </Box>
        </Box>
      )}

      {/* Completed Steps */}
      <Box marginBottom={1} flexDirection="column">
        <Text color={VTA_COLORS.muted}>
          Completed ({completedSteps.size}):
        </Text>
        <Box paddingLeft={1}>
          <Text color={VTA_COLORS.success}>
            {completedSteps.size > 0
              ? [...completedSteps].join(", ")
              : "(none)"}
          </Text>
        </Box>
      </Box>

      {/* Last Completion */}
      {lastCompletion && (
        <Box marginBottom={1}>
          <Text color={VTA_COLORS.muted}>Last: </Text>
          <Text color={VTA_COLORS.success}>{lastCompletion.stepId}</Text>
          <Text dimColor>
            {" "}
            [{lastCompletion.source}] {formatTime(lastCompletion.timestamp)}
          </Text>
        </Box>
      )}

      {/* Event Log */}
      <Box flexDirection="column" flexGrow={1}>
        <Text color={VTA_COLORS.muted} underline>
          Events:
        </Text>
        {recentEvents.length === 0 ? (
          <Text dimColor>No events yet...</Text>
        ) : (
          recentEvents.map((event, idx) => (
            <EventLine key={idx} event={event} />
          ))
        )}
      </Box>
    </Box>
  );
}

function getScoreColor(score: number): string {
  if (score >= 0.7) return VTA_COLORS.success;
  if (score >= 0.4) return VTA_COLORS.warning;
  return VTA_COLORS.error;
}

function EventLine({ event }: { event: DebugEvent }) {
  const time = formatTime(event.timestamp);

  let icon: string;
  let color: string;
  let text: string;

  switch (event.type) {
    case "connected":
      icon = "→";
      color = VTA_COLORS.success;
      text = "Monitor connected";
      break;
    case "disconnected":
      icon = "←";
      color = VTA_COLORS.warning;
      text = "Monitor disconnected";
      break;
    case "error":
      icon = "✗";
      color = VTA_COLORS.error;
      text = typeof event.data === "string" ? event.data : "Error";
      break;
    case "message":
      icon = "◆";
      color = VTA_COLORS.primary;
      if (typeof event.data === "object" && event.data !== null) {
        const msg = event.data as { type: string; stepId?: string; source?: string };
        if (msg.type === "taskCompleted") {
          text = `taskCompleted: ${msg.stepId} [${msg.source || "?"}]`;
        } else if (msg.type === "labStatus") {
          text = `labStatus: ${(msg as any).status}`;
        } else {
          text = `message: ${msg.type}`;
        }
      } else {
        text = "Unknown message";
      }
      break;
    default:
      icon = "?";
      color = VTA_COLORS.muted;
      text = "Unknown event";
  }

  return (
    <Box>
      <Text dimColor>{time} </Text>
      <Text color={color}>{icon} </Text>
      <Text>{text}</Text>
    </Box>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

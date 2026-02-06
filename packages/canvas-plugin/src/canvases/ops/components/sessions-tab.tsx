// Ops Monitor - Sessions tab component
// Tmux session/pane listing

import React from "react";
import { Box, Text } from "ink";
import type { TmuxSession } from "../types";
import { OPS_COLORS } from "../types";

function truncate(s: string, maxLen: number): string {
  if (maxLen <= 1) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "\u2026";
}

interface Props {
  sessions: TmuxSession[];
  selectedIdx: number;
  expanded: boolean;
  innerWidth: number;
  contentRows: number;
}

export function SessionsTab({ sessions, selectedIdx, expanded, innerWidth, contentRows }: Props) {
  if (sessions.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={OPS_COLORS.dim}>Not in tmux / No sessions found</Text>
      </Box>
    );
  }

  const elements: JSX.Element[] = [];
  let rowCount = 0;

  for (let i = 0; i < sessions.length; i++) {
    if (rowCount >= contentRows) break;
    const session = sessions[i];
    const isSelected = i === selectedIdx;
    const attachedTag = session.attached ? " [attached]" : "";

    elements.push(
      <Box key={`session-${i}`} flexDirection="column">
        <Box>
          <Text color={isSelected ? OPS_COLORS.selected : OPS_COLORS.dim}>
            {isSelected ? "\u25B8" : " "}
          </Text>
          <Text color={OPS_COLORS.text} bold>
            {session.name}
          </Text>
          <Text color={OPS_COLORS.dim}>
            {` (${session.windows} window${session.windows !== 1 ? "s" : ""})`}
          </Text>
          {session.attached && (
            <Text color={OPS_COLORS.success}>{attachedTag}</Text>
          )}
        </Box>
      </Box>
    );
    rowCount++;

    // Show panes when selected and expanded
    if (isSelected && expanded && session.panes.length > 0) {
      for (const pane of session.panes) {
        if (rowCount >= contentRows) break;
        const pathShort = pane.currentPath.replace(/^\/Users\/[^/]+/, "~");
        elements.push(
          <Box key={`pane-${pane.sessionName}-${pane.windowIndex}-${pane.paneIndex}`} marginLeft={3}>
            <Text color={OPS_COLORS.dim}>
              {pane.windowName}:{pane.paneIndex}
            </Text>
            <Text color={OPS_COLORS.primary}>
              {"  "}{pane.currentCommand}
            </Text>
            <Text color={OPS_COLORS.dim}>
              {"  "}{truncate(pathShort, innerWidth - 30)}
            </Text>
          </Box>
        );
        rowCount++;
      }
    }
  }

  return (
    <Box flexDirection="column">
      {elements}
    </Box>
  );
}

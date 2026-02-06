// Ops Monitor - Actions tab component
// Scrollable list of action items with status indicators

import React from "react";
import { Box, Text } from "ink";
import type { ActionItem } from "../types";
import { OPS_COLORS } from "../types";

function truncate(s: string, maxLen: number): string {
  if (maxLen <= 1) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "\u2026";
}

interface Props {
  actions: ActionItem[];
  selectedIdx: number;
  innerWidth: number;
  contentRows: number;
}

export function ActionsTab({ actions, selectedIdx, innerWidth, contentRows }: Props) {
  if (actions.length === 0) {
    return <Text color={OPS_COLORS.dim}>No actions found</Text>;
  }

  return (
    <Box flexDirection="column">
      {actions.slice(0, contentRows).map((action, i) => {
        const isSelected = i === selectedIdx;
        const isOpen = action.status === "open";
        const bullet = isOpen ? "\u25CF" : "\u25CB";
        const bulletColor = isOpen ? OPS_COLORS.success : OPS_COLORS.dim;

        const agentWidth = 5;
        const priorityWidth = action.priority.length + 2;
        const dateStr = action.created ? action.created.slice(0, 10) : "";
        const dateWidth = dateStr ? dateStr.length + 2 : 0;
        const titleWidth = innerWidth - agentWidth - priorityWidth - dateWidth - 5;

        return (
          <Box key={`action-${i}`}>
            <Text color={isSelected ? OPS_COLORS.selected : OPS_COLORS.dim}>
              {isSelected ? "\u25B8" : " "}
            </Text>
            <Text color={bulletColor}>
              {bullet}{" "}
            </Text>
            <Text color={isSelected ? OPS_COLORS.text : OPS_COLORS.dim}>
              {truncate(action.title, titleWidth)}
            </Text>
            <Text color={OPS_COLORS.dim}>
              {"  "}
            </Text>
            <Text color={OPS_COLORS.warning}>
              {action.agent.padEnd(agentWidth)}
            </Text>
            <Text color={OPS_COLORS.dim}>
              {action.priority}
            </Text>
            {dateStr && (
              <Text color={OPS_COLORS.dim}>
                {"  "}{dateStr}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

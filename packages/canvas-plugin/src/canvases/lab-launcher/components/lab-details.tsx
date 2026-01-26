// Lab Details Component - Right panel showing selected lab details

import React from "react";
import { Box, Text } from "ink";
import { type LabInfo, LAB_COLORS } from "../types";

interface Props {
  lab: LabInfo | undefined;
  width: number;
}

export function LabDetails({ lab, width }: Props) {
  if (!lab) {
    return (
      <Box flexDirection="column">
        <Text color={LAB_COLORS.dim}>Select a lab to see details</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Lab title */}
      <Text color={LAB_COLORS.primary} bold>
        {lab.title}
      </Text>

      {/* Separator */}
      <Text color={LAB_COLORS.dim}>{"─".repeat(Math.min(width - 4, lab.title.length + 4))}</Text>

      {/* Description */}
      {lab.description && (
        <Box marginTop={1} flexDirection="column">
          <Text color={LAB_COLORS.text} wrap="wrap">
            {lab.description}
          </Text>
        </Box>
      )}

      {/* Stats */}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color={LAB_COLORS.secondary}>Steps: </Text>
          <Text color={LAB_COLORS.text}>{lab.stepCount}</Text>
        </Box>
        <Box>
          <Text color={LAB_COLORS.secondary}>Tasks: </Text>
          <Text color={LAB_COLORS.text}>{lab.taskCount}</Text>
        </Box>
      </Box>

      {/* Prerequisites */}
      <Box marginTop={1} flexDirection="column">
        <Text color={LAB_COLORS.secondary}>Prerequisites:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color={LAB_COLORS.dim}>- Docker Desktop</Text>
          <Text color={LAB_COLORS.dim}>- tmux</Text>
        </Box>
      </Box>
    </Box>
  );
}

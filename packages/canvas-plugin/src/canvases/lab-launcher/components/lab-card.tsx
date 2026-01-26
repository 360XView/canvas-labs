// Lab Card Component - Individual lab item display

import React from "react";
import { Box, Text } from "ink";
import { type LabInfo, LAB_COLORS } from "../types";

interface Props {
  lab: LabInfo;
  selected: boolean;
  focused: boolean;
}

export function LabCard({ lab, selected, focused }: Props) {
  const borderColor = selected && focused ? LAB_COLORS.primary : LAB_COLORS.dim;
  const indicator = selected ? ">" : " ";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={selected ? LAB_COLORS.primary : LAB_COLORS.dim}>
          {indicator}{" "}
        </Text>
        <Text color={selected ? LAB_COLORS.primary : LAB_COLORS.text} bold={selected}>
          {lab.title}
        </Text>
      </Box>
      {selected && (
        <Box marginLeft={3}>
          <Text color={LAB_COLORS.dim}>
            {lab.stepCount} steps ({lab.taskCount} tasks)
          </Text>
        </Box>
      )}
    </Box>
  );
}

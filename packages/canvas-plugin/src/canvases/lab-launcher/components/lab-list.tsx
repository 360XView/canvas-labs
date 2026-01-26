// Lab List Component - Scrollable list of labs

import React from "react";
import { Box, Text } from "ink";
import { LabCard } from "./lab-card";
import { type LabInfo, LAB_COLORS } from "../types";

interface Props {
  labs: LabInfo[];
  selectedIndex: number;
  focused: boolean;
  maxHeight: number;
}

export function LabList({ labs, selectedIndex, focused, maxHeight }: Props) {
  if (labs.length === 0) {
    return (
      <Box>
        <Text color={LAB_COLORS.dim}>No labs available</Text>
      </Box>
    );
  }

  // Calculate visible range (simple scrolling)
  const itemHeight = 3; // Each lab card is ~3 lines when selected
  const visibleItems = Math.floor(maxHeight / itemHeight);

  let startIndex = 0;
  if (selectedIndex >= visibleItems) {
    startIndex = selectedIndex - visibleItems + 1;
  }

  const endIndex = Math.min(startIndex + visibleItems, labs.length);
  const visibleLabs = labs.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column">
      {visibleLabs.map((lab, i) => {
        const actualIndex = startIndex + i;
        return (
          <LabCard
            key={lab.id}
            lab={lab}
            selected={actualIndex === selectedIndex}
            focused={focused}
          />
        );
      })}

      {/* Scroll indicator */}
      {labs.length > visibleItems && (
        <Box marginTop={1}>
          <Text color={LAB_COLORS.dim}>
            {startIndex > 0 ? "^ " : "  "}
            [{selectedIndex + 1}/{labs.length}]
            {endIndex < labs.length ? " v" : "  "}
          </Text>
        </Box>
      )}
    </Box>
  );
}

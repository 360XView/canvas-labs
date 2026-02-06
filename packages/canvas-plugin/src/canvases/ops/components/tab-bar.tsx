// Ops Monitor - Tab bar component
// Horizontal row of numbered tabs with active highlight

import React from "react";
import { Box, Text } from "ink";
import type { TabId } from "../types";
import { TABS, OPS_COLORS } from "../types";

interface Props {
  activeTab: TabId;
}

export function TabBar({ activeTab }: Props) {
  return (
    <Box>
      {TABS.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <Box key={tab.id}>
            {i > 0 && <Text color={OPS_COLORS.dim}> </Text>}
            <Text
              color={isActive ? OPS_COLORS.primary : OPS_COLORS.dim}
              bold={isActive}
            >
              [{tab.key}:{tab.label}]
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

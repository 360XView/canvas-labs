// Ops Monitor - Summary bar component
// Always-visible counts bar below the tab bar

import React from "react";
import { Box, Text } from "ink";
import type { SummaryCounts } from "../types";
import { OPS_COLORS } from "../types";

interface Props {
  counts: SummaryCounts;
}

export function SummaryBar({ counts }: Props) {
  const inboxColor = counts.inbox > 0 ? OPS_COLORS.warning : OPS_COLORS.dim;
  const actionsColor = counts.actionsOpen > 0 ? OPS_COLORS.warning : OPS_COLORS.dim;
  const gitAllClean = counts.gitClean === counts.gitTotal;
  const gitColor = gitAllClean ? OPS_COLORS.success : OPS_COLORS.warning;

  return (
    <Box>
      <Text color={OPS_COLORS.dim}>Inbox: </Text>
      <Text color={inboxColor}>{counts.inbox}</Text>
      <Text color={OPS_COLORS.dim}>{" \u2502 "}</Text>

      <Text color={OPS_COLORS.dim}>Tickets: </Text>
      <Text color={counts.ticketsOpen > 0 ? OPS_COLORS.text : OPS_COLORS.dim}>
        {counts.ticketsOpen} open
      </Text>
      <Text color={OPS_COLORS.dim}>{" \u2502 "}</Text>

      <Text color={OPS_COLORS.dim}>Ideas: </Text>
      <Text color={counts.ideas > 0 ? OPS_COLORS.text : OPS_COLORS.dim}>
        {counts.ideas}
      </Text>
      <Text color={OPS_COLORS.dim}>{" \u2502 "}</Text>

      <Text color={OPS_COLORS.dim}>Actions: </Text>
      <Text color={actionsColor}>{counts.actionsOpen} open</Text>
      <Text color={OPS_COLORS.dim}>{" \u2502 "}</Text>

      <Text color={OPS_COLORS.dim}>Git: </Text>
      <Text color={gitColor}>
        {counts.gitClean}/{counts.gitTotal} clean
      </Text>
    </Box>
  );
}

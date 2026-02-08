// Ops Monitor - Agents tab component
// Per-agent health dashboard: reflections, git, messages, memory

import React from "react";
import { Box, Text } from "ink";
import type { ReviewStatus } from "../types";
import { OPS_COLORS } from "../types";

interface Props {
  reviewStatus: ReviewStatus;
  selectedIdx: number;
  innerWidth: number;
  contentRows: number;
}

export function AgentsTab({ reviewStatus, selectedIdx, innerWidth, contentRows }: Props) {
  const { lastActionPlanDate, lastActionPlanDaysAgo, agentReflections, agentActivity, newReflectionsSinceLastPlan, reviewDue } = reviewStatus;

  const planLabel = lastActionPlanDaysAgo === -1
    ? "NEVER"
    : `${lastActionPlanDate} (${lastActionPlanDaysAgo}d ago)`;
  const planColor = lastActionPlanDaysAgo === -1
    ? OPS_COLORS.error
    : lastActionPlanDaysAgo > 4
      ? OPS_COLORS.error
      : lastActionPlanDaysAgo > 2
        ? OPS_COLORS.warning
        : OPS_COLORS.success;

  const dueColor = reviewDue ? OPS_COLORS.warning : OPS_COLORS.success;
  const dueLabel = reviewDue ? "DUE" : "OK";

  // Build rows from agentActivity (includes shared)
  const rows = agentActivity.map((act) => {
    const refl = agentReflections.find((r) => r.agent === act.agent);
    const isNew = refl && lastActionPlanDate ? refl.lastDate > lastActionPlanDate : false;
    const hasActivity = act.commitCount > 0 || act.sentCount > 0 || act.filesChanged > 0;

    let statusLabel: string;
    let statusColor: string;
    if (isNew && hasActivity) {
      statusLabel = "ACTIVE+NEW";
      statusColor = OPS_COLORS.warning;
    } else if (isNew) {
      statusLabel = "NEW REFL";
      statusColor = OPS_COLORS.warning;
    } else if (hasActivity) {
      statusLabel = "ACTIVE";
      statusColor = OPS_COLORS.accent;
    } else {
      statusLabel = "idle";
      statusColor = OPS_COLORS.dim;
    }

    return {
      agent: act.agent,
      reflDate: refl?.lastDate || "",
      reflDays: refl?.daysAgo ?? -1,
      ...act,
      isNew,
      statusLabel,
      statusColor,
    };
  });

  const divider = "\u2500".repeat(Math.min(90, innerWidth));

  return (
    <Box flexDirection="column">
      {/* Review cycle header */}
      <Box marginBottom={1}>
        <Text color={OPS_COLORS.dim}>Last review: </Text>
        <Text color={planColor}>{planLabel}</Text>
        <Text color={OPS_COLORS.dim}>{"  \u2502  "}</Text>
        <Text color={OPS_COLORS.dim}>Status: </Text>
        <Text color={dueColor} bold>{dueLabel}</Text>
        <Text color={OPS_COLORS.dim}>{"  \u2502  "}</Text>
        <Text color={OPS_COLORS.dim}>Unsynthesized: </Text>
        <Text color={newReflectionsSinceLastPlan > 0 ? OPS_COLORS.warning : OPS_COLORS.dim}>
          {newReflectionsSinceLastPlan}
        </Text>
      </Box>

      {/* Column headers */}
      <Box>
        <Text color={OPS_COLORS.header}>
          {"  Agent     Reflected  Cmts Dirty Unpsh Inbox Sent  MemTot Mem24h Status"}
        </Text>
      </Box>
      <Text color={OPS_COLORS.dim}>{divider}</Text>

      {/* Agent rows */}
      {rows.map((row, idx) => {
        const isSelected = idx === selectedIdx;
        const prefix = isSelected ? "\u25B6 " : "  ";

        const agent = row.agent.padEnd(10);
        const refl = row.reflDate
          ? `${row.reflDays}d`.padEnd(11)
          : (row.agent === "shared" ? "-" : "never").padEnd(11);
        const cmts = `${row.commitCount}`.padEnd(5);
        const dirty = `${row.dirtyFiles}`.padEnd(6);
        const unpsh = `${row.unpushedCommits}`.padEnd(6);
        const inbox = (row.agent === "shared" ? "-" : `${row.inboxCount}`).padEnd(6);
        const sent = (row.agent === "shared" ? "-" : `${row.sentCount}`).padEnd(6);
        const memTot = row.hasMemory ? `${row.memoryTotal}`.padEnd(7) : "-".padEnd(7);
        const mem24h = row.hasMemory ? `${row.memory24h}`.padEnd(7) : "-".padEnd(7);

        // Color dirty/unpushed if non-zero
        const dirtyColor = row.dirtyFiles > 0 ? OPS_COLORS.warning : (isSelected ? OPS_COLORS.selected : OPS_COLORS.text);
        const unpshColor = row.unpushedCommits > 0 ? OPS_COLORS.accent : (isSelected ? OPS_COLORS.selected : OPS_COLORS.text);
        const memTotColor = row.hasMemory && row.memoryTotal > 0 ? OPS_COLORS.success : (isSelected ? OPS_COLORS.selected : OPS_COLORS.dim);
        const mem24hColor = row.hasMemory && row.memory24h > 0 ? OPS_COLORS.success : (isSelected ? OPS_COLORS.selected : OPS_COLORS.dim);
        const baseColor = isSelected ? OPS_COLORS.selected : OPS_COLORS.text;

        return (
          <Box key={row.agent}>
            <Text color={baseColor} bold={isSelected}>{prefix}{agent}{refl}{cmts}</Text>
            <Text color={dirtyColor} bold={isSelected}>{dirty}</Text>
            <Text color={unpshColor} bold={isSelected}>{unpsh}</Text>
            <Text color={baseColor} bold={isSelected}>{inbox}{sent}</Text>
            <Text color={memTotColor}>{memTot}</Text>
            <Text color={mem24hColor}>{mem24h}</Text>
            <Text color={row.statusColor} bold={row.isNew}>{row.statusLabel}</Text>
          </Box>
        );
      })}

      <Text color={OPS_COLORS.dim}>{divider}</Text>

      {/* Selected agent detail */}
      {rows[selectedIdx] && (
        <Box flexDirection="column">
          <Text color={OPS_COLORS.dim}>
            {rows[selectedIdx].lastCommitMsg
              ? `Last commit: ${rows[selectedIdx].lastCommitMsg}`
              : "No commits since last review"}
          </Text>
          {rows[selectedIdx].hasMemory && (
            <Text color={OPS_COLORS.dim}>
              Memory: {rows[selectedIdx].memoryTotal} total log files, {rows[selectedIdx].memory24h} updated in last 24h
            </Text>
          )}
        </Box>
      )}

      {/* Legend */}
      <Box marginTop={1}>
        <Text color={OPS_COLORS.dim}>Status: </Text>
        <Text color={OPS_COLORS.warning}>ACTIVE+NEW</Text>
        <Text color={OPS_COLORS.dim}>=working + unreviewed reflection  </Text>
        <Text color={OPS_COLORS.accent}>ACTIVE</Text>
        <Text color={OPS_COLORS.dim}>=working  </Text>
        <Text color={OPS_COLORS.warning}>NEW REFL</Text>
        <Text color={OPS_COLORS.dim}>=reflection pending review  </Text>
        <Text color={OPS_COLORS.dim}>idle=no activity</Text>
      </Box>

      {/* Guidance */}
      {reviewDue && (
        <Box>
          <Text color={OPS_COLORS.warning}>
            Review cycle is due. Run /wpm_review_cycle in WPM to synthesize {newReflectionsSinceLastPlan} new reflections.
          </Text>
        </Box>
      )}
    </Box>
  );
}

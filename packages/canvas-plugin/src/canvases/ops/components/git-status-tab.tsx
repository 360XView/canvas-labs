// Ops Monitor - Git status tab component
// Shows git status for both canvas-labs and canvas-team repos

import React from "react";
import { Box, Text } from "ink";
import type { RepoGitStatus } from "../types";
import { OPS_COLORS } from "../types";

function truncate(s: string, maxLen: number): string {
  if (maxLen <= 1) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "\u2026";
}

interface Props {
  statuses: RepoGitStatus[];
  selectedIdx: number;
  expanded: boolean;
  innerWidth: number;
}

export function GitStatusTab({ statuses, selectedIdx, expanded, innerWidth }: Props) {
  if (statuses.length === 0) {
    return <Text color={OPS_COLORS.dim}>No repositories found</Text>;
  }

  return (
    <Box flexDirection="column">
      {statuses.map((repo, i) => {
        const isSelected = i === selectedIdx;
        const statusIcon = repo.dirty ? "\u2717" : "\u2713";
        const statusColor = repo.dirty ? OPS_COLORS.warning : OPS_COLORS.success;
        const statusText = repo.dirty
          ? `${repo.dirtyFiles.length} dirty`
          : "clean";

        const commitText = repo.lastCommit
          ? `"${truncate(repo.lastCommit, 40)}"`
          : "";
        const ageText = repo.lastCommitAge ? ` (${repo.lastCommitAge})` : "";

        return (
          <Box key={repo.name} flexDirection="column">
            <Box>
              <Text color={isSelected ? OPS_COLORS.selected : OPS_COLORS.dim}>
                {isSelected ? "\u25B8" : " "}
              </Text>
              <Text color={OPS_COLORS.text} bold>
                {repo.name.padEnd(14)}
              </Text>
              <Text color={OPS_COLORS.primary}>
                {repo.branch.padEnd(12)}
              </Text>
              <Text color={statusColor}>
                {statusIcon} {statusText.padEnd(10)}
              </Text>
              {repo.hasRemote && (
                <Text color={OPS_COLORS.dim}>
                  {"\u2191"}{repo.ahead} {"\u2193"}{repo.behind}{"  "}
                </Text>
              )}
              {!repo.hasRemote && (
                <Text color={OPS_COLORS.dim}>
                  {"no remote  "}
                </Text>
              )}
              <Text color={OPS_COLORS.dim}>
                {truncate(commitText + ageText, innerWidth - 50)}
              </Text>
            </Box>

            {/* Show dirty files when this repo is selected and expanded */}
            {isSelected && expanded && repo.dirty && (
              <Box flexDirection="column" marginLeft={2} marginBottom={1}>
                {repo.dirtyFiles.map((file, fi) => (
                  <Box key={fi}>
                    <Text color={OPS_COLORS.warning}>
                      {"  "}{truncate(file, innerWidth - 6)}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

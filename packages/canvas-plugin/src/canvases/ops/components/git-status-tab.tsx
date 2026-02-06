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

interface Advice {
  text: string;
  color: string;
}

function getGitAdvice(repo: RepoGitStatus): Advice[] {
  const advice: Advice[] = [];

  // Dirty files
  if (repo.dirty) {
    const n = repo.dirtyFiles.length;
    if (n > 20) {
      advice.push({ text: `${n} uncommitted files \u2014 consider committing or stashing`, color: OPS_COLORS.error });
    } else if (n > 0) {
      advice.push({ text: `${n} uncommitted file${n > 1 ? "s" : ""} \u2014 commit or stash when ready`, color: OPS_COLORS.warning });
    }
  }

  // Ahead of remote
  if (repo.hasRemote && repo.ahead > 0 && repo.behind === 0) {
    advice.push({ text: `${repo.ahead} commit${repo.ahead > 1 ? "s" : ""} ahead \u2014 ready to push`, color: OPS_COLORS.primary });
  }

  // Behind remote
  if (repo.hasRemote && repo.behind > 0 && repo.ahead === 0) {
    advice.push({ text: `${repo.behind} commit${repo.behind > 1 ? "s" : ""} behind \u2014 pull to stay current`, color: OPS_COLORS.warning });
  }

  // Diverged
  if (repo.hasRemote && repo.ahead > 0 && repo.behind > 0) {
    advice.push({ text: `Diverged (\u2191${repo.ahead} \u2193${repo.behind}) \u2014 rebase or merge needed`, color: OPS_COLORS.error });
  }

  // No remote
  if (!repo.hasRemote) {
    advice.push({ text: "No remote tracking \u2014 set upstream to enable push/pull", color: OPS_COLORS.dim });
  }

  // All clean
  if (advice.length === 0) {
    advice.push({ text: "\u2713 All good", color: OPS_COLORS.success });
  }

  return advice;
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

            {/* Advice line */}
            <Box marginLeft={2}>
              {getGitAdvice(repo).map((a, ai) => (
                <Text key={ai} color={a.color}>
                  {ai > 0 ? "  \u2022  " : ""}{a.text}
                </Text>
              ))}
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

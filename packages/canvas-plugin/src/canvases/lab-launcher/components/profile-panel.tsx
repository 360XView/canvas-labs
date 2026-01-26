// Profile Panel Component - Profile management UI
// Toggle with 'p' key, replaces lab details when open

import React from "react";
import { Box, Text } from "ink";
import { LAB_COLORS } from "../types";
import type { Profile, Progress } from "../../../tutor/types";
import { formatDuration } from "../../../tutor/profile-manager";

interface ProfileWithStats {
  profile: Profile;
  progress: Progress | null;
}

interface Props {
  profiles: ProfileWithStats[];
  currentProfileId: string;
  selectedIndex: number;
  width: number;
  height: number;
  viewing?: boolean;
}

export function ProfilePanel({
  profiles,
  currentProfileId,
  selectedIndex,
  width,
  height,
  viewing = false,
}: Props) {
  const selectedProfile = profiles[selectedIndex];

  // Calculate lab count for a profile
  const getLabCount = (progress: Progress | null): number => {
    if (!progress) return 0;
    return Object.keys(progress.labs).length;
  };

  // Get completed lab count
  const getCompletedCount = (progress: Progress | null): number => {
    if (!progress) return 0;
    return Object.values(progress.labs).filter(
      (lab) => lab.status === "completed"
    ).length;
  };

  // Render detailed profile view
  if (viewing && selectedProfile) {
    const { profile, progress } = selectedProfile;
    const labIds = progress ? Object.keys(progress.labs) : [];

    return (
      <Box flexDirection="column" width={width}>
        {/* Header */}
        <Box marginBottom={1}>
          <Text color={LAB_COLORS.secondary} bold>
            {"[ PROFILE DETAILS ]"}
          </Text>
        </Box>

        {/* Profile name */}
        <Box marginBottom={1}>
          <Text color={LAB_COLORS.primary} bold>
            {profile.name}
          </Text>
          <Text color={LAB_COLORS.dim}> ({profile.id})</Text>
        </Box>

        {/* Divider */}
        <Text color={LAB_COLORS.dim}>{"─".repeat(Math.min(width - 4, 30))}</Text>

        {/* Basic info */}
        <Box flexDirection="column" marginY={1}>
          <Text color={LAB_COLORS.dim}>
            Created:{" "}
            <Text color={LAB_COLORS.text}>
              {new Date(profile.createdAt).toLocaleDateString()}
            </Text>
          </Text>
          <Text color={LAB_COLORS.dim}>
            Last active:{" "}
            <Text color={LAB_COLORS.text}>
              {new Date(profile.lastActiveAt).toLocaleDateString()}
            </Text>
          </Text>
        </Box>

        {/* Divider */}
        <Text color={LAB_COLORS.dim}>{"─".repeat(Math.min(width - 4, 30))}</Text>

        {/* Aggregate stats */}
        {progress && (
          <Box flexDirection="column" marginY={1}>
            <Text color={LAB_COLORS.secondary} bold>
              Statistics
            </Text>
            <Text color={LAB_COLORS.dim}>
              Labs completed:{" "}
              <Text color={LAB_COLORS.success}>
                {progress.aggregate.totalLabsCompleted}
              </Text>
            </Text>
            <Text color={LAB_COLORS.dim}>
              Total attempts:{" "}
              <Text color={LAB_COLORS.text}>
                {progress.aggregate.totalAttempts}
              </Text>
            </Text>
            <Text color={LAB_COLORS.dim}>
              Time spent:{" "}
              <Text color={LAB_COLORS.text}>
                {formatDuration(progress.aggregate.totalTimeSpent)}
              </Text>
            </Text>
            <Text color={LAB_COLORS.dim}>
              Hints used:{" "}
              <Text color={LAB_COLORS.warning}>
                {progress.aggregate.totalHintsUsed}
              </Text>
            </Text>
          </Box>
        )}

        {/* Lab progress */}
        {labIds.length > 0 && progress && (
          <Box flexDirection="column" marginTop={1}>
            <Text color={LAB_COLORS.dim}>
              {"─".repeat(Math.min(width - 4, 30))}
            </Text>
            <Text color={LAB_COLORS.secondary} bold>
              Lab Progress
            </Text>
            {labIds.map((labId) => {
              const lab = progress.labs[labId];
              const statusColor =
                lab.status === "completed"
                  ? LAB_COLORS.success
                  : lab.status === "in_progress"
                  ? LAB_COLORS.warning
                  : LAB_COLORS.dim;
              return (
                <Box key={labId}>
                  <Text color={statusColor}>
                    {lab.status === "completed" ? "✓" : lab.status === "in_progress" ? "◐" : "○"}{" "}
                  </Text>
                  <Text color={LAB_COLORS.text}>{labId}</Text>
                  <Text color={LAB_COLORS.dim}>
                    {" "}({lab.attempts.length} attempt{lab.attempts.length !== 1 ? "s" : ""})
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}

        {/* No progress message */}
        {(!progress || labIds.length === 0) && (
          <Box marginTop={1}>
            <Text color={LAB_COLORS.dim}>No lab progress yet</Text>
          </Box>
        )}

        {/* Actions hint */}
        <Box flexDirection="column" marginTop={1}>
          <Text color={LAB_COLORS.dim}>
            {"─".repeat(Math.min(width - 4, 30))}
          </Text>
          <Text color={LAB_COLORS.dim}>
            <Text color={LAB_COLORS.secondary}>[v]</Text> back to list
          </Text>
        </Box>
      </Box>
    );
  }

  // Render profile list view
  const itemHeight = 2;
  const headerHeight = 3;
  const footerHeight = 3;
  const availableHeight = height - headerHeight - footerHeight;
  const visibleItems = Math.floor(availableHeight / itemHeight);

  let startIndex = 0;
  if (selectedIndex >= visibleItems) {
    startIndex = selectedIndex - visibleItems + 1;
  }

  const endIndex = Math.min(startIndex + visibleItems, profiles.length);
  const visibleProfiles = profiles.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column" width={width}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={LAB_COLORS.secondary} bold>
          {"[ PROFILE MANAGEMENT ]"}
        </Text>
      </Box>

      {/* Current profile indicator */}
      <Box marginBottom={1}>
        <Text color={LAB_COLORS.dim}>
          Current:{" "}
          <Text color={LAB_COLORS.success}>
            {profiles.find((p) => p.profile.id === currentProfileId)?.profile
              .name || currentProfileId}
          </Text>
        </Text>
      </Box>

      {/* Divider */}
      <Text color={LAB_COLORS.dim}>{"─".repeat(Math.min(width - 4, 30))}</Text>

      {/* Profile list */}
      <Box flexDirection="column" marginY={1}>
        {visibleProfiles.length === 0 ? (
          <Text color={LAB_COLORS.dim}>No profiles found</Text>
        ) : (
          visibleProfiles.map((item, i) => {
            const actualIndex = startIndex + i;
            const isSelected = actualIndex === selectedIndex;
            const isCurrent = item.profile.id === currentProfileId;
            const labCount = getLabCount(item.progress);
            const completedCount = getCompletedCount(item.progress);

            return (
              <Box key={item.profile.id} flexDirection="column">
                <Box>
                  {/* Selection indicator */}
                  <Text color={isSelected ? LAB_COLORS.primary : LAB_COLORS.dim}>
                    {isSelected ? "▸ " : "  "}
                  </Text>

                  {/* Checkbox style indicator */}
                  <Text color={isCurrent ? LAB_COLORS.success : LAB_COLORS.dim}>
                    {isCurrent ? "[*] " : "[ ] "}
                  </Text>

                  {/* Profile name */}
                  <Text
                    color={isSelected ? LAB_COLORS.primary : LAB_COLORS.text}
                    bold={isSelected}
                  >
                    {item.profile.name}
                  </Text>

                  {/* Lab count */}
                  <Text color={LAB_COLORS.dim}>
                    {" "}
                    ({completedCount}/{labCount} labs)
                  </Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {/* Scroll indicator */}
      {profiles.length > visibleItems && (
        <Box>
          <Text color={LAB_COLORS.dim}>
            {startIndex > 0 ? "▲ " : "  "}
            [{selectedIndex + 1}/{profiles.length}]
            {endIndex < profiles.length ? " ▼" : "  "}
          </Text>
        </Box>
      )}

      {/* Divider */}
      <Text color={LAB_COLORS.dim}>{"─".repeat(Math.min(width - 4, 30))}</Text>

      {/* Actions hint */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={LAB_COLORS.dim}>
          <Text color={LAB_COLORS.secondary}>[v]</Text>iew{" "}
          <Text color={LAB_COLORS.secondary}>[n]</Text>ew{" "}
          <Text color={LAB_COLORS.secondary}>[d]</Text>el{" "}
          <Text color={LAB_COLORS.secondary}>[r]</Text>eset
        </Text>
      </Box>
    </Box>
  );
}

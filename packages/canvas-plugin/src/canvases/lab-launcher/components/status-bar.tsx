// Status Bar Component - Bottom help text and status

import React from "react";
import { Box, Text } from "ink";
import { LAB_COLORS, type FocusMode, type LauncherMode } from "../types";

interface Props {
  isLoading: boolean;
  isLaunching?: boolean;
  labCount: number;
  width: number;
  showProfilePanel?: boolean;
  focusMode?: FocusMode;
  launcherMode?: LauncherMode;
}

export function StatusBar({
  isLoading,
  isLaunching,
  labCount,
  width,
  showProfilePanel = false,
  focusMode = "list",
  launcherMode = "user",
}: Props) {
  const border = "─".repeat(width - 2);

  // Build help text based on current state and mode
  let helpText: string;
  let statusText: string = "";

  if (isLaunching) {
    helpText = "Launching lab...";
    statusText = "Please wait";
  } else if (isLoading) {
    helpText = "Loading labs...";
  } else if (showProfilePanel && focusMode === "profiles") {
    // Profile panel help (same for both modes, but 'd' means different things)
    if (launcherMode === "developer") {
      helpText = "↑/↓ Navigate | Enter Switch | v View | n New | x Del | r Reset | p Close";
    } else {
      helpText = "↑/↓ Navigate | Enter Switch | v View | n New | x Del | r Reset | p Close";
    }
    statusText = "Profile Management";
  } else if (launcherMode === "developer") {
    // Developer mode help
    helpText = "↑/↓ Nav | Enter Edit | n New Lab | u User Mode | p Profiles | q Quit";
    statusText = `${labCount} lab${labCount !== 1 ? "s" : ""} | DEV MODE`;
  } else {
    // User mode help
    helpText = "↑/↓ Nav | Enter Launch | d Dev Mode | p Profiles | q Quit";
    statusText = `${labCount} lab${labCount !== 1 ? "s" : ""} available`;
  }

  return (
    <Box flexDirection="column">
      <Text color={launcherMode === "developer" ? LAB_COLORS.warning : LAB_COLORS.secondary}>
        {border}
      </Text>
      <Box justifyContent="space-between" width={width - 2}>
        <Text color={LAB_COLORS.dim}>{helpText}</Text>
        <Text color={launcherMode === "developer" ? LAB_COLORS.warning : LAB_COLORS.success}>
          {statusText}
        </Text>
      </Box>
    </Box>
  );
}

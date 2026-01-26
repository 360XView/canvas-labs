// Lab Launcher Canvas - Browse and launch available labs

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { useIPC } from "../calendar/hooks/use-ipc";
import {
  type LabInfo,
  type LabLauncherConfig,
  type LabLauncherResult,
  type FocusMode,
  type LauncherMode,
  type ProfileWithStats,
  LAB_COLORS,
} from "./types";
import { loadModule, listModules } from "../../lab/module-loader";
import { spawnLabEnvironment, ensureDockerImage } from "../../lab/spawn";
import { spawnLabEditor } from "../../lab/editor";
import { setupMentorWorkspace } from "../../tutor/prompts/mentor-prompt";
import { setupAdminWorkspace } from "../../tutor/prompts/admin-prompt";
import { spawnSync } from "child_process";
import {
  listProfiles,
  getProgress,
  getCurrentProfileId,
  setCurrentProfile,
  createProfile,
  profileExists,
} from "../../tutor/profile-manager";
import { createDefaultProgress } from "../../tutor/defaults";
import { existsSync } from "fs";
import { getProfileDir, getProgressFile } from "../../tutor/defaults";
import { writeFileSync } from "fs";

// Import subcomponents
import { LabList } from "./components/lab-list";
import { LabDetails } from "./components/lab-details";
import { StatusBar } from "./components/status-bar";
import { ProfilePanel } from "./components/profile-panel";

interface Props {
  id: string;
  config?: LabLauncherConfig;
  socketPath?: string;
  scenario?: string;
}

export function LabLauncherCanvas({
  id,
  config: initialConfig,
  socketPath,
  scenario = "browse",
}: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal dimensions
  const [dimensions, setDimensions] = useState({
    width: stdout?.columns || 80,
    height: stdout?.rows || 24,
  });

  // Config (can be updated via IPC)
  const [config, setConfig] = useState<LabLauncherConfig | undefined>(initialConfig);

  // Launcher mode: user (learning) or developer (content creation)
  const [launcherMode, setLauncherMode] = useState<LauncherMode>(
    initialConfig?.mode || "user"
  );

  // Labs state
  const [labs, setLabs] = useState<LabInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Profile panel state
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>("list");
  const [profiles, setProfiles] = useState<ProfileWithStats[]>([]);
  const [profileSelectedIndex, setProfileSelectedIndex] = useState(0);
  const [currentProfileId, setCurrentProfileIdState] = useState(getCurrentProfileId());
  const [promptInput, setPromptInput] = useState<string | null>(null);
  const [promptType, setPromptType] = useState<"create" | "delete" | "reset" | "newlab" | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [viewingProfile, setViewingProfile] = useState(false);

  // IPC connection
  const ipc = useIPC({
    socketPath,
    scenario,
    onClose: () => exit(),
    onUpdate: (newConfig) => {
      setConfig(newConfig as LabLauncherConfig);
    },
  });

  // Load labs from module-loader
  const loadLabs = useCallback(() => {
    setIsLoading(true);
    try {
      // If config has pre-loaded labs, use those
      if (config?.labs && config.labs.length > 0) {
        setLabs(config.labs);
        setIsLoading(false);
        return;
      }

      // Otherwise, load from module-loader
      const moduleList = listModules();
      const labInfos: LabInfo[] = moduleList.map((mod) => {
        try {
          const module = loadModule(mod.id);
          const taskCount = module.steps.filter((s) => s.type === "task").length;
          return {
            id: mod.id,
            title: module.title,
            description: module.description,
            stepCount: module.steps.length,
            taskCount,
          };
        } catch {
          return {
            id: mod.id,
            title: mod.title,
            description: mod.description,
            stepCount: 0,
            taskCount: 0,
          };
        }
      });
      setLabs(labInfos);
    } catch (error) {
      console.error("Failed to load labs:", error);
    }
    setIsLoading(false);
  }, [config?.labs]);

  // Load profiles from profile-manager
  const loadProfiles = useCallback(() => {
    const profileList = listProfiles();
    const profilesWithStats: ProfileWithStats[] = profileList.map((profile) => ({
      profile,
      progress: getProgress(profile.id),
    }));
    setProfiles(profilesWithStats);
    setCurrentProfileIdState(getCurrentProfileId());
  }, []);

  // Load labs on mount and when config changes
  useEffect(() => {
    loadLabs();
  }, [loadLabs]);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Listen for terminal resize
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: stdout?.columns || 80,
        height: stdout?.rows || 24,
      });
    };
    stdout?.on("resize", updateDimensions);
    updateDimensions();
    return () => {
      stdout?.off("resize", updateDimensions);
    };
  }, [stdout]);

  // State for launching
  const [isLaunching, setIsLaunching] = useState(false);

  // Handle lab launch (user mode) or edit (developer mode)
  const handleLabAction = useCallback(async () => {
    const selectedLab = labs[selectedIndex];
    if (!selectedLab || isLaunching) return;

    const action = launcherMode === "developer" ? "edit" : "launch";

    // If we have IPC, send selection and let controller handle it
    if (socketPath) {
      const result: LabLauncherResult = {
        action,
        selectedLab,
        mode: launcherMode,
      };
      ipc.sendSelected(result);
      exit();
      return;
    }

    // No IPC - handle directly
    if (launcherMode === "developer") {
      // Developer mode: spawn lab editor
      setIsLaunching(true);

      try {
        // Exit the canvas first
        exit();

        // Small delay to let canvas cleanup
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Spawn the lab editor
        await spawnLabEditor({ moduleId: selectedLab.id });
      } catch (error) {
        console.error("Failed to open lab editor:", error);
        setIsLaunching(false);
      }
      return;
    }

    // User mode: launch the lab
    setIsLaunching(true);

    try {
      // Ensure Docker image exists
      const imageReady = await ensureDockerImage("canvas-lab:latest", true);
      if (!imageReady) {
        console.error("Failed to build Docker image");
        setIsLaunching(false);
        return;
      }

      // Exit the canvas first, then spawn lab
      exit();

      // Small delay to let canvas cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Spawn the lab environment
      await spawnLabEnvironment({
        moduleId: selectedLab.id,
      });
    } catch (error) {
      console.error("Failed to launch lab:", error);
      setIsLaunching(false);
    }
  }, [labs, selectedIndex, ipc, exit, socketPath, isLaunching, launcherMode]);

  // Handle new lab creation (developer mode only)
  const handleNewLab = useCallback(() => {
    if (launcherMode !== "developer") return;

    if (socketPath) {
      const result: LabLauncherResult = {
        action: "new",
        mode: launcherMode,
      };
      ipc.sendSelected(result);
      exit();
      return;
    }

    // No IPC - prompt for module ID
    setPromptType("newlab");
    setPromptInput("Enter new lab ID:");
    setInputValue("");
  }, [launcherMode, socketPath, ipc, exit]);

  // Handle new lab creation with module ID
  const handleNewLabCreate = useCallback(async (moduleId: string) => {
    if (!moduleId.trim()) {
      setPromptType(null);
      setPromptInput(null);
      setInputValue("");
      return;
    }

    // Convert to valid module ID (lowercase, hyphens)
    const cleanModuleId = moduleId.toLowerCase().replace(/[^a-z0-9]/g, "-");

    setPromptType(null);
    setPromptInput(null);
    setInputValue("");

    // Exit canvas and spawn lab editor
    exit();

    // Small delay to let canvas cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      await spawnLabEditor({ moduleId: cleanModuleId, isNew: true });
    } catch (error) {
      console.error("Failed to create new lab:", error);
    }
  }, [exit]);

  // Restart Claude Code pane with appropriate workspace for new mode
  const restartClaudeCodePane = useCallback((newMode: LauncherMode) => {
    const inTmux = !!process.env.TMUX;
    if (!inTmux) return;

    // Set up the appropriate workspace
    const workspaceDir = newMode === "developer"
      ? setupAdminWorkspace()
      : setupMentorWorkspace();

    // Kill the right pane (Claude Code) and recreate with new workspace
    // The launcher is in pane 0, Claude Code is in pane 1
    spawnSync("tmux", [
      "kill-pane",
      "-t", ":.1",  // Target pane 1 in current window
    ], { stdio: "pipe" });

    // Create new pane with the appropriate workspace
    spawnSync("tmux", [
      "split-window",
      "-h",
      "-p", "40",
      "-c", workspaceDir,
      "claude",
    ], { stdio: "pipe" });

    // Focus back to the launcher pane (left)
    spawnSync("tmux", [
      "select-pane",
      "-L",
    ], { stdio: "pipe" });
  }, []);

  // Handle profile selection/switch
  const handleProfileSwitch = useCallback(() => {
    const selectedProfile = profiles[profileSelectedIndex];
    if (!selectedProfile) return;

    setCurrentProfile(selectedProfile.profile.id);
    setCurrentProfileIdState(selectedProfile.profile.id);
  }, [profiles, profileSelectedIndex]);

  // Handle profile creation
  const handleProfileCreate = useCallback((name: string) => {
    if (!name.trim()) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    if (profileExists(id)) {
      // Profile already exists
      return;
    }

    createProfile(id, name);
    loadProfiles();
    setPromptType(null);
    setPromptInput(null);
    setInputValue("");
  }, [loadProfiles]);

  // Handle profile deletion
  const handleProfileDelete = useCallback(() => {
    const selectedProfile = profiles[profileSelectedIndex];
    if (!selectedProfile) return;

    // Don't delete current profile
    if (selectedProfile.profile.id === currentProfileId) {
      return;
    }

    // Delete the profile directory
    const profileDir = getProfileDir(selectedProfile.profile.id);
    if (existsSync(profileDir)) {
      try {
        // Remove directory recursively
        const { rmSync } = require("fs");
        rmSync(profileDir, { recursive: true });
      } catch {
        // Fallback for older Node versions
      }
    }

    loadProfiles();
    setProfileSelectedIndex((i) => Math.max(0, i - 1));
    setPromptType(null);
    setPromptInput(null);
  }, [profiles, profileSelectedIndex, currentProfileId, loadProfiles]);

  // Handle profile reset
  const handleProfileReset = useCallback(() => {
    const selectedProfile = profiles[profileSelectedIndex];
    if (!selectedProfile) return;

    // Reset progress for this profile
    const newProgress = createDefaultProgress(selectedProfile.profile.id);
    writeFileSync(
      getProgressFile(selectedProfile.profile.id),
      JSON.stringify(newProgress, null, 2)
    );

    loadProfiles();
    setPromptType(null);
    setPromptInput(null);
  }, [profiles, profileSelectedIndex, loadProfiles]);

  // Keyboard controls
  useInput((input, key) => {
    // Handle prompt input mode (profile create or new lab)
    if (promptType === "create" || promptType === "newlab") {
      if (key.escape) {
        setPromptType(null);
        setPromptInput(null);
        setInputValue("");
        return;
      }
      if (key.return) {
        if (promptType === "create") {
          handleProfileCreate(inputValue);
        } else {
          handleNewLabCreate(inputValue);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setInputValue((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setInputValue((v) => v + input);
        return;
      }
      return;
    }

    // Handle confirmation prompts
    if (promptType === "delete" || promptType === "reset") {
      if (input === "y" || input === "Y") {
        if (promptType === "delete") {
          handleProfileDelete();
        } else {
          handleProfileReset();
        }
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setPromptType(null);
        setPromptInput(null);
        return;
      }
      return;
    }

    // Cancel/quit
    if (input === "q" || key.escape) {
      if (showProfilePanel) {
        setShowProfilePanel(false);
        setFocusMode("list");
        return;
      }
      ipc.sendCancelled("User cancelled");
      exit();
      return;
    }

    // Toggle profile panel
    if (input === "p") {
      setShowProfilePanel((show) => !show);
      setFocusMode((mode) => (mode === "profiles" ? "list" : "profiles"));
      loadProfiles();
      return;
    }

    // Toggle developer mode (d) / user mode (u)
    if (input === "d" && launcherMode === "user") {
      setLauncherMode("developer");
      restartClaudeCodePane("developer");
      return;
    }
    if (input === "u" && launcherMode === "developer") {
      setLauncherMode("user");
      restartClaudeCodePane("user");
      return;
    }

    // New lab (developer mode only)
    if (input === "n" && launcherMode === "developer" && !showProfilePanel) {
      handleNewLab();
      return;
    }

    // Profile panel specific controls
    if (showProfilePanel && focusMode === "profiles") {
      // Navigation within profile list
      if (key.upArrow) {
        setProfileSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setProfileSelectedIndex((i) => Math.min(profiles.length - 1, i + 1));
        return;
      }

      // Switch profile
      if (key.return) {
        handleProfileSwitch();
        return;
      }

      // Create new profile
      if (input === "n") {
        setPromptType("create");
        setPromptInput("Enter profile name:");
        setInputValue("");
        return;
      }

      // Delete profile (using 'x' to avoid conflict with dev mode toggle)
      if (input === "x") {
        const selectedProfile = profiles[profileSelectedIndex];
        if (selectedProfile && selectedProfile.profile.id !== currentProfileId) {
          setPromptType("delete");
          setPromptInput(`Delete profile "${selectedProfile.profile.name}"? (y/n)`);
        }
        return;
      }

      // Reset profile progress
      if (input === "r") {
        const selectedProfile = profiles[profileSelectedIndex];
        if (selectedProfile) {
          setPromptType("reset");
          setPromptInput(`Reset progress for "${selectedProfile.profile.name}"? (y/n)`);
        }
        return;
      }

      // View profile details
      if (input === "v") {
        setViewingProfile((v) => !v);
        return;
      }

      return;
    }

    // Lab list controls (when profile panel is closed or not focused)
    // Refresh
    if (input === "r" && !showProfilePanel) {
      loadLabs();
      return;
    }

    // Navigation
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(labs.length - 1, i + 1));
    }

    // Launch (user mode) or Edit (developer mode)
    if (key.return) {
      handleLabAction();
    }
  });

  // Layout calculations
  const termWidth = dimensions.width;
  const termHeight = dimensions.height;
  const headerHeight = 3;
  const statusBarHeight = 2;
  const promptBarHeight = promptType ? 2 : 0;
  const contentHeight = termHeight - headerHeight - statusBarHeight - promptBarHeight;

  // Left panel (lab list) takes ~30% width
  const leftPanelWidth = Math.max(24, Math.floor(termWidth * 0.30));
  // Middle panel (details or profile) takes ~30% width
  const middlePanelWidth = Math.max(28, Math.floor(termWidth * 0.30));
  // Right panel (legacy) takes the rest - but we'll use this for details when profile panel is closed
  const rightPanelWidth = termWidth - leftPanelWidth - 4;

  const selectedLab = labs[selectedIndex];

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* Header */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        borderStyle="double"
        borderColor={launcherMode === "developer" ? LAB_COLORS.warning : LAB_COLORS.secondary}
        paddingX={1}
      >
        <Box>
          <Text color={launcherMode === "developer" ? LAB_COLORS.warning : LAB_COLORS.secondary} bold>
            {config?.title || "LAB LAUNCHER"}
          </Text>
          {launcherMode === "developer" && (
            <Text color={LAB_COLORS.warning} bold>
              {" [DEV]"}
            </Text>
          )}
        </Box>
        <Box>
          <Text color={launcherMode === "developer" ? LAB_COLORS.success : LAB_COLORS.dim}>
            {launcherMode === "developer" ? "[u] User" : "[d] Dev"}
          </Text>
          <Text dimColor>{" │ "}</Text>
          <Text color={showProfilePanel ? LAB_COLORS.success : LAB_COLORS.dim}>
            [p] Profiles
          </Text>
        </Box>
      </Box>

      {/* Main content area */}
      <Box flexDirection="row" height={contentHeight}>
        {/* Left panel - Lab List */}
        <Box
          flexDirection="column"
          width={leftPanelWidth}
          borderStyle="single"
          borderColor={focusMode === "list" ? LAB_COLORS.primary : LAB_COLORS.dim}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text color={LAB_COLORS.secondary} bold>
              {"[ LABS ]"}
            </Text>
          </Box>
          {isLoading ? (
            <Text color={LAB_COLORS.dim}>Loading...</Text>
          ) : (
            <LabList
              labs={labs}
              selectedIndex={selectedIndex}
              focused={focusMode === "list"}
              maxHeight={contentHeight - 4}
            />
          )}
        </Box>

        {/* Middle panel - Lab Details OR Profile Panel */}
        <Box
          flexDirection="column"
          width={showProfilePanel ? middlePanelWidth : rightPanelWidth}
          borderStyle="single"
          borderColor={showProfilePanel && focusMode === "profiles" ? LAB_COLORS.primary : LAB_COLORS.dim}
          paddingX={1}
        >
          {showProfilePanel ? (
            <ProfilePanel
              profiles={profiles}
              currentProfileId={currentProfileId}
              selectedIndex={profileSelectedIndex}
              width={middlePanelWidth - 2}
              height={contentHeight - 2}
              viewing={viewingProfile}
            />
          ) : (
            <>
              <Box marginBottom={1}>
                <Text color={LAB_COLORS.secondary} bold>
                  {"[ LAB DETAILS ]"}
                </Text>
              </Box>
              <LabDetails lab={selectedLab} width={rightPanelWidth - 2} />
            </>
          )}
        </Box>

        {/* Right panel - Lab Details when profile panel is open */}
        {showProfilePanel && (
          <Box
            flexDirection="column"
            width={termWidth - leftPanelWidth - middlePanelWidth - 6}
            borderStyle="single"
            borderColor={LAB_COLORS.dim}
            paddingX={1}
          >
            <Box marginBottom={1}>
              <Text color={LAB_COLORS.secondary} bold>
                {"[ LAB DETAILS ]"}
              </Text>
            </Box>
            <LabDetails
              lab={selectedLab}
              width={termWidth - leftPanelWidth - middlePanelWidth - 8}
            />
          </Box>
        )}
      </Box>

      {/* Prompt Bar (for input/confirmations) */}
      {promptType && (
        <Box
          borderStyle="single"
          borderColor={LAB_COLORS.warning}
          paddingX={1}
        >
          <Text color={LAB_COLORS.warning}>{promptInput} </Text>
          {(promptType === "create" || promptType === "newlab") && (
            <Text color={LAB_COLORS.text}>{inputValue}<Text color={LAB_COLORS.primary}>_</Text></Text>
          )}
        </Box>
      )}

      {/* Status Bar */}
      <StatusBar
        isLoading={isLoading}
        isLaunching={isLaunching}
        labCount={labs.length}
        width={termWidth}
        showProfilePanel={showProfilePanel}
        focusMode={focusMode}
        launcherMode={launcherMode}
      />
    </Box>
  );
}

// Re-export types
export type { LabInfo, LabLauncherConfig, LabLauncherResult } from "./types";

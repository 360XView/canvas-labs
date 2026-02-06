// Ops Monitor Canvas - Shell component
// Tab switching, keyboard dispatch, layout orchestration

import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import type { OpsConfig, TabId, Column } from "./types";
import { OPS_COLORS, TABS } from "./types";
import { useOpsData } from "./hooks/use-ops-data";
import { TabBar } from "./components/tab-bar";
import { SummaryBar } from "./components/summary-bar";
import { OperationsTab, buildInboxRows } from "./components/operations-tab";
import { GitStatusTab } from "./components/git-status-tab";
import { IdeasTab } from "./components/ideas-tab";
import { ActionsTab } from "./components/actions-tab";
import { SessionsTab } from "./components/sessions-tab";
import { DetailView } from "./components/detail-view";
import { AgentsTab } from "./components/agents-tab";

interface Props {
  id: string;
  config?: OpsConfig;
  socketPath?: string;
  scenario?: string;
}

export function OpsCanvas({ id, config, socketPath, scenario = "monitor" }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Dimensions
  const [dimensions, setDimensions] = useState({
    width: stdout?.columns || 80,
    height: stdout?.rows || 24,
  });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: stdout?.columns || 80,
        height: stdout?.rows || 24,
      });
    };
    stdout?.on("resize", updateDimensions);
    updateDimensions();
    return () => { stdout?.off("resize", updateDimensions); };
  }, [stdout]);

  // Data
  const data = useOpsData(config);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("operations");
  const [selections, setSelections] = useState<Record<TabId, number>>({
    operations: 0,
    git: 0,
    ideas: 0,
    actions: 0,
    sessions: 0,
    agents: 0,
  });
  const [expanded, setExpanded] = useState(false);
  const [activeCol, setActiveCol] = useState<Column>("inbox");
  const [inboxIdx, setInboxIdx] = useState(0);
  const [ticketIdx, setTicketIdx] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Helpers for selection bounds
  const { flatMessages } = buildInboxRows(data.inboxData);

  function getMaxIndex(tab: TabId): number {
    switch (tab) {
      case "git":
        return Math.max(0, data.gitStatuses.length - 1);
      case "ideas":
        return Math.max(0, data.ideas.length - 1);
      case "actions":
        return Math.max(0, data.actions.length - 1);
      case "sessions":
        return Math.max(0, data.tmuxSessions.length - 1);
      case "agents":
        return Math.max(0, data.reviewStatus.agentActivity.length - 1);
      default:
        return 0;
    }
  }

  function updateSelection(tab: TabId, delta: number) {
    if (tab === "operations") {
      // Operations tab uses separate inbox/ticket indices
      if (activeCol === "inbox") {
        setInboxIdx((i) => Math.max(0, Math.min(flatMessages.length - 1, i + delta)));
      } else {
        setTicketIdx((i) => Math.max(0, Math.min(data.ticketData.length - 1, i + delta)));
      }
      return;
    }
    setSelections((prev) => {
      const maxIdx = getMaxIndex(tab);
      const next = Math.max(0, Math.min(maxIdx, prev[tab] + delta));
      return { ...prev, [tab]: next };
    });
  }

  // Keyboard
  useInput((input, key) => {
    // Close expanded view or exit
    if (input === "q" || key.escape) {
      if (expanded) {
        setExpanded(false);
        return;
      }
      exit();
      return;
    }

    // Refresh
    if (input === "r") {
      data.refresh();
      return;
    }

    // Launch PM triage — tries tmux, iTerm2, Terminal.app in order
    if (input === "t" && !expanded) {
      const teamPath = getTeamPathFromConfig(config);
      const pmDir = join(teamPath, "pm");

      try {
        if (process.env.TMUX) {
          // Option 1: tmux — new window in current session
          execSync(
            `tmux new-window -n "pm-triage" -c "${pmDir}" 'claude "/ops-triage"'`,
            { timeout: 5000 }
          );
          setStatusMsg("PM triage launched (tmux window)");
        } else if (process.env.ITERM_SESSION_ID || process.env.TERM_PROGRAM === "iTerm.app") {
          // Option 2: iTerm2 — new tab via AppleScript
          execSync([
            "osascript",
            "-e", `'tell application "iTerm2" to tell current window'`,
            "-e", `'create tab with default profile'`,
            "-e", `'tell current session to write text "cd ${pmDir} && claude \\"/ops-triage\\""'`,
            "-e", `'end tell'`,
          ].join(" "), { timeout: 5000 });
          setStatusMsg("PM triage launched (iTerm2 tab)");
        } else {
          // Option 3: Terminal.app — new window via AppleScript
          execSync(
            `osascript -e 'tell application "Terminal" to do script "cd ${pmDir} && claude \\"/ops-triage\\""'`,
            { timeout: 5000 }
          );
          setStatusMsg("PM triage launched (Terminal window)");
        }
      } catch {
        setStatusMsg("Failed to launch PM triage");
      }
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    // Tab switching by number
    const tabByKey = TABS.find((t) => t.key === input);
    if (tabByKey && !expanded) {
      setActiveTab(tabByKey.id);
      setExpanded(false);
      return;
    }

    // Tab cycling
    if (key.tab && !expanded) {
      const currentIdx = TABS.findIndex((t) => t.id === activeTab);
      if (activeTab === "operations") {
        // Within operations tab, Tab switches columns first
        if (activeCol === "inbox") {
          setActiveCol("tickets");
          return;
        }
        // If already on tickets column, cycle to next tab
        setActiveCol("inbox");
      }
      const nextIdx = (currentIdx + 1) % TABS.length;
      setActiveTab(TABS[nextIdx].id);
      return;
    }

    // Navigation
    if (key.upArrow) {
      updateSelection(activeTab, -1);
      return;
    }
    if (key.downArrow) {
      updateSelection(activeTab, 1);
      return;
    }

    // Left/Right for operations tab column switching
    if (activeTab === "operations" && !expanded) {
      if (key.leftArrow) {
        setActiveCol("inbox");
        return;
      }
      if (key.rightArrow) {
        setActiveCol("tickets");
        return;
      }
    }

    // Enter: toggle expanded
    if (key.return) {
      setExpanded((e) => !e);
      return;
    }
  });

  const termWidth = dimensions.width;
  const termHeight = dimensions.height;
  const innerWidth = termWidth - 2; // paddingX={1}

  // ── Expanded view ─────────────────────────────────────────────────

  if (expanded) {
    const detail = getDetailForTab(activeTab, selections, activeCol, inboxIdx, ticketIdx, data, config);
    if (!detail) {
      setExpanded(false);
      return null;
    }
    return (
      <DetailView
        title={detail.title}
        category={detail.category}
        content={detail.content}
        termWidth={termWidth}
        termHeight={termHeight}
      />
    );
  }

  // ── Dashboard view ────────────────────────────────────────────────

  const timeStr = data.lastRefresh.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Layout math: header(1) + gap(1) + tabbar(1) + summarybar(1) + content(flex) + footer(1)
  const chromeRows = 5;
  const contentRows = Math.max(1, termHeight - chromeRows);

  // Footer context
  const footerText = getFooterText(activeTab, selections, activeCol, inboxIdx, ticketIdx, data);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color={OPS_COLORS.header}>
          {config?.title || "OPS MONITOR"}
        </Text>
        <Text color={OPS_COLORS.dim}>
          {timeStr} {"\u2022"} 1-6 tabs {"\u2022"} {"\u2191\u2193"} nav {"\u2022"} Enter expand {"\u2022"} t triage {"\u2022"} r refresh {"\u2022"} q quit
        </Text>
      </Box>

      {/* Tab bar + Summary bar */}
      <Box justifyContent="space-between">
        <TabBar activeTab={activeTab} />
        <SummaryBar counts={data.counts} reviewStatus={data.reviewStatus} />
      </Box>

      {/* Active tab content */}
      <Box flexGrow={1} flexDirection="column">
        {activeTab === "operations" && (
          <OperationsTab
            inboxData={data.inboxData}
            ticketData={data.ticketData}
            activeCol={activeCol}
            inboxIdx={inboxIdx}
            ticketIdx={ticketIdx}
            innerWidth={innerWidth}
            contentRows={contentRows}
          />
        )}
        {activeTab === "git" && (
          <GitStatusTab
            statuses={data.gitStatuses}
            selectedIdx={selections.git}
            expanded={false}
            innerWidth={innerWidth}
          />
        )}
        {activeTab === "ideas" && (
          <IdeasTab
            ideas={data.ideas}
            selectedIdx={selections.ideas}
            innerWidth={innerWidth}
            contentRows={contentRows}
          />
        )}
        {activeTab === "actions" && (
          <ActionsTab
            actions={data.actions}
            selectedIdx={selections.actions}
            innerWidth={innerWidth}
            contentRows={contentRows}
          />
        )}
        {activeTab === "sessions" && (
          <SessionsTab
            sessions={data.tmuxSessions}
            selectedIdx={selections.sessions}
            expanded={false}
            innerWidth={innerWidth}
            contentRows={contentRows}
          />
        )}
        {activeTab === "agents" && (
          <AgentsTab
            reviewStatus={data.reviewStatus}
            selectedIdx={selections.agents}
            innerWidth={innerWidth}
            contentRows={contentRows}
          />
        )}
      </Box>

      {/* Footer */}
      <Box>
        {statusMsg ? (
          <Text color={OPS_COLORS.warning}>{statusMsg}</Text>
        ) : (
          <Text color={OPS_COLORS.dim}>{footerText}</Text>
        )}
      </Box>
    </Box>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function getDetailForTab(
  tab: TabId,
  selections: Record<TabId, number>,
  activeCol: Column,
  inboxIdx: number,
  ticketIdx: number,
  data: ReturnType<typeof useOpsData>,
  config?: OpsConfig,
): { title: string; category: string; content: string } | null {
  const { flatMessages } = buildInboxRows(data.inboxData);

  switch (tab) {
    case "operations": {
      if (activeCol === "inbox") {
        const msg = flatMessages[inboxIdx];
        if (!msg) return null;
        const teamPath = getTeamPathFromConfig(config);
        const inboxPath = config?.inboxPath || join(teamPath, "shared/messages/inbox");
        let content: string;
        try {
          const filePath = join(inboxPath, msg.agent, msg.filename);
          const raw = readFileSync(filePath, "utf-8");
          const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)/);
          content = bodyMatch ? bodyMatch[1].trim() : raw;
        } catch {
          content = "(Could not read message)";
        }
        return {
          title: `${msg.from} \u2192 ${msg.agent}: ${msg.topic}`,
          category: "MESSAGE",
          content,
        };
      } else {
        const ticket = data.ticketData[ticketIdx];
        if (!ticket) return null;
        return {
          title: `${ticket.id}: ${ticket.title}`,
          category: "TICKET",
          content: ticket.body || "(No description)",
        };
      }
    }
    case "git": {
      const repo = data.gitStatuses[selections.git];
      if (!repo) return null;
      const lines = [
        `Branch: ${repo.branch}`,
        `Status: ${repo.dirty ? `${repo.dirtyFiles.length} dirty files` : "clean"}`,
        `Remote: ${repo.hasRemote ? `ahead ${repo.ahead}, behind ${repo.behind}` : "no remote"}`,
        `Last commit: ${repo.lastCommit} (${repo.lastCommitAge})`,
        "",
      ];
      if (repo.dirty) {
        lines.push("Dirty files:", ...repo.dirtyFiles.map((f) => `  ${f}`));
      }
      return {
        title: repo.name,
        category: "GIT REPO",
        content: lines.join("\n"),
      };
    }
    case "ideas": {
      const idea = data.ideas[selections.ideas];
      if (!idea) return null;
      const header = [
        `Agent: ${idea.agent}`,
        idea.source ? `Source: ${idea.source}` : "",
        idea.captured ? `Captured: ${idea.captured}` : "",
        idea.tags.length ? `Tags: ${idea.tags.join(", ")}` : "",
        `Status: ${idea.status}`,
        "",
      ].filter(Boolean).join("\n");
      return {
        title: idea.title,
        category: "IDEA",
        content: header + idea.body,
      };
    }
    case "actions": {
      const action = data.actions[selections.actions];
      if (!action) return null;
      const header = [
        `Agent: ${action.agent}`,
        `Status: ${action.status}`,
        `Priority: ${action.priority}`,
        action.source ? `Source: ${action.source}` : "",
        action.created ? `Created: ${action.created}` : "",
        "",
      ].filter(Boolean).join("\n");
      return {
        title: action.title,
        category: "ACTION",
        content: header + action.body,
      };
    }
    case "sessions": {
      const session = data.tmuxSessions[selections.sessions];
      if (!session) return null;
      const lines = [
        `Windows: ${session.windows}`,
        `Attached: ${session.attached ? "yes" : "no"}`,
        "",
        "Panes:",
        ...session.panes.map(
          (p) => `  ${p.windowName}:${p.paneIndex}  ${p.currentCommand}  ${p.currentPath}`
        ),
      ];
      return {
        title: session.name,
        category: "TMUX SESSION",
        content: lines.join("\n"),
      };
    }
    default:
      return null;
  }
}

function getFooterText(
  tab: TabId,
  selections: Record<TabId, number>,
  activeCol: Column,
  inboxIdx: number,
  ticketIdx: number,
  data: ReturnType<typeof useOpsData>,
): string {
  const { flatMessages } = buildInboxRows(data.inboxData);

  switch (tab) {
    case "operations":
      if (activeCol === "inbox" && flatMessages.length > 0) {
        const msg = flatMessages[inboxIdx];
        return msg ? `\u2192 ${msg.agent} inbox \u2022 from ${msg.from}` : "";
      }
      if (activeCol === "tickets" && data.ticketData.length > 0) {
        const ticket = data.ticketData[ticketIdx];
        return ticket ? `\u2192 ${ticket.assigned || "unassigned"}` : "";
      }
      return "";
    case "git": {
      const repo = data.gitStatuses[selections.git];
      return repo ? `\u2192 ${repo.name} \u2022 ${repo.branch}` : "";
    }
    case "ideas": {
      const idea = data.ideas[selections.ideas];
      return idea ? `\u2192 ${idea.agent} \u2022 ${idea.status}${idea.tags.length ? " \u2022 " + idea.tags.join(", ") : ""}` : "";
    }
    case "actions": {
      const action = data.actions[selections.actions];
      return action ? `\u2192 ${action.agent} \u2022 ${action.status} \u2022 ${action.priority}` : "";
    }
    case "sessions": {
      const session = data.tmuxSessions[selections.sessions];
      return session ? `\u2192 ${session.name} \u2022 ${session.windows} windows${session.attached ? " \u2022 attached" : ""}` : "";
    }
    case "agents": {
      const act = data.reviewStatus.agentActivity[selections.agents];
      if (!act) return "";
      const parts = [`\u2192 ${act.agent}`];
      if (act.dirtyFiles > 0) parts.push(`${act.dirtyFiles} dirty`);
      if (act.unpushedCommits > 0) parts.push(`${act.unpushedCommits} unpushed`);
      if (act.hasMemory) parts.push(`mem: ${act.memoryEntries}`);
      return parts.join(" \u2022 ");
    }
    default:
      return "";
  }
}

function getTeamPathFromConfig(config?: OpsConfig): string {
  const fromCwd = resolve(process.cwd(), "../../..", "canvas-team");
  if (existsSync(fromCwd)) return fromCwd;
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    return resolve(thisDir, "../../../../../..", "canvas-team");
  } catch {
    return fromCwd;
  }
}

export type { OpsConfig } from "./types";

// Ops Monitor - Data loading hook
// Loads all tab data (inbox, tickets, git, ideas, actions, tmux) and auto-refreshes

import { useState, useEffect, useCallback } from "react";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import type {
  OpsConfig,
  InboxMessage,
  InboxAgentSummary,
  TicketInfo,
  RepoGitStatus,
  IdeaItem,
  ActionItem,
  TmuxSession,
  TmuxPane,
  SummaryCounts,
} from "../types";
import { DEFAULT_AGENTS } from "../types";

// ── Path resolution ──────────────────────────────────────────────────

function getDefaultTeamPath(): string {
  const fromCwd = resolve(process.cwd(), "../../..", "canvas-team");
  if (existsSync(fromCwd)) return fromCwd;
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    return resolve(thisDir, "../../../../../../..", "canvas-team");
  } catch {
    return fromCwd;
  }
}

// ── Frontmatter parsing ─────────────────────────────────────────────

function extractYamlField(yaml: string, field: string): string | undefined {
  const match = yaml.match(new RegExp(`^${field}:\\s*"?([^"\\n]*)"?`, "m"));
  return match ? match[1].trim() : undefined;
}

function extractYamlList(yaml: string, field: string): string[] {
  const match = yaml.match(new RegExp(`^${field}:\\s*\\[([^\\]]*)]`, "m"));
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
}

function parseFrontmatter(content: string): { frontmatter: string; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!match) return null;
  return { frontmatter: match[1], body: match[2].trim() };
}

// ── Inbox loading ───────────────────────────────────────────────────

function readInbox(inboxPath: string, agents: string[]): InboxAgentSummary[] {
  return agents.map((agent) => {
    const agentDir = join(inboxPath, agent);
    if (!existsSync(agentDir)) {
      return { agent, count: 0, messages: [] };
    }
    try {
      const files = readdirSync(agentDir).filter(
        (f) => f.endsWith(".md") && f !== "_archive"
      );
      const messages: InboxMessage[] = files.map((f) => {
        try {
          const content = readFileSync(join(agentDir, f), "utf-8");
          const parsed = parseFrontmatter(content);
          if (!parsed) return { agent, filename: f, from: "?", topic: f, type: "?", timestamp: "" };
          const fm = parsed.frontmatter;
          return {
            agent,
            filename: f,
            from: extractYamlField(fm, "from") || "?",
            topic: extractYamlField(fm, "topic") || f.replace(".md", ""),
            type: extractYamlField(fm, "type") || "?",
            timestamp: extractYamlField(fm, "timestamp") || "",
            ticketId: extractYamlField(fm, "ticket_id"),
          };
        } catch {
          return { agent, filename: f, from: "?", topic: f, type: "?", timestamp: "" };
        }
      });
      messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return { agent, count: files.length, messages };
    } catch {
      return { agent, count: 0, messages: [] };
    }
  });
}

// ── Ticket loading ──────────────────────────────────────────────────

function readTickets(ticketsPath: string): TicketInfo[] {
  if (!existsSync(ticketsPath)) return [];
  try {
    const files = readdirSync(ticketsPath).filter((f) => f.endsWith(".md"));
    const tickets: TicketInfo[] = [];
    for (const file of files) {
      try {
        const content = readFileSync(join(ticketsPath, file), "utf-8");
        const parsed = parseFrontmatter(content);
        if (!parsed) continue;
        const status = extractYamlField(parsed.frontmatter, "status") || "unknown";
        if (status !== "open") continue;
        const id = extractYamlField(parsed.frontmatter, "id") || file.replace(".md", "");
        const title = extractYamlField(parsed.frontmatter, "title") || id;
        const assigned = extractYamlField(parsed.frontmatter, "assigned");
        tickets.push({ id, title, status, assigned, body: parsed.body });
      } catch { /* skip */ }
    }
    tickets.sort((a, b) => a.id.localeCompare(b.id));
    return tickets;
  } catch {
    return [];
  }
}

// ── Git status loading ──────────────────────────────────────────────

function readGitStatus(repoName: string, repoPath: string): RepoGitStatus {
  const result: RepoGitStatus = {
    name: repoName,
    path: repoPath,
    branch: "unknown",
    dirty: false,
    dirtyFiles: [],
    ahead: 0,
    behind: 0,
    hasRemote: false,
    lastCommit: "",
    lastCommitAge: "",
  };

  if (!existsSync(repoPath)) return result;

  try {
    result.branch = execSync(`git -C "${repoPath}" branch --show-current`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch { /* keep default */ }

  try {
    const porcelain = execSync(`git -C "${repoPath}" status --porcelain`, {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    result.dirtyFiles = porcelain ? porcelain.split("\n").filter(Boolean) : [];
    result.dirty = result.dirtyFiles.length > 0;
  } catch { /* keep default */ }

  try {
    const revList = execSync(
      `git -C "${repoPath}" rev-list --left-right --count HEAD...@{upstream}`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    const parts = revList.split(/\s+/);
    result.ahead = parseInt(parts[0] || "0", 10);
    result.behind = parseInt(parts[1] || "0", 10);
    result.hasRemote = true;
  } catch {
    result.hasRemote = false;
  }

  try {
    const logLine = execSync(
      `git -C "${repoPath}" log -1 --format="%s (%cr)"`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    // Split on the last occurrence of " (" to separate message from age
    const ageMatch = logLine.match(/^(.*)\s+\(([^)]+)\)$/);
    if (ageMatch) {
      result.lastCommit = ageMatch[1];
      result.lastCommitAge = ageMatch[2];
    } else {
      result.lastCommit = logLine;
      result.lastCommitAge = "";
    }
  } catch { /* keep default */ }

  return result;
}

function readAllGitStatuses(teamPath: string): RepoGitStatus[] {
  const labsPath = resolve(teamPath, "..", "canvas-labs");
  return [
    readGitStatus("canvas-labs", labsPath),
    readGitStatus("canvas-team", teamPath),
  ];
}

// ── Tmux loading ────────────────────────────────────────────────────

function readTmuxSessions(): TmuxSession[] {
  let sessionsRaw: string;
  try {
    sessionsRaw = execSync(
      'tmux list-sessions -F "#{session_name}:#{session_windows}:#{session_attached}"',
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
  } catch {
    return [];
  }

  if (!sessionsRaw) return [];

  let panesRaw = "";
  try {
    panesRaw = execSync(
      'tmux list-panes -a -F "#{session_name}:#{window_index}:#{window_name}:#{pane_index}:#{pane_current_command}:#{pane_current_path}"',
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
  } catch { /* no panes info */ }

  const panes: TmuxPane[] = panesRaw
    ? panesRaw.split("\n").filter(Boolean).map((line) => {
        const parts = line.split(":");
        return {
          sessionName: parts[0] || "",
          windowIndex: parseInt(parts[1] || "0", 10),
          windowName: parts[2] || "",
          paneIndex: parseInt(parts[3] || "0", 10),
          currentCommand: parts[4] || "",
          currentPath: parts.slice(5).join(":") || "", // path may contain colons
        };
      })
    : [];

  return sessionsRaw.split("\n").filter(Boolean).map((line) => {
    const parts = line.split(":");
    const name = parts[0] || "";
    return {
      name,
      windows: parseInt(parts[1] || "0", 10),
      attached: parts[2] === "1",
      panes: panes.filter((p) => p.sessionName === name),
    };
  });
}

// ── Ideas loading ───────────────────────────────────────────────────

function readIdeas(teamPath: string, agents: string[]): IdeaItem[] {
  const ideas: IdeaItem[] = [];
  for (const agent of agents) {
    const ideasDir = join(teamPath, agent, "docs", "ideas");
    if (!existsSync(ideasDir)) continue;
    try {
      const files = readdirSync(ideasDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        try {
          const content = readFileSync(join(ideasDir, file), "utf-8");
          const parsed = parseFrontmatter(content);
          if (!parsed) {
            ideas.push({
              title: file.replace(".md", ""),
              agent,
              source: "",
              captured: "",
              status: "unknown",
              tags: [],
              body: content,
              filename: file,
            });
            continue;
          }
          ideas.push({
            title: extractYamlField(parsed.frontmatter, "title") || file.replace(".md", ""),
            agent,
            source: extractYamlField(parsed.frontmatter, "source") || "",
            captured: extractYamlField(parsed.frontmatter, "captured") || "",
            status: extractYamlField(parsed.frontmatter, "status") || "unknown",
            tags: extractYamlList(parsed.frontmatter, "tags"),
            body: parsed.body,
            filename: file,
          });
        } catch { /* skip */ }
      }
    } catch { /* skip agent */ }
  }
  return ideas;
}

// ── Actions loading ─────────────────────────────────────────────────

function readActions(teamPath: string, agents: string[]): ActionItem[] {
  const actions: ActionItem[] = [];
  for (const agent of agents) {
    const actionsDir = join(teamPath, agent, "docs", "actions");
    if (!existsSync(actionsDir)) continue;
    try {
      const files = readdirSync(actionsDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        try {
          const content = readFileSync(join(actionsDir, file), "utf-8");
          const parsed = parseFrontmatter(content);
          if (!parsed) {
            actions.push({
              title: file.replace(".md", ""),
              agent,
              source: "",
              created: "",
              status: "open",
              priority: "normal",
              body: content,
              filename: file,
            });
            continue;
          }
          actions.push({
            title: extractYamlField(parsed.frontmatter, "title") || file.replace(".md", ""),
            agent,
            source: extractYamlField(parsed.frontmatter, "source") || "",
            created: extractYamlField(parsed.frontmatter, "created") || "",
            status: extractYamlField(parsed.frontmatter, "status") || "open",
            priority: extractYamlField(parsed.frontmatter, "priority") || "normal",
            body: parsed.body,
            filename: file,
          });
        } catch { /* skip */ }
      }
    } catch { /* skip agent */ }
  }
  // Open items first, then by creation date descending
  actions.sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return b.created.localeCompare(a.created);
  });
  return actions;
}

// ── The hook ────────────────────────────────────────────────────────

export interface OpsData {
  inboxData: InboxAgentSummary[];
  ticketData: TicketInfo[];
  gitStatuses: RepoGitStatus[];
  ideas: IdeaItem[];
  actions: ActionItem[];
  tmuxSessions: TmuxSession[];
  counts: SummaryCounts;
  lastRefresh: Date;
  refresh: () => void;
}

export function useOpsData(config?: OpsConfig): OpsData {
  const teamPath = getDefaultTeamPath();
  const inboxPath = config?.inboxPath || join(teamPath, "shared/messages/inbox");
  const ticketsPath = config?.ticketsPath || join(teamPath, "shared/tickets");
  const agents = config?.agents || DEFAULT_AGENTS;

  const [inboxData, setInboxData] = useState<InboxAgentSummary[]>([]);
  const [ticketData, setTicketData] = useState<TicketInfo[]>([]);
  const [gitStatuses, setGitStatuses] = useState<RepoGitStatus[]>([]);
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const refresh = useCallback(() => {
    setInboxData(readInbox(inboxPath, agents));
    setTicketData(readTickets(ticketsPath));
    setGitStatuses(readAllGitStatuses(teamPath));
    setIdeas(readIdeas(teamPath, agents));
    setActions(readActions(teamPath, agents));
    setTmuxSessions(readTmuxSessions());
    setLastRefresh(new Date());
  }, [inboxPath, ticketsPath, agents, teamPath]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Compute counts from loaded data
  const flatMessages = inboxData.flatMap((s) => s.messages);
  const counts: SummaryCounts = {
    inbox: flatMessages.length,
    ticketsOpen: ticketData.length,
    ideas: ideas.length,
    actionsOpen: actions.filter((a) => a.status === "open").length,
    gitClean: gitStatuses.filter((g) => !g.dirty).length,
    gitTotal: gitStatuses.length,
  };

  return {
    inboxData,
    ticketData,
    gitStatuses,
    ideas,
    actions,
    tmuxSessions,
    counts,
    lastRefresh,
    refresh,
  };
}

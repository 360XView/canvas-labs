// Ops Monitor - Pure data loading functions (no React dependency)
// Used by both the TUI canvas (via hook) and the CLI (ops-data command)

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
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
  ReviewStatus,
  AgentActivity,
} from "./types";
import { DEFAULT_AGENTS } from "./types";

// ── Path resolution ──────────────────────────────────────────────────

export function getDefaultTeamPath(): string {
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

export function readInbox(inboxPath: string, agents: string[]): InboxAgentSummary[] {
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

export function readTickets(ticketsPath: string): TicketInfo[] {
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

export function readGitStatus(repoName: string, repoPath: string): RepoGitStatus {
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

export function readAllGitStatuses(teamPath: string): RepoGitStatus[] {
  const labsPath = resolve(teamPath, "..", "canvas-labs");
  return [
    readGitStatus("canvas-labs", labsPath),
    readGitStatus("canvas-team", teamPath),
  ];
}

// ── Tmux loading ────────────────────────────────────────────────────

export function readTmuxSessions(): TmuxSession[] {
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
          currentPath: parts.slice(5).join(":") || "",
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

export function readIdeas(teamPath: string, agents: string[]): IdeaItem[] {
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
          const status = extractYamlField(parsed.frontmatter, "status") || "open";
          if (status === "done" || status === "closed" || status === "superseded") continue;
          ideas.push({
            title: extractYamlField(parsed.frontmatter, "title") || file.replace(".md", ""),
            agent,
            source: extractYamlField(parsed.frontmatter, "source") || "",
            captured: extractYamlField(parsed.frontmatter, "captured") || "",
            status,
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

export function readActions(teamPath: string, agents: string[]): ActionItem[] {
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
  actions.sort((a, b) => {
    if (a.status === "open" && b.status !== "open") return -1;
    if (a.status !== "open" && b.status === "open") return 1;
    return b.created.localeCompare(a.created);
  });
  return actions;
}

// ── Review status loading ───────────────────────────────────────────

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getLatestDateFile(dirPath: string): string {
  if (!existsSync(dirPath)) return "";
  try {
    const files = readdirSync(dirPath)
      .filter((f) => f.endsWith(".md") && /^\d{4}-\d{2}-\d{2}/.test(f))
      .sort()
      .reverse();
    return files.length > 0 ? files[0].replace(".md", "") : "";
  } catch {
    return "";
  }
}

function readAgentActivity(teamPath: string, agent: string, sinceDate: string): AgentActivity {
  const result: AgentActivity = {
    agent,
    commitCount: 0,
    lastCommitMsg: "",
    dirtyFiles: 0,
    unpushedCommits: 0,
    inboxCount: 0,
    sentCount: 0,
    filesChanged: 0,
    memoryEntries: 0,
    memoryTotal: 0,
    memory24h: 0,
    hasMemory: false,
  };

  // Git commits since date in agent's directory
  try {
    const logOutput = execSync(
      `git -C "${teamPath}" log --oneline --since="${sinceDate}" -- "${agent}/"`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    const lines = logOutput ? logOutput.split("\n").filter(Boolean) : [];
    result.commitCount = lines.length;
    if (lines.length > 0) {
      result.lastCommitMsg = lines[0].replace(/^[a-f0-9]+ /, "");
    }
  } catch { /* no commits */ }

  // Dirty files (uncommitted changes in agent dir)
  try {
    const porcelain = execSync(
      `git -C "${teamPath}" status --porcelain -- "${agent}/"`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    result.dirtyFiles = porcelain ? porcelain.split("\n").filter(Boolean).length : 0;
  } catch { /* skip */ }

  // Unpushed commits (ahead of remote in agent dir)
  try {
    const unpushed = execSync(
      `git -C "${teamPath}" log --oneline origin/main..HEAD -- "${agent}/"`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    result.unpushedCommits = unpushed ? unpushed.split("\n").filter(Boolean).length : 0;
  } catch { /* no remote or no unpushed */ }

  // Files changed since date
  try {
    const diffOutput = execSync(
      `git -C "${teamPath}" log --name-only --pretty=format: --since="${sinceDate}" -- "${agent}/"`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    const files = diffOutput ? [...new Set(diffOutput.split("\n").filter(Boolean))] : [];
    result.filesChanged = files.length;
  } catch { /* no changes */ }

  // Messages in inbox (waiting) — skip for "shared"
  if (agent !== "shared") {
    const inboxDir = join(teamPath, "shared", "messages", "inbox", agent);
    if (existsSync(inboxDir)) {
      try {
        result.inboxCount = readdirSync(inboxDir).filter(
          (f) => f.endsWith(".md") && f !== "_archive"
        ).length;
      } catch { /* skip */ }
    }
  }

  // Messages sent since date (scan all inbox dirs for messages from this agent)
  if (agent !== "shared") {
    const inboxRoot = join(teamPath, "shared", "messages", "inbox");
    if (existsSync(inboxRoot)) {
      try {
        const dirs = readdirSync(inboxRoot).filter((d) => d !== agent);
        for (const dir of dirs) {
          const dirPath = join(inboxRoot, dir);
          try {
            const files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
            for (const file of files) {
              try {
                const content = readFileSync(join(dirPath, file), "utf-8");
                const parsed = parseFrontmatter(content);
                if (!parsed) continue;
                const from = extractYamlField(parsed.frontmatter, "from");
                const ts = extractYamlField(parsed.frontmatter, "timestamp") || "";
                if (from === agent && ts >= sinceDate) {
                  result.sentCount++;
                }
              } catch { /* skip */ }
            }
          } catch { /* skip dir */ }
        }
      } catch { /* skip */ }
    }

    // Also check archive for sent messages
    const archiveRoot = join(teamPath, "shared", "messages", "archive");
    if (existsSync(archiveRoot)) {
      try {
        const dirs = readdirSync(archiveRoot);
        for (const dir of dirs) {
          const dirPath = join(archiveRoot, dir);
          try {
            const files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
            for (const file of files) {
              try {
                const content = readFileSync(join(dirPath, file), "utf-8");
                const parsed = parseFrontmatter(content);
                if (!parsed) continue;
                const from = extractYamlField(parsed.frontmatter, "from");
                const ts = extractYamlField(parsed.frontmatter, "timestamp") || "";
                if (from === agent && ts >= sinceDate) {
                  result.sentCount++;
                }
              } catch { /* skip */ }
            }
          } catch { /* skip dir */ }
        }
      } catch { /* skip */ }
    }
  }

  // Memory system check and log entry counts
  const memoryToolsDir = join(teamPath, agent, "tools", "memory");
  result.hasMemory = existsSync(memoryToolsDir);
  if (result.hasMemory) {
    const logsDir = join(teamPath, agent, "memory", "logs");
    if (existsSync(logsDir)) {
      try {
        const entryPattern = /^- \d{2}:\d{2}/;
        const logFiles = readdirSync(logsDir).filter((f) => f.endsWith(".md"));
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        let totalEntries = 0;
        let recentEntries = 0;
        for (const file of logFiles) {
          try {
            const content = readFileSync(join(logsDir, file), "utf-8");
            const entries = content.split("\n").filter((l) => entryPattern.test(l)).length;
            totalEntries += entries;
            const stat = statSync(join(logsDir, file));
            if (now - stat.mtimeMs < oneDayMs) recentEntries += entries;
          } catch { /* skip */ }
        }
        result.memoryTotal = totalEntries;
        result.memory24h = recentEntries;
        result.memoryEntries = recentEntries; // legacy compat
      } catch { /* skip */ }
    }
  }

  return result;
}

export function readReviewStatus(teamPath: string, agents: string[]): ReviewStatus {
  // Last action plan
  const actionPlansDir = join(teamPath, "wpm", "docs", "action-plans");
  const lastActionPlanDate = getLatestDateFile(actionPlansDir);
  const lastActionPlanDaysAgo = lastActionPlanDate ? daysAgo(lastActionPlanDate) : -1;
  const sinceDate = lastActionPlanDate || "1970-01-01";

  // Per-agent reflections
  const agentReflections = agents
    .map((agent) => {
      const reflDir = join(teamPath, agent, "docs", "reflections");
      const lastDate = getLatestDateFile(reflDir);
      return {
        agent,
        lastDate,
        daysAgo: lastDate ? daysAgo(lastDate) : -1,
      };
    })
    .filter((r) => r.lastDate !== ""); // only agents with reflections

  // Per-agent activity since last review (include "shared" as pseudo-agent)
  const allDirs = [...agents, "shared"];
  const agentActivity = allDirs.map((agent) =>
    readAgentActivity(teamPath, agent, sinceDate)
  );

  // Count reflections newer than last action plan
  const newReflectionsSinceLastPlan = lastActionPlanDate
    ? agentReflections.filter((r) => r.lastDate > lastActionPlanDate).length
    : agentReflections.length;

  // Review is due if: >2 days since last plan, or unsynthesized reflections exist
  const reviewDue =
    lastActionPlanDaysAgo === -1 ||
    lastActionPlanDaysAgo > 2 ||
    newReflectionsSinceLastPlan > 0;

  return {
    lastActionPlanDate,
    lastActionPlanDaysAgo,
    agentReflections,
    agentActivity,
    newReflectionsSinceLastPlan,
    reviewDue,
  };
}

// ── Aggregate loader ────────────────────────────────────────────────

export interface OpsSnapshot {
  inboxData: InboxAgentSummary[];
  ticketData: TicketInfo[];
  gitStatuses: RepoGitStatus[];
  ideas: IdeaItem[];
  actions: ActionItem[];
  tmuxSessions: TmuxSession[];
  reviewStatus: ReviewStatus;
  counts: SummaryCounts;
  timestamp: string;
}

export function loadOpsData(config?: OpsConfig): OpsSnapshot {
  const teamPath = getDefaultTeamPath();
  const inboxPath = config?.inboxPath || join(teamPath, "shared/messages/inbox");
  const ticketsPath = config?.ticketsPath || join(teamPath, "shared/tickets");
  const agents = config?.agents || DEFAULT_AGENTS;

  const inboxData = readInbox(inboxPath, agents);
  const ticketData = readTickets(ticketsPath);
  const gitStatuses = readAllGitStatuses(teamPath);
  const ideas = readIdeas(teamPath, agents);
  const actions = readActions(teamPath, agents);
  const tmuxSessions = readTmuxSessions();
  const reviewStatus = readReviewStatus(teamPath, agents);

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
    reviewStatus,
    counts,
    timestamp: new Date().toISOString(),
  };
}

// ── Text formatter ──────────────────────────────────────────────────

export function formatOpsText(data: OpsSnapshot, tab?: string): string {
  const lines: string[] = [];

  const showAll = !tab;
  const showTab = (t: string) => showAll || tab === t;

  // Summary (always shown)
  const rv = data.reviewStatus;
  const reviewStr = rv.lastActionPlanDaysAgo === -1
    ? "Review: NEVER"
    : rv.reviewDue
      ? `Review: ${rv.lastActionPlanDaysAgo}d ago DUE`
      : `Review: ${rv.lastActionPlanDaysAgo}d ago`;
  lines.push(
    `Inbox: ${data.counts.inbox} | Tickets: ${data.counts.ticketsOpen} open | ` +
    `Ideas: ${data.counts.ideas} | Actions: ${data.counts.actionsOpen} open | ` +
    `Git: ${data.counts.gitClean}/${data.counts.gitTotal} clean | ${reviewStr}`
  );
  lines.push("");

  if (showTab("ops") || showTab("inbox")) {
    lines.push("── INBOX ──");
    const withMessages = data.inboxData.filter((a) => a.count > 0);
    if (withMessages.length === 0) {
      lines.push("  (empty)");
    } else {
      for (const agent of withMessages) {
        lines.push(`  ── ${agent.agent} (${agent.count}) ──`);
        for (const msg of agent.messages) {
          const ts = msg.timestamp ? `[${msg.timestamp.slice(0, 10)}]` : "";
          lines.push(`  ${ts} from:${msg.from} — ${msg.topic}`);
        }
      }
    }
    lines.push("");
  }

  if (showTab("ops") || showTab("tickets")) {
    lines.push("── TICKETS ──");
    if (data.ticketData.length === 0) {
      lines.push("  (none open)");
    } else {
      for (const t of data.ticketData) {
        const assignee = t.assigned ? ` [${t.assigned}]` : "";
        lines.push(`  ${t.id}${assignee} ${t.title}`);
      }
    }
    lines.push("");
  }

  if (showTab("git")) {
    lines.push("── GIT ──");
    for (const repo of data.gitStatuses) {
      const clean = repo.dirty ? `${repo.dirtyFiles.length} dirty` : "clean";
      const remote = repo.hasRemote
        ? ` (ahead ${repo.ahead}, behind ${repo.behind})`
        : " (no remote)";
      lines.push(`  ${repo.name}: ${repo.branch} ${clean}${remote}`);
      if (repo.lastCommit) {
        lines.push(`    last: ${repo.lastCommit} (${repo.lastCommitAge})`);
      }
      if (repo.dirty) {
        for (const f of repo.dirtyFiles) {
          lines.push(`    ${f}`);
        }
      }
    }
    lines.push("");
  }

  if (showTab("ideas")) {
    lines.push("── IDEAS ──");
    const byAgent = new Map<string, IdeaItem[]>();
    for (const idea of data.ideas) {
      const list = byAgent.get(idea.agent) || [];
      list.push(idea);
      byAgent.set(idea.agent, list);
    }
    if (byAgent.size === 0) {
      lines.push("  (none)");
    } else {
      for (const [agent, items] of byAgent) {
        lines.push(`  ── ${agent} ──`);
        for (const idea of items) {
          const tags = idea.tags.length > 0 ? ` [${idea.tags.join(", ")}]` : "";
          lines.push(`  [${idea.status}] ${idea.title}${tags}`);
        }
      }
    }
    lines.push("");
  }

  if (showTab("actions")) {
    lines.push("── ACTIONS ──");
    if (data.actions.length === 0) {
      lines.push("  (none)");
    } else {
      for (const action of data.actions) {
        const pri = action.priority !== "normal" ? `[${action.priority}] ` : "";
        lines.push(`  ${pri}${action.agent}: ${action.title} (${action.status})`);
      }
    }
    lines.push("");
  }

  if (showTab("sessions")) {
    lines.push("── SESSIONS ──");
    if (data.tmuxSessions.length === 0) {
      lines.push("  (no tmux sessions)");
    } else {
      for (const session of data.tmuxSessions) {
        const attached = session.attached ? " (attached)" : "";
        lines.push(`  ${session.name}: ${session.windows} windows${attached}`);
        for (const pane of session.panes) {
          const shortPath = pane.currentPath.replace(/.*\/canvas-/, "canvas-");
          lines.push(`    [${pane.windowName}:${pane.paneIndex}] ${pane.currentCommand} @ ${shortPath}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

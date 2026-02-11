// Ops Monitor Canvas - Type Definitions

export interface OpsConfig {
  title?: string;
  inboxPath?: string;   // Override path to shared/messages/inbox/
  ticketsPath?: string; // Override path to shared/tickets/
  agents?: string[];    // Agent names to monitor (default: all)
}

export interface InboxMessage {
  agent: string;
  filename: string;
  from: string;
  topic: string;
  type: string;
  timestamp: string;
  ticketId?: string;
}

export interface InboxAgentSummary {
  agent: string;
  count: number;
  messages: InboxMessage[];
}

export interface TicketInfo {
  id: string;
  title: string;
  status: string;
  assigned?: string;
  body?: string; // Content after frontmatter for expanded view
}

// Ops monitor color palette
export const OPS_COLORS = {
  primary: "cyan",
  header: "magenta",
  success: "green",
  warning: "yellow",
  error: "red",
  dim: "gray",
  text: "white",
  accent: "blue",
  selected: "cyan",
} as const;

export const DEFAULT_AGENTS = [
  "pm", "arch", "wpa", "wpm", "bd", "el", "coder",
];

export type Column = "inbox" | "tickets";

// Tab system
export type TabId = "operations" | "git" | "ideas" | "actions" | "sessions" | "agents";

export const TABS: { id: TabId; label: string; key: string }[] = [
  { id: "operations", label: "OPS", key: "1" },
  { id: "git", label: "GIT", key: "2" },
  { id: "ideas", label: "IDEAS", key: "3" },
  { id: "actions", label: "ACTIONS", key: "4" },
  { id: "sessions", label: "SESSIONS", key: "5" },
  { id: "agents", label: "AGENTS", key: "6" },
];

// Git status
export interface RepoGitStatus {
  name: string;
  path: string;
  branch: string;
  dirty: boolean;
  dirtyFiles: string[];
  ahead: number;
  behind: number;
  hasRemote: boolean;
  lastCommit: string;
  lastCommitAge: string;
}

// Ideas
export interface IdeaItem {
  title: string;
  agent: string;
  source: string;
  captured: string;
  status: string;
  tags: string[];
  body: string;
  filename: string;
}

// Actions
export interface ActionItem {
  title: string;
  agent: string;
  source: string;
  created: string;
  status: string;
  priority: string;
  body: string;
  filename: string;
}

// Tmux
export interface TmuxSession {
  name: string;
  windows: number;
  attached: boolean;
  panes: TmuxPane[];
}

export interface TmuxPane {
  sessionName: string;
  windowIndex: number;
  windowName: string;
  paneIndex: number;
  currentCommand: string;
  currentPath: string;
  paneTitle: string;
}

export interface ActiveAgentSession {
  ticket?: string;
  paneTitle?: string;
  path?: string;
}

// Review / Agent status
export interface AgentActivity {
  agent: string;
  commitCount: number;
  lastCommitMsg: string;
  dirtyFiles: number;     // uncommitted changes in agent dir
  unpushedCommits: number; // commits ahead of remote in agent dir
  inboxCount: number;     // messages waiting in inbox
  sentCount: number;      // messages sent since last review
  filesChanged: number;   // files changed since last review
  memoryEntries: number;  // memory log entries in last 3 days (legacy, kept for compat)
  memoryTotal: number;    // total memory log entries across all files
  memory24h: number;      // memory log entries in files updated in last 24 hours
  hasMemory: boolean;     // agent has memory system installed
  activeSessions: ActiveAgentSession[];  // currently running claude sessions
}

export interface ReviewStatus {
  lastActionPlanDate: string;  // YYYY-MM-DD or "" if never
  lastActionPlanDaysAgo: number; // -1 if never
  agentReflections: { agent: string; lastDate: string; daysAgo: number }[];
  agentActivity: AgentActivity[];
  newReflectionsSinceLastPlan: number;
  reviewDue: boolean; // true if >2 days since last plan, or new reflections unsynthesized
}

// Summary bar
export interface SummaryCounts {
  inbox: number;
  ticketsOpen: number;
  ideas: number;
  actionsOpen: number;
  gitClean: number;
  gitTotal: number;
}

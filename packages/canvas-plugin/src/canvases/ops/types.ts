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
export type TabId = "operations" | "git" | "ideas" | "actions" | "sessions";

export const TABS: { id: TabId; label: string; key: string }[] = [
  { id: "operations", label: "OPS", key: "1" },
  { id: "git", label: "GIT", key: "2" },
  { id: "ideas", label: "IDEAS", key: "3" },
  { id: "actions", label: "ACTIONS", key: "4" },
  { id: "sessions", label: "SESSIONS", key: "5" },
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

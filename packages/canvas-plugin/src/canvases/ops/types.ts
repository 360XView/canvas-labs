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

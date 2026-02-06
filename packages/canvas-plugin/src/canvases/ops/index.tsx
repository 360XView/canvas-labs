// Ops Monitor Canvas - Quick visual heartbeat for team operations

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  OpsConfig,
  InboxMessage,
  InboxAgentSummary,
  TicketInfo,
  Column,
} from "./types";
import { OPS_COLORS, DEFAULT_AGENTS } from "./types";

interface Props {
  id: string;
  config?: OpsConfig;
  socketPath?: string;
  scenario?: string;
}

// Row model for inbox display: headers + messages + closing lines interleaved
type InboxRow =
  | { kind: "header"; agent: string; count: number }
  | { kind: "message"; message: InboxMessage; flatIndex: number }
  | { kind: "footer"; agent: string };

function getDefaultTeamPath(): string {
  const fromCwd = resolve(process.cwd(), "../../..", "canvas-team");
  if (existsSync(fromCwd)) return fromCwd;
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    return resolve(thisDir, "../../../../../..", "canvas-team");
  } catch {
    return fromCwd;
  }
}

function extractYamlField(yaml: string, field: string): string | undefined {
  const match = yaml.match(new RegExp(`^${field}:\\s*"?([^"\\n]*)"?`, "m"));
  return match ? match[1].trim() : undefined;
}

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
          const match = content.match(/^---\n([\s\S]*?)\n---/);
          if (!match) return { agent, filename: f, from: "?", topic: f, type: "?", timestamp: "" };
          const fm = match[1];
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

function readTickets(ticketsPath: string): TicketInfo[] {
  if (!existsSync(ticketsPath)) return [];
  try {
    const files = readdirSync(ticketsPath).filter((f) => f.endsWith(".md"));
    const tickets: TicketInfo[] = [];
    for (const file of files) {
      try {
        const content = readFileSync(join(ticketsPath, file), "utf-8");
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (!match) continue;
        const frontmatter = match[1];
        const status = extractYamlField(frontmatter, "status") || "unknown";
        if (status !== "open") continue;
        const id = extractYamlField(frontmatter, "id") || file.replace(".md", "");
        const title = extractYamlField(frontmatter, "title") || id;
        const assigned = extractYamlField(frontmatter, "assigned");
        const body = content.slice(match[0].length).trim();
        tickets.push({ id, title, status, assigned, body });
      } catch { /* skip */ }
    }
    tickets.sort((a, b) => a.id.localeCompare(b.id));
    return tickets;
  } catch {
    return [];
  }
}

// Build grouped inbox rows: header per agent (only those with messages), then their messages
function buildInboxRows(summaries: InboxAgentSummary[]): { rows: InboxRow[]; flatMessages: InboxMessage[] } {
  const rows: InboxRow[] = [];
  const flatMessages: InboxMessage[] = [];
  for (const s of summaries) {
    if (s.count === 0) continue;
    rows.push({ kind: "header", agent: s.agent, count: s.count });
    for (const m of s.messages) {
      rows.push({ kind: "message", message: m, flatIndex: flatMessages.length });
      flatMessages.push(m);
    }
    rows.push({ kind: "footer", agent: s.agent });
  }
  return { rows, flatMessages };
}

function truncate(s: string, maxLen: number): string {
  if (maxLen <= 1) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

export function OpsCanvas({ id, config, socketPath, scenario = "monitor" }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [dimensions, setDimensions] = useState({
    width: stdout?.columns || 80,
    height: stdout?.rows || 24,
  });

  const [inboxData, setInboxData] = useState<InboxAgentSummary[]>([]);
  const [ticketData, setTicketData] = useState<TicketInfo[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const [activeCol, setActiveCol] = useState<Column>("inbox");
  const [inboxIdx, setInboxIdx] = useState(0); // Index into flatMessages
  const [ticketIdx, setTicketIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const teamPath = getDefaultTeamPath();
  const inboxPath = config?.inboxPath || join(teamPath, "shared/messages/inbox");
  const ticketsPath = config?.ticketsPath || join(teamPath, "shared/tickets");
  const agents = config?.agents || DEFAULT_AGENTS;

  const refresh = useCallback(() => {
    setInboxData(readInbox(inboxPath, agents));
    setTicketData(readTickets(ticketsPath));
    setLastRefresh(new Date());
  }, [inboxPath, ticketsPath, agents]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

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

  const { rows: inboxRows, flatMessages } = buildInboxRows(inboxData);
  const totalInbox = flatMessages.length;

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      if (expanded) { setExpanded(false); return; }
      exit();
    } else if (input === "r") {
      refresh();
    } else if (key.tab) {
      setActiveCol((c) => (c === "inbox" ? "tickets" : "inbox"));
      setExpanded(false);
    } else if (key.upArrow) {
      if (activeCol === "inbox") {
        setInboxIdx((i) => Math.max(0, i - 1));
      } else {
        setTicketIdx((i) => Math.max(0, i - 1));
      }
    } else if (key.downArrow) {
      if (activeCol === "inbox") {
        setInboxIdx((i) => Math.min(flatMessages.length - 1, i + 1));
      } else {
        setTicketIdx((i) => Math.min(ticketData.length - 1, i + 1));
      }
    } else if (key.return) {
      setExpanded((e) => !e);
    }
  });

  const termWidth = dimensions.width;
  const termHeight = dimensions.height;

  // Expanded view
  if (expanded) {
    const item = activeCol === "inbox" ? flatMessages[inboxIdx] : ticketData[ticketIdx];
    if (!item) { setExpanded(false); return null; }

    let title: string;
    let content: string;

    if (activeCol === "inbox") {
      const msg = item as InboxMessage;
      title = `${msg.from} → ${msg.agent}: ${msg.topic}`;
      try {
        const filePath = join(inboxPath, msg.agent, msg.filename);
        const raw = readFileSync(filePath, "utf-8");
        const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)/);
        content = bodyMatch ? bodyMatch[1].trim() : raw;
      } catch {
        content = "(Could not read message)";
      }
    } else {
      const ticket = item as TicketInfo;
      title = `${ticket.id}: ${ticket.title}`;
      content = ticket.body || "(No description)";
    }

    const headerLines = 4;
    const footerLines = 2;
    const contentWidth = Math.min(termWidth - 4, 80);
    const viewportHeight = termHeight - headerLines - footerLines;
    const contentLines = content.split("\n");
    const visibleLines = contentLines.slice(0, viewportHeight);

    return (
      <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color={OPS_COLORS.header}>
            {activeCol === "inbox" ? "MESSAGE" : "TICKET"}
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text bold color={OPS_COLORS.text}>
            {truncate(title, contentWidth)}
          </Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, i) => (
            <Text key={`line-${i}`} color={OPS_COLORS.text}>
              {truncate(line, contentWidth)}
            </Text>
          ))}
          {contentLines.length > viewportHeight && (
            <Text color={OPS_COLORS.dim}>
              ... {contentLines.length - viewportHeight} more lines
            </Text>
          )}
        </Box>
        <Box>
          <Text color={OPS_COLORS.dim}>
            Enter/Esc close • q quit
          </Text>
        </Box>
      </Box>
    );
  }

  // Dashboard view — account for paddingX={1} (2 chars total)
  const innerWidth = termWidth - 2;
  const leftWidth = Math.max(30, Math.floor(innerWidth * 0.45));
  const rightWidth = innerWidth - leftWidth - 3;

  const timeStr = lastRefresh.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const headerRows = 4;
  const footerRows = 2;
  const contentRows = Math.max(1, termHeight - headerRows - footerRows);

  // Render inbox rows (headers + messages)
  const inboxElements: JSX.Element[] = [];
  let rowCount = 0;
  for (const row of inboxRows) {
    if (rowCount >= contentRows) break;
    if (row.kind === "header") {
      const prefix = "── ";
      const countStr = ` (${row.count}) `;
      const usedWidth = prefix.length + row.agent.length + countStr.length;
      const lineChars = Math.max(0, leftWidth - usedWidth);
      inboxElements.push(
        <Box key={`hdr-${row.agent}`}>
          <Text color={OPS_COLORS.accent} bold>
            {"── "}
          </Text>
          <Text color={OPS_COLORS.accent} bold>
            {row.agent}
          </Text>
          <Text color={OPS_COLORS.dim}>
            {` (${row.count}) `}
          </Text>
          <Text color={OPS_COLORS.accent}>
            {"─".repeat(lineChars)}
          </Text>
        </Box>
      );
    } else if (row.kind === "message") {
      const msg = row.message;
      const isSelected = activeCol === "inbox" && row.flatIndex === inboxIdx;
      const fromWidth = 4; // "wpm "
      const topicWidth = leftWidth - fromWidth - 3; // cursor + from + space
      inboxElements.push(
        <Box key={`msg-${row.flatIndex}`}>
          <Text color={isSelected ? OPS_COLORS.selected : OPS_COLORS.dim}>
            {isSelected ? "▸" : " "}
          </Text>
          <Text color={OPS_COLORS.warning}>
            {msg.from.padEnd(fromWidth)}
          </Text>
          <Text color={isSelected ? OPS_COLORS.text : OPS_COLORS.dim}>
            {truncate(msg.topic, topicWidth)}
          </Text>
        </Box>
      );
    } else if (row.kind === "footer") {
      inboxElements.push(
        <Box key={`ftr-${row.agent}`}>
          <Text color={OPS_COLORS.dim}>
            {"─".repeat(leftWidth)}
          </Text>
        </Box>
      );
    }
    rowCount++;
  }

  if (totalInbox === 0) {
    inboxElements.push(
      <Text key="empty" color={OPS_COLORS.dim}>No messages</Text>
    );
  }

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight} paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={OPS_COLORS.header}>
          {config?.title || "OPS MONITOR"}
        </Text>
        <Text color={OPS_COLORS.dim}>
          {timeStr} • Tab ↑↓ Enter • r refresh • q quit
        </Text>
      </Box>

      {/* Column headers */}
      <Box>
        <Box width={leftWidth}>
          <Text bold color={activeCol === "inbox" ? OPS_COLORS.primary : OPS_COLORS.dim}>
            INBOX
          </Text>
          <Text color={OPS_COLORS.dim}> ({totalInbox})</Text>
        </Box>
        <Box width={3}>
          <Text color={OPS_COLORS.dim}> │ </Text>
        </Box>
        <Box width={rightWidth}>
          <Text bold color={activeCol === "tickets" ? OPS_COLORS.primary : OPS_COLORS.dim}>
            TICKETS
          </Text>
          <Text color={OPS_COLORS.dim}> ({ticketData.length} open)</Text>
        </Box>
      </Box>

      {/* Divider line */}
      <Box>
        <Text color={OPS_COLORS.dim}>
          {"─".repeat(leftWidth)}{"─┼─"}{"─".repeat(rightWidth)}
        </Text>
      </Box>

      {/* Content rows */}
      <Box flexGrow={1}>
        {/* Left column - Inbox grouped by agent */}
        <Box flexDirection="column" width={leftWidth}>
          {inboxElements}
        </Box>

        {/* Divider */}
        <Box flexDirection="column" width={3}>
          {Array.from({ length: contentRows }).map((_, i) => (
            <Text key={`div-${i}`} color={OPS_COLORS.dim}> │ </Text>
          ))}
        </Box>

        {/* Right column - Open tickets */}
        <Box flexDirection="column" width={rightWidth}>
          {ticketData.length === 0 ? (
            <Text color={OPS_COLORS.dim}>No open tickets</Text>
          ) : (
            ticketData.slice(0, contentRows).map((ticket, i) => {
              const isSelected = activeCol === "tickets" && i === ticketIdx;
              const idWidth = 9;
              const assignedWidth = ticket.assigned ? ticket.assigned.length + 3 : 0;
              const titleWidth = rightWidth - idWidth - assignedWidth - 2;
              return (
                <Box key={ticket.id}>
                  <Text color={isSelected ? OPS_COLORS.selected : OPS_COLORS.dim}>
                    {isSelected ? "▸" : " "}
                  </Text>
                  <Text color={OPS_COLORS.success} bold>
                    {ticket.id.padEnd(idWidth)}
                  </Text>
                  <Text color={isSelected ? OPS_COLORS.text : OPS_COLORS.dim}>
                    {truncate(ticket.title, titleWidth)}
                  </Text>
                  {ticket.assigned && (
                    <Text color={OPS_COLORS.dim}>
                      {` (${ticket.assigned})`}
                    </Text>
                  )}
                </Box>
              );
            })
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box>
        <Text color={OPS_COLORS.dim}>
          {activeCol === "inbox" && flatMessages.length > 0
            ? `→ ${flatMessages[inboxIdx]?.agent || ""} inbox • from ${flatMessages[inboxIdx]?.from || ""}`
            : activeCol === "tickets" && ticketData.length > 0
              ? `→ ${ticketData[ticketIdx]?.assigned || "unassigned"}`
              : ""}
        </Text>
      </Box>
    </Box>
  );
}

export type { OpsConfig } from "./types";

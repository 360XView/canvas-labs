// Ops Monitor - Operations tab component
// Direct extraction of v1 two-column inbox + tickets layout

import React from "react";
import { Box, Text } from "ink";
import type { InboxAgentSummary, InboxMessage, TicketInfo, Column } from "../types";
import { OPS_COLORS } from "../types";

// Row model for inbox display: headers + messages + closing lines interleaved
type InboxRow =
  | { kind: "header"; agent: string; count: number }
  | { kind: "message"; message: InboxMessage; flatIndex: number }
  | { kind: "footer"; agent: string };

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
  return s.slice(0, maxLen - 1) + "\u2026";
}

interface Props {
  inboxData: InboxAgentSummary[];
  ticketData: TicketInfo[];
  activeCol: Column;
  inboxIdx: number;
  ticketIdx: number;
  innerWidth: number;
  contentRows: number;
}

export function OperationsTab({
  inboxData,
  ticketData,
  activeCol,
  inboxIdx,
  ticketIdx,
  innerWidth,
  contentRows,
}: Props) {
  const { rows: inboxRows, flatMessages } = buildInboxRows(inboxData);
  const totalInbox = flatMessages.length;

  const leftWidth = Math.max(30, Math.floor(innerWidth * 0.45));
  const rightWidth = innerWidth - leftWidth - 3;

  // Render inbox rows (headers + messages)
  const inboxElements: JSX.Element[] = [];
  let rowCount = 0;
  for (const row of inboxRows) {
    if (rowCount >= contentRows) break;
    if (row.kind === "header") {
      const prefix = "\u2500\u2500 ";
      const countStr = ` (${row.count}) `;
      const usedWidth = prefix.length + row.agent.length + countStr.length;
      const lineChars = Math.max(0, leftWidth - usedWidth);
      inboxElements.push(
        <Box key={`hdr-${row.agent}`}>
          <Text color={OPS_COLORS.accent} bold>
            {"\u2500\u2500 "}
          </Text>
          <Text color={OPS_COLORS.accent} bold>
            {row.agent}
          </Text>
          <Text color={OPS_COLORS.dim}>
            {` (${row.count}) `}
          </Text>
          <Text color={OPS_COLORS.accent}>
            {"\u2500".repeat(lineChars)}
          </Text>
        </Box>
      );
    } else if (row.kind === "message") {
      const msg = row.message;
      const isSelected = activeCol === "inbox" && row.flatIndex === inboxIdx;
      const fromWidth = 4;
      const topicWidth = leftWidth - fromWidth - 3;
      inboxElements.push(
        <Box key={`msg-${row.flatIndex}`}>
          <Text color={isSelected ? OPS_COLORS.selected : OPS_COLORS.dim}>
            {isSelected ? "\u25B8" : " "}
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
            {"\u2500".repeat(leftWidth)}
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
    <Box flexDirection="column" flexGrow={1}>
      {/* Column headers */}
      <Box>
        <Box width={leftWidth}>
          <Text bold color={activeCol === "inbox" ? OPS_COLORS.primary : OPS_COLORS.dim}>
            INBOX
          </Text>
          <Text color={OPS_COLORS.dim}> ({totalInbox})</Text>
        </Box>
        <Box width={3}>
          <Text color={OPS_COLORS.dim}> {"\u2502"} </Text>
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
          {"\u2500".repeat(leftWidth)}{"\u2500\u253C\u2500"}{"\u2500".repeat(rightWidth)}
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
            <Text key={`div-${i}`} color={OPS_COLORS.dim}> {"\u2502"} </Text>
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
                    {isSelected ? "\u25B8" : " "}
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
    </Box>
  );
}

// Re-export for use in shell (computing flat messages for footer context)
export { buildInboxRows };

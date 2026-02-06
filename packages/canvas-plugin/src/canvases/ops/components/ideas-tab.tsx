// Ops Monitor - Ideas tab component
// Scrollable list of ideas grouped by agent

import React from "react";
import { Box, Text } from "ink";
import type { IdeaItem } from "../types";
import { OPS_COLORS } from "../types";

function truncate(s: string, maxLen: number): string {
  if (maxLen <= 1) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "\u2026";
}

interface Props {
  ideas: IdeaItem[];
  selectedIdx: number;
  innerWidth: number;
  contentRows: number;
}

// Group ideas by agent, producing interleaved header + item rows
type IdeaRow =
  | { kind: "header"; agent: string; count: number }
  | { kind: "item"; idea: IdeaItem; flatIndex: number };

function buildIdeaRows(ideas: IdeaItem[]): { rows: IdeaRow[]; flatIdeas: IdeaItem[] } {
  const rows: IdeaRow[] = [];
  const flatIdeas: IdeaItem[] = [];

  // Group by agent preserving order of first appearance
  const byAgent = new Map<string, IdeaItem[]>();
  for (const idea of ideas) {
    const group = byAgent.get(idea.agent) || [];
    group.push(idea);
    byAgent.set(idea.agent, group);
  }

  for (const [agent, agentIdeas] of byAgent) {
    rows.push({ kind: "header", agent, count: agentIdeas.length });
    for (const idea of agentIdeas) {
      rows.push({ kind: "item", idea, flatIndex: flatIdeas.length });
      flatIdeas.push(idea);
    }
  }

  return { rows, flatIdeas };
}

export function IdeasTab({ ideas, selectedIdx, innerWidth, contentRows }: Props) {
  if (ideas.length === 0) {
    return <Text color={OPS_COLORS.dim}>No ideas found</Text>;
  }

  const { rows } = buildIdeaRows(ideas);

  const elements: JSX.Element[] = [];
  let rowCount = 0;

  for (const row of rows) {
    if (rowCount >= contentRows) break;

    if (row.kind === "header") {
      const prefix = "\u2500\u2500 ";
      const countStr = ` (${row.count}) `;
      const usedWidth = prefix.length + row.agent.length + countStr.length;
      const lineChars = Math.max(0, innerWidth - usedWidth);
      elements.push(
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
    } else {
      const idea = row.idea;
      const isSelected = row.flatIndex === selectedIdx;
      const dateStr = idea.captured ? idea.captured.slice(0, 10) : "";
      const titleWidth = innerWidth - dateStr.length - 4;
      elements.push(
        <Box key={`idea-${row.flatIndex}`}>
          <Text color={isSelected ? OPS_COLORS.selected : OPS_COLORS.dim}>
            {isSelected ? "\u25B8" : " "}
          </Text>
          <Text color={isSelected ? OPS_COLORS.text : OPS_COLORS.dim}>
            {truncate(idea.title, titleWidth)}
          </Text>
          {dateStr && (
            <Text color={OPS_COLORS.dim}>
              {"  "}{dateStr}
            </Text>
          )}
        </Box>
      );
    }
    rowCount++;
  }

  return (
    <Box flexDirection="column">
      {elements}
    </Box>
  );
}

export { buildIdeaRows };

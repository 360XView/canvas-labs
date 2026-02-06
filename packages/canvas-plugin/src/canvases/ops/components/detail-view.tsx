// Ops Monitor - Detail view component
// Generalized expanded view for any item (message, ticket, idea, action, etc.)

import React from "react";
import { Box, Text } from "ink";
import { OPS_COLORS } from "../types";

function truncate(s: string, maxLen: number): string {
  if (maxLen <= 1) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "\u2026";
}

interface Props {
  title: string;
  category: string;
  content: string;
  termWidth: number;
  termHeight: number;
}

export function DetailView({ title, category, content, termWidth, termHeight }: Props) {
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
          {category}
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
          Enter/Esc close {"\u2022"} q quit
        </Text>
      </Box>
    </Box>
  );
}

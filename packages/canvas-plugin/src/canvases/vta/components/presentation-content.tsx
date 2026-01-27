// Presentation Content Panel
// Renders interactive presentation slides with segment highlighting

import React from "react";
import { Box, Text } from "ink";
import type { NarrationSegment, PresentationMode } from "../../../presentation/types";
import { VTA_COLORS } from "../types";

interface PresentationContentProps {
  title: string;
  instructions: string;
  segments: NarrationSegment[];
  highlightedSegment: number | null;
  mode: PresentationMode;
  slideIndex: number;
  totalSlides: number;
  width: number;
  height: number;
  focused: boolean;
}

export function PresentationContent({
  title,
  instructions,
  segments,
  highlightedSegment,
  mode,
  slideIndex,
  totalSlides,
  width,
  height,
  focused,
}: PresentationContentProps) {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={focused ? VTA_COLORS.primary : VTA_COLORS.muted}
      paddingX={1}
    >
      {/* Title */}
      <Box marginBottom={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color={VTA_COLORS.primary}>
            {title}
          </Text>
          <ModeIndicator mode={mode} />
        </Box>
        <Box marginTop={0}>
          <Text dimColor>─────────────────────────────────────────────</Text>
        </Box>
      </Box>

      {/* Content with segments */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {segments.length > 0 ? (
          <SegmentedContent
            segments={segments}
            highlightedSegment={highlightedSegment}
          />
        ) : (
          <PlainContent instructions={instructions} />
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          Slide {slideIndex + 1}/{totalSlides} • ←/→ nav • e explain • g guided • q quit
        </Text>
      </Box>
    </Box>
  );
}

interface ModeIndicatorProps {
  mode: PresentationMode;
}

function ModeIndicator({ mode }: ModeIndicatorProps) {
  if (mode === "guided") {
    return (
      <Box>
        <Text backgroundColor="blue" color="white">
          {" "}GUIDED{" "}
        </Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text backgroundColor="gray" color="white">
        {" "}BROWSE{" "}
      </Text>
    </Box>
  );
}

interface SegmentedContentProps {
  segments: NarrationSegment[];
  highlightedSegment: number | null;
}

function SegmentedContent({ segments, highlightedSegment }: SegmentedContentProps) {
  return (
    <Box flexDirection="column">
      {segments.map((segment) => (
        <SegmentRenderer
          key={segment.id}
          segment={segment}
          isHighlighted={highlightedSegment === segment.id}
        />
      ))}
    </Box>
  );
}

interface SegmentRendererProps {
  segment: NarrationSegment;
  isHighlighted: boolean;
}

function SegmentRenderer({ segment, isHighlighted }: SegmentRendererProps) {
  const baseStyle = isHighlighted
    ? { backgroundColor: "blue", color: "white" }
    : {};

  switch (segment.type) {
    case "bullet":
      return (
        <Box marginLeft={2} marginBottom={1}>
          <Text {...baseStyle}>
            • {segment.text}
          </Text>
        </Box>
      );

    case "code":
      return (
        <Box
          marginY={1}
          marginLeft={2}
          paddingX={1}
          borderStyle="round"
          borderColor={isHighlighted ? "blue" : VTA_COLORS.muted}
        >
          <Text color={isHighlighted ? "white" : VTA_COLORS.primary} {...(isHighlighted ? { backgroundColor: "blue" } : {})}>
            {segment.text}
          </Text>
        </Box>
      );

    case "sentence":
    default:
      return (
        <Box marginBottom={1}>
          <Text wrap="wrap" {...baseStyle}>
            {segment.text}
          </Text>
        </Box>
      );
  }
}

interface PlainContentProps {
  instructions: string;
}

function PlainContent({ instructions }: PlainContentProps) {
  return (
    <Box flexDirection="column">
      <Text wrap="wrap">{instructions}</Text>
    </Box>
  );
}

// Presentation Generator
// Converts markdown documents to interactive presentation YAML format

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { NarrationSegment, InteractivePresentation, InteractiveSlide } from "./types";

export interface GeneratorOptions {
  inputPath: string;
  outputPath?: string;
  title?: string;
  description?: string;
}

export interface GeneratorResult {
  outputPath: string;
  slideCount: number;
  segmentCount: number;
}

/**
 * Parse markdown into slides based on headers
 */
function parseMarkdownToSlides(content: string): Array<{ title: string; body: string }> {
  const lines = content.split("\n");
  const slides: Array<{ title: string; body: string }> = [];

  let currentSlide: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    // Check for H1 or H2 headers (slide boundaries)
    const h1Match = line.match(/^#\s+(.+)$/);
    const h2Match = line.match(/^##\s+(.+)$/);

    if (h1Match || h2Match) {
      // Save previous slide
      if (currentSlide) {
        slides.push({
          title: currentSlide.title,
          body: currentSlide.body.join("\n").trim(),
        });
      }

      // Start new slide
      currentSlide = {
        title: h1Match ? h1Match[1] : h2Match![1],
        body: [],
      };
    } else if (currentSlide) {
      currentSlide.body.push(line);
    }
  }

  // Don't forget the last slide
  if (currentSlide) {
    slides.push({
      title: currentSlide.title,
      body: currentSlide.body.join("\n").trim(),
    });
  }

  return slides;
}

/**
 * Parse slide body into narration segments
 */
function parseBodyToSegments(body: string): NarrationSegment[] {
  const segments: NarrationSegment[] = [];
  let segmentId = 0;

  const lines = body.split("\n");
  let currentParagraph: string[] = [];

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(" ").trim();
      if (text) {
        // Split paragraph into sentences
        const sentences = splitIntoSentences(text);
        for (const sentence of sentences) {
          segments.push({
            id: segmentId++,
            type: "sentence",
            text: sentence,
          });
        }
      }
      currentParagraph = [];
    }
  }

  let inCodeBlock = false;
  let codeBlock: string[] = [];

  for (const line of lines) {
    // Handle code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End of code block
        if (codeBlock.length > 0) {
          segments.push({
            id: segmentId++,
            type: "code",
            text: codeBlock.join("\n"),
          });
        }
        codeBlock = [];
        inCodeBlock = false;
      } else {
        // Start of code block
        flushParagraph();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlock.push(line);
      continue;
    }

    // Handle bullet points
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      segments.push({
        id: segmentId++,
        type: "bullet",
        text: bulletMatch[1],
      });
      continue;
    }

    // Handle numbered lists
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      segments.push({
        id: segmentId++,
        type: "bullet",
        text: numberedMatch[1],
      });
      continue;
    }

    // Handle empty lines (paragraph breaks)
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    // Regular text - add to current paragraph
    currentParagraph.push(line.trim());
  }

  // Flush any remaining content
  flushParagraph();

  return segments;
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Simple sentence splitting - could be improved with NLP
  // Split on . ! ? followed by space and capital letter or end of string
  const sentences: string[] = [];
  let current = "";

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Check for sentence ending
    if (text[i] === "." || text[i] === "!" || text[i] === "?") {
      // Look ahead to see if this is actually end of sentence
      const nextChar = text[i + 1];
      const charAfterNext = text[i + 2];

      // End of string or followed by space and capital
      if (
        nextChar === undefined ||
        (nextChar === " " && charAfterNext && charAfterNext === charAfterNext.toUpperCase() && /[A-Z]/.test(charAfterNext))
      ) {
        const trimmed = current.trim();
        if (trimmed) {
          sentences.push(trimmed);
        }
        current = "";
      }
    }
  }

  // Don't forget remaining text
  const remaining = current.trim();
  if (remaining) {
    sentences.push(remaining);
  }

  return sentences;
}

/**
 * Generate a slug from a title
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate interactive presentation YAML from markdown
 */
export function generatePresentation(options: GeneratorOptions): GeneratorResult {
  const { inputPath, outputPath, title, description } = options;

  // Read input file
  const absoluteInputPath = path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath);

  if (!fs.existsSync(absoluteInputPath)) {
    throw new Error(`Input file not found: ${absoluteInputPath}`);
  }

  const content = fs.readFileSync(absoluteInputPath, "utf-8");

  // Parse markdown into slides
  const rawSlides = parseMarkdownToSlides(content);

  if (rawSlides.length === 0) {
    throw new Error("No slides found. Make sure markdown has H1 or H2 headers.");
  }

  // Convert to interactive slides
  let totalSegments = 0;
  const slides: InteractiveSlide[] = rawSlides.map((raw, index) => {
    const segments = parseBodyToSegments(raw.body);
    totalSegments += segments.length;

    return {
      id: `slide-${index + 1}-${slugify(raw.title).slice(0, 20)}`,
      title: raw.title,
      content: {
        instructions: raw.body,
      },
      narration: {
        segments,
      },
    };
  });

  // Build presentation
  const presentation: InteractivePresentation = {
    title: title || rawSlides[0]?.title || path.basename(inputPath, path.extname(inputPath)),
    description,
    type: "interactive-presentation",
    slides,
  };

  // Determine output path
  let finalOutputPath: string;
  if (outputPath) {
    finalOutputPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);
  } else {
    const inputBasename = path.basename(inputPath, path.extname(inputPath));
    finalOutputPath = path.resolve(path.dirname(absoluteInputPath), `${inputBasename}.yaml`);
  }

  // Write YAML
  const yamlContent = yaml.dump(presentation, {
    lineWidth: -1, // Don't wrap lines
    quotingType: '"',
    forceQuotes: false,
  });

  fs.writeFileSync(finalOutputPath, yamlContent);

  return {
    outputPath: finalOutputPath,
    slideCount: slides.length,
    segmentCount: totalSegments,
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Presentation Generator - Convert markdown to interactive presentation YAML

Usage:
  bun run generator.ts <input.md> [options]

Options:
  -o, --output <path>   Output file path (default: same as input with .yaml extension)
  -t, --title <title>   Presentation title (default: first heading or filename)
  -d, --desc <text>     Presentation description
  -h, --help            Show this help

Examples:
  bun run generator.ts docs/architecture.md
  bun run generator.ts docs/intro.md -o presentations/intro.yaml
  bun run generator.ts README.md --title "Project Overview"
`);
    process.exit(0);
  }

  const inputPath = args[0];
  let outputPath: string | undefined;
  let title: string | undefined;
  let description: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--output") {
      outputPath = args[++i];
    } else if (args[i] === "-t" || args[i] === "--title") {
      title = args[++i];
    } else if (args[i] === "-d" || args[i] === "--desc") {
      description = args[++i];
    }
  }

  try {
    const result = generatePresentation({
      inputPath,
      outputPath,
      title,
      description,
    });

    console.log(`Generated presentation:`);
    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Slides: ${result.slideCount}`);
    console.log(`  Segments: ${result.segmentCount}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Interactive Presentation Spawner
// Sets up tmux with VTA on top and Claude Code tutor below
// Pattern follows lab/spawn.ts

import { spawnSync, spawn } from "child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { dirname, resolve, join, basename } from "path";
import { loadPresentationFromFile, loadPresentation } from "./loader";
import { createPresentationStateWriter } from "../lab/tutor-control/presentation-state";
import type { InteractivePresentation } from "./types";
import type { Module } from "../canvases/vta/types";

export interface InteractivePresentationSpawnOptions {
  presentationPath?: string;
  presentationId?: string;
  sessionName?: string;
  tutorHeight?: number; // Percentage for tutor pane (default 40)
}

export interface InteractivePresentationSpawnResult {
  sessionName: string;
  logDir: string;
  socketPath: string;
}

// Get the base path for this package
function getBasePath(): string {
  return resolve(dirname(import.meta.path), "../..");
}

export async function spawnInteractivePresentation(
  options: InteractivePresentationSpawnOptions
): Promise<InteractivePresentationSpawnResult> {
  const {
    presentationPath,
    presentationId,
    sessionName = `pres-${Date.now()}`,
    tutorHeight = 40,
  } = options;

  if (!presentationPath && !presentationId) {
    throw new Error("Either presentationPath or presentationId must be provided");
  }

  // Load presentation
  let module: Module;
  let presId: string;

  if (presentationPath) {
    module = loadPresentationFromFile(presentationPath);
    presId = basename(presentationPath, ".yaml");
  } else {
    module = loadPresentation(presentationId!);
    presId = presentationId!;
  }

  const basePath = getBasePath();
  const timestamp = Date.now();
  const logDir = `/tmp/presentation-logs-${presId}-${timestamp}`;
  const socketPath = `/tmp/presentation-${presId}-${timestamp}.sock`;

  // Create log directory
  mkdirSync(logDir, { recursive: true });
  writeFileSync(`${logDir}/tutor-commands.json`, JSON.stringify({ commands: [] }, null, 2));

  // Write VTA config to a file (avoids JSON escaping issues in shell)
  const configPath = `${logDir}/vta-config.json`;
  writeFileSync(configPath, JSON.stringify({ module }, null, 2));

  // Initialize presentation state with full slide info for Tutor
  const stateWriter = createPresentationStateWriter({
    logDir,
    onLog: (msg) => console.log(`[state] ${msg}`),
    onError: (err) => console.error(`[state] ${err.message}`),
  });

  const interactivePresentation: InteractivePresentation = {
    title: module.title,
    description: module.description,
    type: "interactive-presentation",
    slides: module.steps.map((step) => ({
      id: step.id,
      title: step.title,
      content: { instructions: step.content.instructions || "" },
      narration: {
        segments: step.content.narrationSegments || [],
      },
    })),
  };

  stateWriter.initialize(interactivePresentation, socketPath);

  // Also write full presentation info for Tutor reference
  writeFileSync(`${logDir}/presentation-full.json`, JSON.stringify(interactivePresentation, null, 2));

  // Tutor workspace setup
  const tutorWorkspace = `/tmp/presentation-tutor-${presId}-${timestamp}`;
  mkdirSync(tutorWorkspace, { recursive: true });

  // Create .claude directory for settings
  const claudeDir = join(tutorWorkspace, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  // Create settings.local.json with permissions
  const settingsPath = join(claudeDir, "settings.local.json");
  const settings = {
    model: "haiku",
    permissions: {
      allow: [
        "Read(/tmp/**)",
        "Write(/tmp/**)",
        "Bash(cat:*)",
        "Bash(echo:*)",
      ],
    },
  };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  // Generate tutor CLAUDE.md with full presentation content
  const tutorPrompt = generatePresentingTutorPrompt({
    presentation: interactivePresentation,
    logDir,
  });
  writeFileSync(join(tutorWorkspace, "CLAUDE.md"), tutorPrompt);

  // Check if we're in tmux
  const inTmux = !!process.env.TMUX;

  // VTA command - read config from file to avoid escaping issues
  const vtaCmd = `bun run src/cli.ts show vta --config "$(cat ${configPath})" --socket ${socketPath} --scenario interactive-presentation --log-dir ${logDir}`;

  // Layout: Claude Code (left) | VTA (right)
  const tutorWidth = 100 - tutorHeight; // Convert height % to width % for right pane

  if (!inTmux) {
    // Create new tmux session with Claude Code (tutor) first
    spawnSync("tmux", [
      "new-session",
      "-d",
      "-s", sessionName,
      "-x", "180",
      "-y", "50",
      "-c", tutorWorkspace,
    ]);

    await sleep(100);

    // Start Claude Code in the left pane
    spawnSync("tmux", [
      "send-keys",
      "-t", sessionName,
      "claude",
      "Enter",
    ]);

    await sleep(300);

    // Split horizontally for VTA on the right
    spawnSync("tmux", [
      "split-window",
      "-t", sessionName,
      "-h",
      "-p", String(tutorWidth),
      "-c", basePath,
    ]);

    await sleep(100);

    // Send VTA command to the right pane
    spawnSync("tmux", [
      "send-keys",
      "-t", `${sessionName}:0.1`,
      vtaCmd,
      "Enter",
    ]);

    // Select the VTA pane (right)
    spawnSync("tmux", ["select-pane", "-t", `${sessionName}:0.1`]);

    // Start watcher before attaching
    startWatcher(basePath, logDir, socketPath, `${sessionName}:0.0`);

    // Attach to session
    spawnSync("tmux", ["attach-session", "-t", sessionName], {
      stdio: "inherit",
    });
  } else {
    // Already in tmux - create new window with Claude Code
    spawnSync("tmux", [
      "new-window",
      "-n", `pres-${presId}`,
      "-c", tutorWorkspace,
    ]);

    await sleep(100);

    // Start Claude Code in the left pane
    spawnSync("tmux", [
      "send-keys",
      "claude",
      "Enter",
    ]);

    await sleep(300);

    // Split horizontally for VTA on the right
    spawnSync("tmux", [
      "split-window",
      "-h",
      "-p", String(tutorWidth),
      "-c", basePath,
    ]);

    await sleep(100);

    // Send VTA command to the right pane
    spawnSync("tmux", [
      "send-keys",
      vtaCmd,
      "Enter",
    ]);

    // VTA pane is already selected (it's the new split)

    // Start watcher
    startWatcher(basePath, logDir, socketPath, `${sessionName}:0.0`);
  }

  return {
    sessionName,
    logDir,
    socketPath,
  };
}

function startWatcher(basePath: string, logDir: string, socketPath: string, tmuxTarget: string): void {
  const watcherProcess = spawn(
    "bun",
    ["run", `${basePath}/src/presentation/watcher.ts`, logDir, socketPath, tmuxTarget],
    {
      detached: true,
      stdio: "ignore",
    }
  );
  if (watcherProcess.pid) {
    writeFileSync(join(logDir, "watcher.pid"), String(watcherProcess.pid));
  }
  watcherProcess.unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PresentingTutorPromptOptions {
  presentation: InteractivePresentation;
  logDir: string;
}

function generatePresentingTutorPrompt(options: PresentingTutorPromptOptions): string {
  const { presentation, logDir } = options;

  // Build slide reference for the Tutor
  const slideReference = presentation.slides.map((slide, idx) => {
    const segments = slide.narration.segments
      .map((seg, segIdx) => `    ${segIdx}: "${seg.text}"`)
      .join("\n");
    return `### Slide ${idx + 1}: ${slide.title}
Segments:
${segments || "    (no segments)"}`;
  }).join("\n\n");

  return `# Presentation Mode

You are presenting "${presentation.title}" to the user.

## IMPORTANT: Always Check Current State First!

Before responding, read the current state:
\`\`\`bash
cat ${logDir}/presentation-state.json
\`\`\`

This shows you:
- \`slideNumber\`: Which slide the user is viewing (1, 2, 3, etc.)
- \`currentSlide.title\`: The title of the current slide
- \`mode\`: "guided" or "browse"
- \`highlightedSegment\`: Currently highlighted segment (or null)

**IMPORTANT: Always check slideNumber to know which slide the user sees!**

## Slide Reference

${slideReference}

## How to Highlight a Segment

Write a command to highlight segment N on the current slide:
\`\`\`bash
cat > ${logDir}/tutor-commands.json << EOF
{
  "commands": [
    {
      "id": "cmd-\$RANDOM-\$(date +%s)",
      "timestamp": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "type": "highlight",
      "payload": { "segmentIndex": 0 }
    }
  ]
}
EOF
\`\`\`

Change \`segmentIndex\` to highlight different segments (0, 1, 2, etc.)

## How to Navigate Slides

**Next slide:**
\`\`\`bash
cat > ${logDir}/tutor-commands.json << EOF
{
  "commands": [
    {
      "id": "nav-next-\$RANDOM-\$(date +%s)",
      "timestamp": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "type": "nextSlide"
    }
  ]
}
EOF
\`\`\`

**Previous slide:**
\`\`\`bash
cat > ${logDir}/tutor-commands.json << EOF
{
  "commands": [
    {
      "id": "nav-prev-\$RANDOM-\$(date +%s)",
      "timestamp": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "type": "previousSlide"
    }
  ]
}
EOF
\`\`\`

**Go to specific slide (0-indexed):**
\`\`\`bash
cat > ${logDir}/tutor-commands.json << EOF
{
  "commands": [
    {
      "id": "nav-goto-\$RANDOM-\$(date +%s)",
      "timestamp": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "type": "navigateToSlide",
      "payload": { "slideIndex": 2 }
    }
  ]
}
EOF
\`\`\`

## Your Role

**In GUIDED mode** (mode="guided"):
1. Read the state file to see which slide they're on
2. Narrate the slide content conversationally
3. Highlight each segment as you discuss it
4. Ask if they have questions before moving on

**In BROWSE mode** (mode="browse"):
- User is navigating freely - be quiet unless asked
- Answer questions about the current slide if asked

## Events You Will Receive

The system will send you events when the user interacts with the presentation:

- \`PRESENTATION:SLIDE_CHANGED to N\` - User navigated to slide N
- \`PRESENTATION:MODE_CHANGED to guided\` - User pressed 'g' to enter guided mode
- \`PRESENTATION:MODE_CHANGED to browse\` - User started navigating (browse mode)

**When you receive an event**, read the state file and respond appropriately:
- On SLIDE_CHANGED: describe the new slide
- On MODE_CHANGED to guided: start narrating the current slide
- On MODE_CHANGED to browse: acknowledge and wait for questions

## Getting Started

When the user starts, read the state file and begin narrating the first slide!
`;
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const presentationPath = args[0];

  if (!presentationPath) {
    console.error("Usage: bun run spawn.ts <presentation.yaml>");
    process.exit(1);
  }

  console.log(`Starting interactive presentation: ${presentationPath}`);
  const result = await spawnInteractivePresentation({ presentationPath });
  console.log("Presentation started:");
  console.log(`  Session: ${result.sessionName}`);
  console.log(`  Logs: ${result.logDir}`);
  console.log(`  Socket: ${result.socketPath}`);
}

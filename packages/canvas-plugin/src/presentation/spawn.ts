// Interactive Presentation Spawner
// Sets up tmux with VTA on top and Claude Code tutor below
// Pattern follows lab/spawn.ts

import { spawnSync, spawn } from "child_process";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { dirname, resolve, join, basename } from "path";
import { loadPresentationFromFile, loadPresentation, isInteractivePresentation, isInteractivePresentationById } from "./loader";
import { createPresentationStateWriter } from "../lab/tutor-control/presentation-state";
import type { InteractivePresentation, InteractiveSlide, NarrationSegment } from "./types";
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
  const logDir = `/tmp/presentation-logs-${presId}-${Date.now()}`;
  const socketPath = `/tmp/presentation-${presId}-${Date.now()}.sock`;

  // Create log directory and files
  mkdirSync(logDir, { recursive: true });
  writeFileSync(`${logDir}/tutor-commands.json`, JSON.stringify({ commands: [] }, null, 2));

  // Initialize presentation state
  const stateWriter = createPresentationStateWriter({
    logDir,
    onLog: (msg) => console.log(`[state] ${msg}`),
    onError: (err) => console.error(`[state] ${err.message}`),
  });

  // Convert module to interactive presentation format for state
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

  // Check if we're in tmux
  const inTmux = !!process.env.TMUX;

  // VTA command with interactive-presentation scenario
  const vtaConfig = JSON.stringify({ module });
  const vtaCmd = `cd ${basePath} && bun run src/cli.ts show vta --config '${vtaConfig}' --socket ${socketPath} --scenario interactive-presentation`;

  // Tutor workspace setup
  const tutorWorkspace = `/tmp/presentation-tutor-${presId}-${Date.now()}`;
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
        "Read(//tmp/**)",
        "Write(//tmp/**)",
        "Glob(//tmp/**)",
        "Bash(ls:*)",
        "Bash(cat:*)",
      ],
    },
  };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  // Generate tutor CLAUDE.md
  const tutorPrompt = generatePresentingTutorPrompt({
    presentationTitle: module.title,
    logDir,
    slideCount: module.steps.length,
  });
  writeFileSync(join(tutorWorkspace, "CLAUDE.md"), tutorPrompt);

  // Layout:
  // ┌─────────────────────────────────────────┐
  // │  VTA Canvas (60% height)                │
  // ├─────────────────────────────────────────┤
  // │  Claude Code (Tutor)  (40% height)      │
  // └─────────────────────────────────────────┘

  const vtaHeightPct = 100 - tutorHeight;

  if (!inTmux) {
    // Create new tmux session with VTA
    spawnSync("tmux", [
      "new-session",
      "-d",
      "-s", sessionName,
      "-x", "200",
      "-y", "50",
      vtaCmd,
    ]);

    await sleep(200);

    // Split vertically for Claude Code tutor
    spawnSync("tmux", [
      "split-window",
      "-t", sessionName,
      "-v",
      "-p", String(tutorHeight),
      "-c", tutorWorkspace,
      "claude",
    ]);

    // Select the VTA pane (top)
    spawnSync("tmux", ["select-pane", "-t", `${sessionName}:0.0`]);

    // Attach to session
    spawnSync("tmux", ["attach-session", "-t", sessionName], {
      stdio: "inherit",
    });
  } else {
    // Already in tmux - create new window
    spawnSync("tmux", [
      "new-window",
      "-n", `pres-${presId}`,
      vtaCmd,
    ]);

    await sleep(200);

    // Split for tutor
    spawnSync("tmux", [
      "split-window",
      "-v",
      "-p", String(tutorHeight),
      "-c", tutorWorkspace,
      "claude",
    ]);

    // Select VTA pane (top)
    spawnSync("tmux", ["select-pane", "-U"]);
  }

  // Start presentation watcher (monitors tutor commands and sends to VTA via IPC)
  const watcherProcess = spawn(
    "bun",
    ["run", `${basePath}/src/presentation/watcher.ts`, logDir, socketPath],
    {
      detached: true,
      stdio: "ignore",
    }
  );
  if (watcherProcess.pid) {
    writeFileSync(join(logDir, "watcher.pid"), String(watcherProcess.pid));
  }
  watcherProcess.unref();

  return {
    sessionName,
    logDir,
    socketPath,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PresentingTutorPromptOptions {
  presentationTitle: string;
  logDir: string;
  slideCount: number;
}

function generatePresentingTutorPrompt(options: PresentingTutorPromptOptions): string {
  const { presentationTitle, logDir, slideCount } = options;

  return `# Presentation Mode

You are presenting "${presentationTitle}" to the user.

## State File

Watch this file for current presentation state:
\`${logDir}/presentation-state.json\`

The state includes:
- \`currentSlide\`: The slide being displayed
- \`slideIndex\`: Current slide number (0-indexed)
- \`totalSlides\`: Total number of slides (${slideCount})
- \`mode\`: Either "guided" or "browse"
- \`highlightedSegment\`: Currently highlighted segment index (null if none)
- \`slidesViewed\`: Array of slide IDs the user has seen

## Modes

### GUIDED mode (user pressed 'e' or 'g')

When in guided mode:
1. Read the current slide from the state file
2. Narrate the content conversationally - don't just read it verbatim
3. To highlight a segment, write a command to tutor-commands.json:
   \`\`\`json
   {
     "commands": [
       {
         "id": "cmd-1",
         "timestamp": "2024-01-15T10:30:00Z",
         "type": "highlight",
         "payload": { "segmentIndex": 0 }
       }
     ]
   }
   \`\`\`
4. After explaining a slide, invite questions: "Any questions about this?"
5. When the user says "continue", "next", or similar, advance to next segment or slide

### BROWSE mode (user navigated with arrows)

When in browse mode:
- The user is navigating freely - stay quiet unless asked
- Answer questions about the current slide if asked
- When user presses 'e' or 'g', switch back to guided narration

## Commands

Write commands to \`${logDir}/tutor-commands.json\`:

**Highlight a segment:**
\`\`\`json
{ "type": "highlight", "payload": { "segmentIndex": N } }
\`\`\`

**Clear highlight:**
\`\`\`json
{ "type": "clearHighlight" }
\`\`\`

## Tips

- Be conversational, not robotic
- Add context beyond what's on the slide
- Pause after each major point for questions
- If the user seems confused, offer to explain differently
- Keep explanations concise - this is a presentation, not a lecture
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

// Presentation Watcher
// Monitors tutor-commands.json and sends highlight commands to VTA via IPC
// Also monitors presentation-state.json and notifies Claude via tmux when state changes
// Pattern follows lab/tutor-watcher.ts

import { existsSync, readFileSync, watch, statSync, writeFileSync } from "fs";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { PresentationTutorCommand } from "./types";
import type { LabMessage } from "../ipc/types";

const execFileAsync = promisify(execFile);

interface TutorCommandsFile {
  commands: PresentationTutorCommand[];
}

async function main() {
  const [logDir, socketPath, tmuxTarget = ""] = process.argv.slice(2);

  if (!logDir || !socketPath) {
    console.error("Usage: watcher.ts <logDir> <socketPath> [tmuxTarget]");
    process.exit(1);
  }

  const commandsPath = join(logDir, "tutor-commands.json");
  const statePath = join(logDir, "presentation-state.json");

  console.log(`Presentation watcher starting...`);
  console.log(`  Commands file: ${commandsPath}`);
  console.log(`  State file: ${statePath}`);
  console.log(`  Socket: ${socketPath}`);
  console.log(`  Tmux target: ${tmuxTarget || "(none)"}`);

  // Track state file size for change detection
  let lastStateSize = existsSync(statePath) ? statSync(statePath).size : 0;
  let lastStateContent = existsSync(statePath) ? readFileSync(statePath, "utf-8") : "";

  // Send event to Claude Code via tmux
  async function sendToClaudeCode(message: string): Promise<void> {
    if (!tmuxTarget) {
      console.log(`No tmux target, skipping: ${message}`);
      return;
    }
    try {
      await execFileAsync("tmux", ["send-keys", "-t", tmuxTarget, "-l", message]);
      await execFileAsync("tmux", ["send-keys", "-t", tmuxTarget, "C-m"]);
      console.log(`Sent to Claude: ${message}`);
    } catch (err) {
      console.error(`Failed to send to Claude: ${err}`);
    }
  }

  // Check if state changed meaningfully (mode or slide)
  function checkStateChange(): void {
    if (!existsSync(statePath)) return;

    try {
      const newContent = readFileSync(statePath, "utf-8");
      if (newContent === lastStateContent) return;

      const oldState = lastStateContent ? JSON.parse(lastStateContent) : {};
      const newState = JSON.parse(newContent);

      lastStateContent = newContent;
      lastStateSize = statSync(statePath).size;

      // Check what changed
      if (oldState.slideNumber !== newState.slideNumber) {
        sendToClaudeCode(`PRESENTATION:SLIDE_CHANGED to ${newState.slideNumber}`);
      } else if (oldState.mode !== newState.mode) {
        sendToClaudeCode(`PRESENTATION:MODE_CHANGED to ${newState.mode}`);
      }
    } catch (err) {
      console.error(`Error checking state: ${err}`);
    }
  }

  // Track processed command IDs to avoid re-sending
  const processedCommands = new Set<string>();

  // Send message to VTA via IPC
  async function sendToVTA(message: LabMessage): Promise<void> {
    try {
      await Bun.connect({
        unix: socketPath,
        socket: {
          data() {},
          open(socket) {
            socket.write(JSON.stringify(message) + "\n");
            socket.end();
          },
          close() {},
          error(_, err) {
            console.error(`Socket error: ${err}`);
          },
        },
      });
    } catch (err) {
      console.error(`Failed to send to VTA: ${err}`);
    }
  }

  // Process new commands
  function processCommands() {
    if (!existsSync(commandsPath)) {
      return;
    }

    try {
      const content = readFileSync(commandsPath, "utf-8");
      const data: TutorCommandsFile = JSON.parse(content);

      if (!data.commands || !Array.isArray(data.commands)) {
        return;
      }

      for (const cmd of data.commands) {
        if (processedCommands.has(cmd.id)) {
          continue;
        }

        processedCommands.add(cmd.id);

        switch (cmd.type) {
          case "highlight":
            if (cmd.payload?.segmentIndex !== undefined) {
              sendToVTA({
                type: "highlight",
                segmentIndex: cmd.payload.segmentIndex,
              });
              console.log(`Sent highlight: segment ${cmd.payload.segmentIndex}`);
            }
            break;

          case "clearHighlight":
            sendToVTA({ type: "clearHighlight" });
            console.log(`Sent clearHighlight`);
            break;

          case "nextSlide":
            sendToVTA({ type: "nextSlide" });
            console.log(`Sent nextSlide`);
            break;

          case "previousSlide":
            sendToVTA({ type: "previousSlide" });
            console.log(`Sent previousSlide`);
            break;

          case "navigateToSlide":
            if (cmd.payload?.slideIndex !== undefined) {
              sendToVTA({
                type: "navigateToSlide",
                slideIndex: cmd.payload.slideIndex,
              });
              console.log(`Sent navigateToSlide: ${cmd.payload.slideIndex}`);
            }
            break;

          default:
            console.log(`Unknown command type: ${cmd.type}`);
        }
      }
    } catch (err) {
      console.error(`Error processing commands: ${err}`);
    }
  }

  // Initial check
  processCommands();

  // Watch for changes
  let commandsDebounce: ReturnType<typeof setTimeout> | null = null;
  let stateDebounce: ReturnType<typeof setTimeout> | null = null;

  watch(logDir, (event, filename) => {
    if (filename === "tutor-commands.json") {
      // Debounce to avoid processing multiple rapid changes
      if (commandsDebounce) {
        clearTimeout(commandsDebounce);
      }
      commandsDebounce = setTimeout(() => {
        processCommands();
        commandsDebounce = null;
      }, 100);
    } else if (filename === "presentation-state.json") {
      // Debounce state changes
      if (stateDebounce) {
        clearTimeout(stateDebounce);
      }
      stateDebounce = setTimeout(() => {
        checkStateChange();
        stateDebounce = null;
      }, 200);
    }
  });

  // Keep process alive
  console.log("Watcher running...");
  setInterval(() => {}, 1000);
}

main().catch(console.error);

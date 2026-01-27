// Presentation Watcher
// Monitors tutor-commands.json and sends highlight commands to VTA via IPC
// Pattern follows lab/tutor-watcher.ts

import { existsSync, readFileSync, watch, statSync, writeFileSync } from "fs";
import { join } from "path";
import type { PresentationTutorCommand } from "./types";
import type { LabMessage } from "../ipc/types";

interface TutorCommandsFile {
  commands: PresentationTutorCommand[];
}

async function main() {
  const [logDir, socketPath] = process.argv.slice(2);

  if (!logDir || !socketPath) {
    console.error("Usage: watcher.ts <logDir> <socketPath>");
    process.exit(1);
  }

  const commandsPath = join(logDir, "tutor-commands.json");

  console.log(`Presentation watcher starting...`);
  console.log(`  Commands file: ${commandsPath}`);
  console.log(`  Socket: ${socketPath}`);

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
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(logDir, (event, filename) => {
    if (filename === "tutor-commands.json") {
      // Debounce to avoid processing multiple rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        processCommands();
        debounceTimer = null;
      }, 100);
    }
  });

  // Keep process alive
  console.log("Watcher running...");
  setInterval(() => {}, 1000);
}

main().catch(console.error);

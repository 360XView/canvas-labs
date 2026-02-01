// Speech Watcher - Watches tutor-speech.jsonl and emits events to hub
// Captures tutor utterances from Claude Code Stop hooks for telemetry

import { watch, existsSync, statSync } from "fs";
import { open, FileHandle } from "fs/promises";
import { join } from "path";
import type { TutorUtteranceEvent } from "../telemetry/types";

export interface SpeechWatcherOptions {
  logDir: string;
  onUtterance: (event: TutorUtteranceEvent) => void;
  onError?: (error: Error) => void;
}

export async function startSpeechWatcher(
  options: SpeechWatcherOptions
): Promise<() => void> {
  const filePath = join(options.logDir, "tutor-speech.jsonl");
  let fileHandle: FileHandle | null = null;
  let position = 0;
  let closed = false;
  let lastSize = 0;

  // Read new lines from file
  async function readNewLines() {
    if (closed) return;

    // Check if file exists and has new content
    if (!existsSync(filePath)) return;

    try {
      const stats = statSync(filePath);
      if (stats.size <= lastSize) return; // No new content
      lastSize = stats.size;
    } catch {
      return;
    }

    // Open file if needed
    if (!fileHandle) {
      try {
        fileHandle = await open(filePath, "r");
      } catch {
        return; // File doesn't exist yet
      }
    }

    try {
      const buffer = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, position);

      if (bytesRead > 0) {
        position += bytesRead;
        const lines = buffer
          .slice(0, bytesRead)
          .toString()
          .split("\n")
          .filter(Boolean);

        for (const line of lines) {
          try {
            const event = JSON.parse(line) as TutorUtteranceEvent;
            options.onUtterance(event);
          } catch (e) {
            options.onError?.(new Error(`Failed to parse: ${line}`));
          }
        }
      }
    } catch (e) {
      options.onError?.(e as Error);
    }
  }

  // Watch file directly for changes (more reliable than watching directory)
  let watcher: ReturnType<typeof watch> | null = null;
  if (existsSync(filePath)) {
    watcher = watch(filePath, async (eventType) => {
      if (eventType === "change") {
        await readNewLines();
      }
    });
  }

  // Also watch directory in case file is created later
  const dirWatcher = watch(options.logDir, async (eventType, filename) => {
    // If the file was just created, start watching it
    if (filename === "tutor-speech.jsonl" && !watcher && existsSync(filePath)) {
      watcher = watch(filePath, async (eventType) => {
        if (eventType === "change") {
          await readNewLines();
        }
      });
    }
    // Also check for changes via directory watcher as backup
    if (filename === "tutor-speech.jsonl") {
      await readNewLines();
    }
  });

  // Polling fallback - check every 2 seconds (handles edge cases)
  const pollInterval = setInterval(async () => {
    await readNewLines();
  }, 2000);

  // Cleanup function
  return () => {
    closed = true;
    clearInterval(pollInterval);
    watcher?.close();
    dirWatcher.close();
    fileHandle?.close();
  };
}

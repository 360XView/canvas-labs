// Presentation State Writer
// Maintains presentation-state.json for tutor to read current presentation state
// Pattern follows state-writer.ts

import { writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  InteractivePresentation,
  InteractiveSlide,
  PresentationMode,
  PresentationState,
} from "../../presentation/types";

export interface PresentationStateWriterOptions {
  logDir: string;
  onLog?: (message: string) => void;
  onError?: (error: Error) => void;
}

export interface PresentationStateWriter {
  initialize: (presentation: InteractivePresentation, socketPath: string) => void;
  setSlide: (slideIndex: number) => void;
  setMode: (mode: PresentationMode) => void;
  setHighlight: (segmentIndex: number | null) => void;
  markSlideViewed: (slideId: string) => void;
  getState: () => PresentationState | null;
}

export function createPresentationStateWriter(
  options: PresentationStateWriterOptions
): PresentationStateWriter {
  const { logDir, onLog, onError } = options;
  const statePath = join(logDir, "presentation-state.json");

  // Keep presentation in memory for slide lookups
  let presentation: InteractivePresentation | null = null;

  const log = (msg: string) => onLog?.(msg);

  function readState(): PresentationState | null {
    try {
      if (!existsSync(statePath)) {
        return null;
      }
      const content = readFileSync(statePath, "utf-8").trim();
      if (!content) {
        return null;
      }
      return JSON.parse(content) as PresentationState;
    } catch (e) {
      onError?.(new Error(`Failed to read presentation-state.json: ${e}`));
      return null;
    }
  }

  function writeState(state: PresentationState): void {
    try {
      state.lastUpdated = new Date().toISOString();
      writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch (e) {
      onError?.(new Error(`Failed to write presentation-state.json: ${e}`));
    }
  }

  return {
    initialize(pres: InteractivePresentation, socketPath: string) {
      presentation = pres;

      const firstSlide = pres.slides[0];
      const state: PresentationState = {
        presentationId: pres.title.toLowerCase().replace(/\s+/g, "-"),
        socketPath,
        currentSlide: firstSlide,
        slideIndex: 0,
        slideNumber: 1, // Human-readable (1-indexed)
        totalSlides: pres.slides.length,
        mode: "guided",
        highlightedSegment: null,
        slidesViewed: [firstSlide.id],
        lastUpdated: new Date().toISOString(),
      };

      writeState(state);
      log(`Presentation state initialized: ${pres.title} (${pres.slides.length} slides)`);
    },

    setSlide(slideIndex: number) {
      const state = readState();
      if (!state || !presentation) {
        log(`Cannot set slide: state not initialized`);
        return;
      }

      if (slideIndex < 0 || slideIndex >= presentation.slides.length) {
        log(`Invalid slide index: ${slideIndex}`);
        return;
      }

      const slide = presentation.slides[slideIndex];
      state.slideIndex = slideIndex;
      state.slideNumber = slideIndex + 1; // Human-readable (1-indexed)
      state.currentSlide = slide;
      state.highlightedSegment = null; // Clear highlight on slide change

      // Mark slide as viewed if not already
      if (!state.slidesViewed.includes(slide.id)) {
        state.slidesViewed.push(slide.id);
      }

      writeState(state);
      log(`Slide changed to ${slideIndex + 1}/${presentation.slides.length}: ${slide.title}`);
    },

    setMode(mode: PresentationMode) {
      const state = readState();
      if (!state) {
        log(`Cannot set mode: state not initialized`);
        return;
      }

      if (state.mode !== mode) {
        state.mode = mode;
        writeState(state);
        log(`Mode changed to: ${mode}`);
      }
    },

    setHighlight(segmentIndex: number | null) {
      const state = readState();
      if (!state) {
        log(`Cannot set highlight: state not initialized`);
        return;
      }

      state.highlightedSegment = segmentIndex;
      writeState(state);

      if (segmentIndex !== null) {
        log(`Highlighting segment ${segmentIndex}`);
      } else {
        log(`Cleared highlight`);
      }
    },

    markSlideViewed(slideId: string) {
      const state = readState();
      if (!state) {
        log(`Cannot mark viewed: state not initialized`);
        return;
      }

      if (!state.slidesViewed.includes(slideId)) {
        state.slidesViewed.push(slideId);
        writeState(state);
        log(`Marked slide ${slideId} as viewed`);
      }
    },

    getState() {
      return readState();
    },
  };
}

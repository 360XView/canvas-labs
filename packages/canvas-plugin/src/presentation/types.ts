// Interactive Presentation Types
// For narrated, segment-highlighted presentations with Tutor integration

export interface NarrationSegment {
  id: number;
  type: "sentence" | "bullet" | "code";
  text: string;
}

export interface InteractiveSlide {
  id: string;
  title: string;
  content: { instructions: string };
  narration: { segments: NarrationSegment[] };
}

export interface InteractivePresentation {
  title: string;
  description?: string;
  type: "interactive-presentation";
  slides: InteractiveSlide[];
}

export type PresentationMode = "guided" | "browse";

export interface PresentationState {
  presentationId: string;
  socketPath: string;
  currentSlide: InteractiveSlide;
  slideIndex: number;
  slideNumber: number; // Human-readable (1-indexed)
  totalSlides: number;
  mode: PresentationMode;
  highlightedSegment: number | null;
  slidesViewed: string[];
  lastUpdated: string;
}

// Tutor command types (written to tutor-commands.json)
export interface PresentationTutorCommand {
  id: string;
  timestamp: string;
  type: "highlight" | "clearHighlight" | "nextSlide" | "previousSlide" | "navigateToSlide";
  payload?: {
    segmentIndex?: number;
    slideIndex?: number;
  };
}

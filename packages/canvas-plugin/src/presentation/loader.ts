// Presentation loader - loads YAML presentations and converts to VTA Module format

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { Module, Step } from "../canvases/vta/types";

interface YamlPresentation {
  title: string;
  description?: string;
  type: "presentation";
  slides: YamlSlide[];
}

interface YamlSlide {
  id: string;
  title: string;
  content: {
    instructions: string;
  };
  tryIt?: string;
}

/**
 * Get the path to the presentations directory
 */
export function getPresentationsPath(): string {
  const moduleDir = import.meta.dir;
  return path.resolve(moduleDir, "../../presentations");
}

/**
 * Discover all available presentation IDs
 */
export function discoverPresentations(): string[] {
  const presPath = getPresentationsPath();

  if (!fs.existsSync(presPath)) {
    return [];
  }

  const entries = fs.readdirSync(presPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".yaml"))
    .map((e) => e.name.replace(".yaml", ""))
    .sort();
}

/**
 * Load a presentation by ID and convert to VTA Module format
 */
export function loadPresentation(presentationId: string): Module {
  const presPath = getPresentationsPath();
  const yamlPath = path.join(presPath, `${presentationId}.yaml`);

  if (!fs.existsSync(yamlPath)) {
    const available = discoverPresentations();
    throw new Error(
      `Presentation not found: '${presentationId}'\n` +
        `Available: ${available.join(", ") || "(none)"}`
    );
  }

  const content = fs.readFileSync(yamlPath, "utf-8");
  const parsed = yaml.load(content) as YamlPresentation;

  if (!parsed || parsed.type !== "presentation") {
    throw new Error(`Invalid presentation format in ${yamlPath}`);
  }

  // Convert slides to VTA steps
  const steps: Step[] = parsed.slides.map((slide) => ({
    id: slide.id,
    title: slide.title,
    type: "slide" as const,
    content: {
      instructions: slide.content.instructions,
      tryIt: slide.tryIt,
    },
    completed: false,
  }));

  return {
    id: presentationId,
    title: parsed.title,
    description: parsed.description,
    steps,
  };
}

/**
 * Load a presentation from a specific file path
 */
export function loadPresentationFromFile(filePath: string): Module {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Presentation file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const parsed = yaml.load(content) as YamlPresentation;

  if (!parsed || parsed.type !== "presentation") {
    throw new Error(`Invalid presentation format in ${absolutePath}`);
  }

  // Derive ID from filename
  const id = path.basename(absolutePath, ".yaml");

  // Convert slides to VTA steps
  const steps: Step[] = parsed.slides.map((slide) => ({
    id: slide.id,
    title: slide.title,
    type: "slide" as const,
    content: {
      instructions: slide.content.instructions,
      tryIt: slide.tryIt,
    },
    completed: false,
  }));

  return {
    id,
    title: parsed.title,
    description: parsed.description,
    steps,
  };
}

/**
 * List all presentations with metadata
 */
export function listPresentations(): Array<{
  id: string;
  title: string;
  description?: string;
  slideCount: number;
}> {
  const ids = discoverPresentations();
  return ids.map((id) => {
    try {
      const pres = loadPresentation(id);
      return {
        id,
        title: pres.title,
        description: pres.description,
        slideCount: pres.steps.length,
      };
    } catch {
      return {
        id,
        title: "(Error loading)",
        slideCount: 0,
      };
    }
  });
}

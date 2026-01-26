/**
 * TUI Testing Framework - Adapter System
 *
 * Exports the adapter interface and implementations for integrating
 * different TUI applications with the testing framework.
 */

// Export the interface
export * from "./adapter-interface";

// Export adapter implementations
export { CanvasAdapter, createCanvasAdapter } from "./canvas-adapter";
export { GenericAdapter, createGenericAdapter } from "./generic-adapter";

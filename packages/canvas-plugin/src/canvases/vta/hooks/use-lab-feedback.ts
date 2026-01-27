// Hook for receiving lab feedback via IPC
// Listens for taskCompleted messages from the monitor

import { useState, useEffect, useCallback } from "react";
import { existsSync, unlinkSync } from "fs";
import type { LabMessage, DynamicStep } from "../../../ipc/types";

export interface DebugEvent {
  timestamp: Date;
  type: "connected" | "disconnected" | "message" | "error";
  data?: LabMessage | string;
}

export interface LabFeedbackState {
  connected: boolean;
  stale: boolean; // True if no ping received for 10 seconds
  status: "starting" | "running" | "stopped" | "error";
  message?: string;
  completedSteps: Set<string>;
  // Debug state
  events: DebugEvent[];
  lastCompletion?: { stepId: string; source: string; timestamp: Date };
  // Send function to communicate back to monitor
  sendMessage: (msg: LabMessage) => void;
}

export interface UseLabFeedbackOptions {
  socketPath: string;
  onTaskCompleted?: (stepId: string, taskId: string) => void;
  onStatusChange?: (status: "running" | "stopped", message?: string) => void;
  onAddDynamicStep?: (step: DynamicStep, afterStepId?: string) => void;
  // Interactive presentation callbacks
  onHighlight?: (segmentIndex: number) => void;
  onClearHighlight?: () => void;
  onNextSlide?: () => void;
  onPreviousSlide?: () => void;
  onNavigateToSlide?: (slideIndex: number) => void;
}

export function useLabFeedback(options: UseLabFeedbackOptions | null) {
  // Track connected client sockets for bidirectional communication
  const [connectedSockets, setConnectedSockets] = useState<Set<{ write: (data: string) => void }>>(new Set());

  // Send function that writes to all connected clients
  const sendMessage = useCallback((msg: LabMessage) => {
    const data = JSON.stringify(msg) + "\n";
    connectedSockets.forEach((socket) => {
      try {
        socket.write(data);
      } catch (e) {
        // Socket may have disconnected
      }
    });
  }, [connectedSockets]);

  const [state, setState] = useState<LabFeedbackState>({
    connected: false,
    stale: false,
    status: "starting",
    completedSteps: new Set(),
    events: [],
    sendMessage: () => {}, // Will be updated when sockets connect
  });

  // Update sendMessage in state when it changes
  useEffect(() => {
    setState((prev) => ({ ...prev, sendMessage }));
  }, [sendMessage]);

  const addEvent = useCallback((event: Omit<DebugEvent, "timestamp">) => {
    setState((prev) => ({
      ...prev,
      events: [...prev.events.slice(-49), { ...event, timestamp: new Date() }],
    }));
  }, []);

  const handleMessage = useCallback(
    (msg: LabMessage) => {
      addEvent({ type: "message", data: msg });

      if (msg.type === "ping") {
        // Heartbeat received - connection is alive
        setState((prev) => ({
          ...prev,
          stale: false,
        }));
      } else if (msg.type === "taskCompleted") {
        const completion = {
          stepId: msg.stepId,
          source: msg.source || "unknown",
          timestamp: new Date(),
        };
        setState((prev) => ({
          ...prev,
          completedSteps: new Set([...prev.completedSteps, msg.stepId]),
          lastCompletion: completion,
        }));
        options?.onTaskCompleted?.(msg.stepId, msg.taskId);
      } else if (msg.type === "labStatus") {
        setState((prev) => ({
          ...prev,
          status: msg.status,
          message: msg.message,
        }));
        options?.onStatusChange?.(msg.status, msg.message);
      } else if (msg.type === "addDynamicStep") {
        options?.onAddDynamicStep?.(msg.step, msg.afterStepId);
      } else if (msg.type === "highlight") {
        options?.onHighlight?.(msg.segmentIndex);
      } else if (msg.type === "clearHighlight") {
        options?.onClearHighlight?.();
      } else if (msg.type === "nextSlide") {
        options?.onNextSlide?.();
      } else if (msg.type === "previousSlide") {
        options?.onPreviousSlide?.();
      } else if (msg.type === "navigateToSlide") {
        options?.onNavigateToSlide?.(msg.slideIndex);
      }
    },
    [options, addEvent]
  );

  useEffect(() => {
    if (!options?.socketPath) {
      return;
    }

    const { socketPath } = options;
    let server: ReturnType<typeof Bun.listen> | null = null;
    let buffer = "";
    let staleTimeout: ReturnType<typeof setTimeout> | null = null;

    // Function to reset the stale connection timeout
    const resetStaleTimeout = () => {
      if (staleTimeout) {
        clearTimeout(staleTimeout);
      }
      staleTimeout = setTimeout(() => {
        // No ping received for 10 seconds - mark as stale
        setState((prev) => ({
          ...prev,
          stale: true,
        }));
      }, 10000);
    };

    // Remove existing socket if present
    if (existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch (e) {
        // Ignore
      }
    }

    // Create IPC server to receive messages from monitor
    server = Bun.listen({
      unix: socketPath,
      socket: {
        open(socket) {
          // Track this socket for bidirectional communication
          setConnectedSockets((prev) => new Set([...prev, socket]));
          setState((prev) => ({
            ...prev,
            connected: true,
            stale: false,
            events: [...prev.events.slice(-49), { type: "connected", timestamp: new Date() }],
          }));
          resetStaleTimeout();
        },

        data(socket, data) {
          buffer += data.toString();

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                const msg = JSON.parse(line) as LabMessage;
                // Reset stale timeout on any message (especially pings)
                if (msg.type === "ping") {
                  resetStaleTimeout();
                }
                handleMessage(msg);
              } catch (e) {
                // Log parse errors to debug events
                setState((prev) => ({
                  ...prev,
                  events: [...prev.events.slice(-49), { type: "error", data: `Parse error: ${e}`, timestamp: new Date() }],
                }));
              }
            }
          }
        },

        close(socket) {
          // Remove socket from tracked set
          setConnectedSockets((prev) => {
            const next = new Set([...prev]);
            next.delete(socket);
            return next;
          });
          if (staleTimeout) {
            clearTimeout(staleTimeout);
            staleTimeout = null;
          }
          setState((prev) => ({
            ...prev,
            connected: prev.connected && connectedSockets.size > 1, // Still connected if other sockets exist
            stale: false,
            events: [...prev.events.slice(-49), { type: "disconnected", timestamp: new Date() }],
          }));
        },

        error(socket, err) {
          setState((prev) => ({
            ...prev,
            events: [...prev.events.slice(-49), { type: "error", data: `Socket error: ${err}`, timestamp: new Date() }],
          }));
        },
      },
    });

    return () => {
      if (staleTimeout) {
        clearTimeout(staleTimeout);
      }
      if (server) {
        server.stop();
      }
      if (existsSync(socketPath)) {
        try {
          unlinkSync(socketPath);
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [options?.socketPath, handleMessage]);

  return state;
}

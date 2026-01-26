// Event Hub Factory
// Creates Event Hub with appropriate adapter based on lab type

import type { LabType } from "../telemetry/types";
import { createEventHub, type EventHub, type EventHubOptions } from "./hub";
import { createLinuxCliAdapter } from "../adapters/linux-cli-adapter";
import { createSplunkAdapter } from "../adapters/splunk-adapter";
import { createPythonAdapter } from "../adapters/python-adapter";
import type { LabAdapter } from "../adapters/types";

/**
 * Options for creating an Event Hub for a specific lab type
 */
export interface CreateEventHubForLabOptions extends Omit<EventHubOptions, "adapter"> {
  labType?: LabType;  // Defaults to "linux_cli"
  logPath?: string;  // Path to commands.log (Linux CLI specific)
  checksLogPath?: string;  // Path to checks.log (Linux CLI specific)
}

/**
 * Factory function: Create Event Hub with appropriate adapter
 */
export function createEventHubForLab(options: CreateEventHubForLabOptions): EventHub {
  const labType = options.labType ?? "linux_cli";
  const { moduleId, logDir, socketPath, studentId, onTaskCompleted, onError, onLog, logPath } = options;

  let adapter: LabAdapter;

  switch (labType) {
    case "linux_cli":
      adapter = createLinuxCliAdapter({
        moduleId,
        logPath: logPath ?? `${logDir}/commands.log`,
        checksLogPath: options.checksLogPath,
        onLog,
        onError,
      });
      break;

    case "splunk":
      adapter = createSplunkAdapter({
        moduleId,
        logPath: options.logDir,
        onLog,
        onError,
      });
      break;

    case "python":
      adapter = createPythonAdapter({
        moduleId,
        logPath: options.logDir,
        onLog,
        onError,
      });
      break;

    default:
      throw new Error(`Unsupported lab type: ${labType}`);
  }

  return createEventHub({
    adapter,
    socketPath,
    logDir,
    moduleId,
    studentId,
    onTaskCompleted,
    onError,
    onLog,
  });
}

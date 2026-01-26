# TUI Testing Framework

A modular, generic framework for automated terminal UI (TUI) testing. Built from Canvas testing infrastructure and designed for reuse across any project that needs to test terminal applications.

## Project Structure

```
tui-testing/
├── core/                          # Generic core modules (Phase 1)
│   ├── tmux-controller.ts         # Generic tmux CLI abstraction
│   ├── reporter.ts                # Generic test result reporting
│   ├── index.ts                   # Core module exports
│   ├── package.json               # Package metadata
│   ├── tsconfig.json              # TypeScript configuration
│   └── README.md                  # Core module documentation
│
├── adapters/                      # Framework-specific adapters (Phase 2)
│   ├── canvas/                    # Canvas lab adapter
│   ├── splunk/                    # Splunk adapter
│   └── python/                    # Python adapter
│
├── state/                         # State observer pattern (Phase 3)
│   ├── observer.ts                # Generic observer interface
│   ├── canvas-observer.ts         # Canvas implementation
│   └── example-observer.ts        # Example custom implementation
│
├── runner/                        # Generic test runner (Phase 4)
│   ├── test-runner.ts             # Core test execution engine
│   └── test-plan.ts               # Test plan definition
│
├── agent/                         # AI-driven testing agent (Phase 5)
│   ├── tui-agent.ts               # Main agent implementation
│   └── task-detector.ts           # Automatic task detection
│
├── PHASE_1_SUMMARY.md             # Phase 1 completion report
├── EXTRACTION_MANIFEST.md         # Detailed extraction tracking
└── README.md                      # This file
```

## Phases

### Phase 1: Extract Generic Core (COMPLETED)
Extract reusable components from Canvas tests-poc POC.
- ✓ TmuxController - Generic tmux abstraction (158 lines)
- ✓ TestLogger/Reporter - Generic test reporting (160 lines)
- ✓ Documentation and configuration

### Phase 2: Build Adapter System (IN PROGRESS)
Create framework-specific adapters following a common interface.
- [ ] Adapter interface definition
- [ ] Canvas-specific adapter
- [ ] Splunk adapter stub
- [ ] Python adapter stub

### Phase 3: Build State Observer Layer
Create pluggable state observers for different application types.
- [ ] Generic observer interface
- [ ] Canvas state observer
- [ ] Extensible observer pattern

### Phase 4: Build Generic Test Runner
Refactor Canvas runner into a generic test execution engine.
- [ ] Generic test runner
- [ ] Test plan DSL
- [ ] Pluggable adapters and observers

### Phase 5: Build TUI Tester Agent
Integrate with Claude to create an AI-driven testing agent.
- [ ] Agent core
- [ ] Automatic task detection
- [ ] Feedback-driven testing

## Core Module

The `core/` directory contains the foundation:

### TmuxController
```typescript
import { TmuxController } from "@tui-testing/core";

// Send command to a tmux pane
await TmuxController.sendCommand("session:0.0", "npm test");

// Wait for text
const found = await TmuxController.waitForText(
  "session:0.0",
  "Tests passed",
  30000
);

// Capture pane content
const content = await TmuxController.capturePane("session:0.0");
```

### TestLogger/Reporter
```typescript
import { TestLogger, saveMarkdownReport } from "@tui-testing/core";

const logger = new TestLogger();

logger.logSuccess("Setup", 500);
logger.logSuccess("Run tests", 5000);
logger.logFailure("Verify", 100, "Expected text not found");

const report = logger.getReport("My Test");
await saveMarkdownReport(report, "./test-report.md");
```

## Getting Started

### Using Phase 1 (Current)

Copy the core module to your project:
```bash
cp -r tui-testing/core your-project/src/lib/
```

Or reference it as a package:
```json
{
  "imports": {
    "@tui-testing/core": "./src/lib/tui-testing/core"
  }
}
```

### Requirements
- Node.js 18+
- TypeScript 4.7+
- tmux (for pane interaction)

## Documentation

- **Phase 1 Complete:** See `PHASE_1_SUMMARY.md`
- **Extraction Details:** See `EXTRACTION_MANIFEST.md`
- **Core API Reference:** See `core/README.md`

## Quality Metrics

- **Generic Code:** 318 lines extracted from tests-poc
- **Canvas-Specific Code:** ZERO in core module
- **Framework Dependencies:** ZERO (Node.js stdlib only)
- **TypeScript Coverage:** 100%
- **Documentation:** Comprehensive with examples

## Architecture

### Layered Design

```
┌─────────────────────────────────────┐
│  Phase 5: TUI Testing Agent         │  AI-driven testing with feedback
├─────────────────────────────────────┤
│  Phase 4: Generic Test Runner       │  Framework-agnostic execution
├─────────────────────────────────────┤
│  Phase 3: State Observer Pattern    │  Pluggable state monitoring
├─────────────────────────────────────┤
│  Phase 2: Adapter System            │  Framework-specific implementations
├─────────────────────────────────────┤
│  Phase 1: Generic Core              │  TmuxController + Reporter
├─────────────────────────────────────┤
│  Node.js Standard Library           │  child_process, util, fs/promises
└─────────────────────────────────────┘
```

### Design Principles

1. **Generic First** - Core components have zero framework dependencies
2. **Pluggable** - Adapters and observers follow interfaces
3. **Composable** - Each phase builds on previous layers
4. **Well-Documented** - Complete README and API docs

## Contributing

To add support for a new framework:

1. **Phase 2:** Create an adapter implementing the `LabAdapter` interface
2. **Phase 3:** Optionally create a state observer for your app
3. **Phase 4:** Generic runner will work with your adapter automatically

## Project Status

- **Phase 1:** Completed
- **Phase 2:** Ready to start (core foundation in place)
- **Phases 3-5:** Design documented, implementation pending

## License

MIT (or your project's license)

## Related

- **Canvas:** Main teaching assistant framework
- **tests-poc:** Original POC with tmux testing code
- **vscode-canvas-extension:** VS Code integration

---

*Last Updated: Phase 1 Completion*
*Next: Phase 2 - Build Adapter System*

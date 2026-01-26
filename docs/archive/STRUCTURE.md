# TUI Testing Framework - Project Structure

Complete documentation of all files, directories, and their purposes.

---

## Directory Tree

```
/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/
│
├── core/                                    # PHASE 1: Generic Core Modules
│   ├── src/
│   │   ├── tmux-controller.ts              # Tmux process/pane abstraction
│   │   ├── reporter.ts                     # Test report generation (HTML/Markdown)
│   │   ├── state-observer.ts               # State monitoring conditions
│   │   ├── tui-test-runner.ts              # Core test execution engine
│   │   └── index.ts                        # Package exports
│   ├── dist/                               # Compiled JavaScript output
│   ├── tests/                              # Core module tests
│   ├── package.json                        # Npm package metadata
│   ├── tsconfig.json                       # TypeScript configuration
│   ├── README.md                           # Core module documentation
│   └── LICENSE                             # MIT license
│
├── adapters/                               # PHASE 2: Application Adapters
│   ├── src/
│   │   ├── adapter-interface.ts            # LabAdapter interface contract
│   │   ├── canvas-adapter.ts               # Canvas vTA implementation
│   │   ├── generic-adapter.ts              # Generic CLI app support
│   │   └── index.ts                        # Adapter factory & exports
│   ├── tests/
│   │   ├── canvas-adapter.test.ts          # Canvas adapter tests
│   │   ├── generic-adapter.test.ts         # Generic adapter tests
│   │   └── adapter-factory.test.ts         # Factory tests
│   ├── tsconfig.json                       # TypeScript configuration
│   └── README.md                           # Adapter development guide
│
├── agents/                                 # PHASE 5: Agent Implementation
│   ├── tui-tester-agent.ts                 # Main agent (NL → TypeScript code)
│   ├── manifest.yaml                       # Claude Code agent registration
│   ├── tui-tester-agent.test.ts            # Agent tests
│   ├── index.ts                            # Agent exports
│   └── tsconfig.json                       # TypeScript configuration
│
├── examples/                               # PHASE 6: Working Examples
│   ├── simple-menu.ts                      # Example: Simple menu TUI app
│   ├── simple-menu-test.ts                 # Example: Test the menu app
│   ├── canvas-vta-test.ts                  # Example: Test Canvas vTA
│   ├── README.md                           # Examples documentation
│   └── tsconfig.json                       # TypeScript configuration
│
├── docs/                                   # PHASE 7: Comprehensive Documentation
│   ├── GETTING_STARTED.md                  # Step-by-step for new users
│   ├── API_REFERENCE.md                    # Complete type documentation
│   ├── ARCHITECTURE.md                     # Deep technical reference
│   ├── ADAPTER_GUIDE.md                    # How to create custom adapters
│   ├── DEVELOPMENT.md                      # Contributor guidelines
│   ├── ROADMAP.md                          # Future enhancements
│   └── TROUBLESHOOTING.md                  # Common issues & solutions
│
├── README.md                               # Main overview (Phase 7)
├── README_PHASE7.md                        # Comprehensive Phase 7 documentation
├── STRUCTURE.md                            # This file - project structure guide
├── QUICK_START.md                          # 5-minute quick start
├── package.json                            # Root workspace package
├── tsconfig.json                           # Root TypeScript configuration
├── .gitignore                              # Git ignore patterns
├── .git/                                   # Git repository
└── Phase completion reports                # Phase 1-6 documentation

```

---

## File Purposes

### Core Module (`core/`)

The foundation layer providing reusable terminal testing infrastructure.

#### `core/src/tmux-controller.ts` (158 lines)
**Purpose**: Generic tmux CLI wrapper

**Key Functions**:
- `sendCommand(pane, cmd)`: Execute command in pane
- `sendKeys(pane, keys)`: Send keyboard input
- `waitForText(pane, pattern, timeout)`: Wait for text to appear
- `capturePane(pane)`: Get current pane content
- `createSession(name)`: Create new tmux session
- `killSession(name)`: Destroy session
- `resizePane(pane, width, height)`: Adjust pane size

**Usage**:
```typescript
import { TmuxController } from "@tui-testing/core";

await TmuxController.sendCommand("session:0.0", "npm test");
const found = await TmuxController.waitForText("session:0.0", "PASS", 5000);
```

#### `core/src/reporter.ts` (160 lines)
**Purpose**: Test result logging and report generation

**Key Classes**:
- `TestLogger`: Accumulate test results
  - `logSuccess(name, duration)`: Log passing step
  - `logFailure(name, duration, reason)`: Log failure with reason
  - `getReport(title)`: Generate report object

- `TestReport`: Structure for test results
  - `title`: Test name
  - `passed`: Boolean result
  - `steps`: Array of step results with timing
  - `summary`: Human-readable summary

**Usage**:
```typescript
import { TestLogger, saveMarkdownReport } from "@tui-testing/core";

const logger = new TestLogger();
logger.logSuccess("Setup", 1000);
logger.logFailure("Test", 5000, "Expected text not found");

const report = logger.getReport("My Test");
await saveMarkdownReport(report, "./report.md");
```

#### `core/src/state-observer.ts` (200 lines)
**Purpose**: Condition-based state monitoring

**Key Classes**:
- `StateCondition`: Base interface for all conditions
  - `check()`: Test if condition is met
  - `getDescription()`: Human-readable description

- `TextCondition`: Monitor pane for text pattern
  - Constructor: `(pattern, options)`
  - Options: `timeout`, `regex`, `caseSensitive`

- `FileCondition`: Monitor file for changes
  - Constructor: `(filePath, type)`
  - Types: `exists`, `modified`, `sizeChanged`

- `CustomCondition`: Arbitrary JavaScript callback
  - Constructor: `(checkFn, description)`

**Usage**:
```typescript
import { TextCondition, FileCondition } from "@tui-testing/core";

// Wait for text (up to 5 seconds)
const ready = await new TextCondition("Ready", {
  timeout: 5000,
  regex: true
}).check();

// Wait for file to be created
const exists = await new FileCondition("./output.json", "exists").check();
```

#### `core/src/tui-test-runner.ts` (350 lines)
**Purpose**: Unified test execution orchestration

**Key Classes**:
- `TUITestRunner`: Main test coordinator
  - `constructor(adapter, reporter, options)`
  - `run(testPlan)`: Execute full test
  - `waitForCondition(condition)`: Wait for state
  - `interact(action)`: Send user input
  - `captureState()`: Read current state

- `TestContext`: Execution context
  - `sessionId`: Unique session identifier
  - `startTime`, `endTime`: Timing
  - `steps`: Array of executed steps
  - `passed`: Boolean result

- `TestResult`: Final outcome
  - `passed`: Boolean
  - `duration`: Total time
  - `steps`: Step results with evidence
  - `report`: Markdown report

**Usage**:
```typescript
import { TUITestRunner } from "@tui-testing/core";
import { createGenericAdapter } from "@tui-testing/adapters";
import { TestLogger } from "@tui-testing/core";

const adapter = createGenericAdapter({ launchCommand: "npm run app" });
const runner = new TUITestRunner(adapter, new TestLogger(), {
  sessionName: "my-test"
});

const result = await runner.run({
  title: "Test app",
  steps: [
    { title: "Start", action: "start" },
    { title: "Interact", action: "sendKeys", keys: "Hello" }
  ]
});
```

#### `core/src/index.ts` (20 lines)
**Purpose**: Public API exports

**Exports**:
```typescript
export { TmuxController } from "./tmux-controller.js";
export { TestLogger, TestReport, saveMarkdownReport } from "./reporter.js";
export { StateCondition, TextCondition, FileCondition, CustomCondition } from "./state-observer.js";
export { TUITestRunner, TestContext, TestResult } from "./tui-test-runner.js";
```

#### `core/package.json`
**Purpose**: npm package metadata

```json
{
  "name": "@tui-testing/core",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./reporter": "./dist/reporter.js",
    "./state-observer": "./dist/state-observer.js"
  }
}
```

#### `core/README.md`
**Purpose**: Core module documentation

**Sections**:
- Component overview
- Installation instructions
- Usage examples
- API reference
- Performance notes

#### `core/tests/`
**Purpose**: Unit tests for core module

**Files**:
- `state-observer.test.ts`: Condition testing
- `reporter.test.ts`: Report generation
- `tmux-controller.test.ts`: Tmux operations

---

### Adapters Module (`adapters/`)

Framework-specific implementations following a common interface.

#### `adapters/src/adapter-interface.ts` (100 lines)
**Purpose**: Contract all adapters must implement

**Key Interface**:
```typescript
interface LabAdapter {
  // Lifecycle
  launch(options: LaunchOptions): Promise<LaunchResult>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;

  // Interaction
  interact(action: UserAction): Promise<void>;
  getState(): Promise<AppState>;

  // Metadata
  getAdapterType(): string;
  getModuleId(): string;
}

interface UserAction {
  type: "sendKeys" | "sendCommand" | "delay";
  payload: any;
}

interface AppState {
  paneId: string;
  content: string;
  stateJson?: any;
}
```

**Usage**: Implement this for new app types.

#### `adapters/src/canvas-adapter.ts` (250 lines)
**Purpose**: Canvas vTA lab implementation

**Functionality**:
- Launches Canvas lab modules in Docker
- Parses Canvas-specific `state.json`
- Detects task completions
- Handles lab lifecycle

**Example**:
```typescript
const adapter = createCanvasAdapter({
  moduleId: "linux-user-management",
  containerId: "canvas-123"
});
```

#### `adapters/src/generic-adapter.ts` (200 lines)
**Purpose**: Any shell command or CLI application

**Functionality**:
- Launches any command via bash/zsh
- Generic text-based state detection
- stdin/stdout interaction
- Works with any TUI tool

**Example**:
```typescript
const adapter = createGenericAdapter({
  launchCommand: "bun run my-app.ts"
});
```

#### `adapters/src/index.ts` (50 lines)
**Purpose**: Adapter factory and exports

**Exports**:
```typescript
export { createCanvasAdapter } from "./canvas-adapter.js";
export { createGenericAdapter } from "./generic-adapter.js";
export type { LabAdapter, UserAction, AppState } from "./adapter-interface.js";
```

#### `adapters/tests/`
**Purpose**: Adapter implementation tests

**Files**:
- `canvas-adapter.test.ts`: Canvas-specific tests
- `generic-adapter.test.ts`: Generic CLI tests

#### `adapters/README.md`
**Purpose**: Adapter development guide

**Sections**:
- Interface contract explanation
- Step-by-step custom adapter tutorial
- Testing adapters
- Common patterns

---

### Agents Module (`agents/`)

Natural language to test code conversion.

#### `agents/tui-tester-agent.ts` (400 lines)
**Purpose**: Main agent for converting NL test specs to executable code

**Key Functions**:
- `runTUITestAgent(request)`: Main entry point
- `parseInteractions(interactions)`: NL → action sequence
- `parseAssertions(assertions)`: NL → validation sequence
- `generateTestCode(adapter, interactions, assertions)`: TypeScript generator

**Interface**:
```typescript
interface AgentRequest {
  app: string;
  appType?: "canvas" | "generic";
  interactions: string[];
  assertions: string[];
  launchCommand?: string;
  moduleId?: string;
  verbose?: boolean;
}

interface AgentResponse {
  success: boolean;
  summary: string;
  report: string;
  diagnostics?: string;
  generatedCode?: string;
}
```

**Example**:
```typescript
const response = await runTUITestAgent({
  app: "Canvas vTA",
  interactions: ["Navigate right", "Wait for content"],
  assertions: ["Should show step 2"]
});
```

#### `agents/manifest.yaml` (NEW - Phase 7)
**Purpose**: Claude Code agent registration

**Contents**:
- Agent name, version, description
- Input/output specifications
- Capabilities list
- Usage examples
- Performance characteristics

#### `agents/tui-tester-agent.test.ts` (250 lines)
**Purpose**: Agent functionality tests

**Test Suites**:
- Agent request parsing
- Interaction translation
- Assertion validation
- Code generation
- End-to-end execution

#### `agents/index.ts`
**Purpose**: Agent module exports

```typescript
export { runTUITestAgent } from "./tui-tester-agent.js";
export type { AgentRequest, AgentResponse } from "./tui-tester-agent.js";
```

---

### Examples Module (`examples/`)

Working implementations demonstrating framework usage.

#### `examples/simple-menu.ts` (100 lines)
**Purpose**: Example TUI application - interactive menu

**What it does**:
- Displays menu options
- Handles arrow key navigation
- Accepts selections
- Shows results
- Good test target - clear, visible behavior

**Usage**:
```bash
bun run examples/simple-menu.ts
```

#### `examples/simple-menu-test.ts` (150 lines)
**Purpose**: Test the menu app using TUITestRunner

**What it tests**:
- Menu rendering
- Navigation (arrow keys)
- Selection (Enter key)
- Output verification

**How to run**:
```bash
bun run examples/simple-menu-test.ts
```

#### `examples/canvas-vta-test.ts` (120 lines)
**Purpose**: Test Canvas vTA using the agent

**What it tests**:
- Canvas module loading
- Step navigation
- Task detection
- Progress tracking

**How to run**:
```bash
bun run examples/canvas-vta-test.ts
```

#### `examples/README.md`
**Purpose**: Example documentation

**Sections**:
- What each example demonstrates
- How to run them
- Expected output
- How to modify for your own tests

---

### Documentation (`docs/`)

Comprehensive guides for users and developers.

#### `docs/GETTING_STARTED.md` (NEW - Phase 7)
**Purpose**: Step-by-step introduction for new users

**Sections**:
1. Prerequisites (tmux, Node, Bun)
2. Installation steps
3. Your first test
4. Running examples
5. Writing your own test
6. Debugging tips
7. Next steps

**Length**: ~1500 lines
**Target**: Developers new to the framework

#### `docs/API_REFERENCE.md` (NEW - Phase 7)
**Purpose**: Complete type documentation

**Sections**:
- Core module API
- Adapter interface
- Test runner API
- Agent interface
- State conditions
- Reporter types

**Format**: Type signatures with descriptions and examples
**Length**: ~2000 lines

#### `docs/ARCHITECTURE.md` (NEW - Phase 7)
**Purpose**: Deep technical dive

**Sections**:
1. System overview
2. Adapter pattern
3. State observer pattern
4. Test runner flow
5. Data flow diagrams
6. Extension points
7. Performance characteristics
8. Limitations & roadmap

**Length**: ~3000 lines
**Target**: Framework developers and architects

#### `docs/ADAPTER_GUIDE.md` (NEW - Phase 7)
**Purpose**: How to create custom adapters

**Sections**:
1. Adapter interface overview
2. Lifecycle methods
3. State representation
4. Interaction handling
5. Step-by-step tutorial
6. Testing your adapter
7. Publishing your adapter
8. Common patterns

**Length**: ~2000 lines
**Examples**: Complete working adapter implementation

#### `docs/DEVELOPMENT.md` (NEW - Phase 7)
**Purpose**: Contributor guidelines

**Sections**:
1. Setting up development environment
2. Code style and conventions
3. Running tests
4. Debugging tips
5. Adding features
6. Pull request process
7. Release procedure

**Length**: ~1500 lines

#### `docs/ROADMAP.md` (NEW - Phase 7)
**Purpose**: Future enhancements and priorities

**Sections**:
1. Completed features (Phases 1-7)
2. Planned features (Phase 8+)
3. Performance improvements
4. Framework integrations
5. Community requests
6. Long-term vision

**Length**: ~1000 lines

#### `docs/TROUBLESHOOTING.md` (NEW - Phase 7)
**Purpose**: Common issues and solutions

**Sections**:
1. Installation issues
2. Framework issues
3. Timing and flakiness
4. Debugging tips
5. Performance problems
6. Platform-specific issues
7. FAQ

**Length**: ~1500 lines

---

### Root Configuration Files

#### `package.json` (NEW - Phase 7)
**Purpose**: Root workspace package

**Contents**:
```json
{
  "name": "@tui-testing/framework",
  "version": "1.0.0",
  "description": "Production-ready TUI testing framework",
  "type": "module",
  "workspaces": ["core", "adapters", "agents", "examples"],
  "scripts": {
    "build": "bun run --filter=./core build && bun run --filter=./adapters build",
    "test": "bun test core agents adapters",
    "examples": "echo 'See examples/README.md'"
  }
}
```

#### `tsconfig.json` (NEW - Phase 7)
**Purpose**: Root TypeScript configuration

**Settings**:
- Target: ES2020
- Module: ESNext
- Strict mode enabled
- Module resolution: node
- Composite build support

#### `.gitignore` (NEW - Phase 7)
**Purpose**: Git ignore patterns

**Patterns**:
```
node_modules/
dist/
*.d.ts
*.js (for .ts files)
.env
.vscode/
*.swp
*.log
```

---

### Documentation Files (Phase 7)

#### `README.md`
**Purpose**: Main entry point (updated for Phase 7)

**Contents**:
- Framework overview
- Quick start
- Architecture diagram
- Key features
- Usage examples
- Links to detailed docs

**Length**: ~2000 lines

#### `README_PHASE7.md`
**Purpose**: Comprehensive Phase 7 summary

**Contents**:
- Complete feature reference
- All documentation links
- Complete API overview
- Examples and usage patterns
- Troubleshooting guide

**Length**: ~3000 lines

#### `STRUCTURE.md` (This file)
**Purpose**: Project structure reference

**Contents**:
- Complete directory tree
- File purposes and descriptions
- API summaries
- Quick reference

**Length**: ~1500 lines

#### `QUICK_START.md` (NEW - Phase 7)
**Purpose**: 5-minute quick start

**Contents**:
- Install in 2 minutes
- Run your first test in 3 minutes
- Next steps

**Length**: ~500 lines
**Target**: Impatient developers

---

## File Statistics

| Category | Count | Total Lines |
|----------|-------|------------|
| TypeScript Source | 12 | ~2,500 |
| Tests | 8 | ~1,500 |
| Documentation | 10 | ~15,000 |
| Configuration | 4 | ~200 |
| **Total** | **34** | **~19,200** |

---

## Development Workflow

### Adding a New Test Type

1. **Create adapter**: `adapters/src/my-adapter.ts`
2. **Export from factory**: `adapters/src/index.ts`
3. **Add tests**: `adapters/tests/my-adapter.test.ts`
4. **Update docs**: `docs/ADAPTER_GUIDE.md`
5. **Create example**: `examples/my-test.ts`

### Adding a New Feature

1. **Add types**: Update relevant interface
2. **Implement**: Add to core or adapter
3. **Test**: Write comprehensive tests
4. **Document**: Update API_REFERENCE.md
5. **Example**: Create usage example

### Releasing a New Version

1. Update version in all `package.json` files
2. Run full test suite
3. Update CHANGELOG
4. Update manifest.yaml
5. Tag git repository
6. Publish to npm

---

## Quick Reference

### Core Module Imports

```typescript
import {
  TmuxController,
  TestLogger,
  TextCondition,
  FileCondition,
  TUITestRunner
} from "@tui-testing/core";
```

### Adapter Factory

```typescript
import {
  createCanvasAdapter,
  createGenericAdapter
} from "@tui-testing/adapters";
```

### Agent Usage

```typescript
import { runTUITestAgent } from "@tui-testing/agents";

const result = await runTUITestAgent({
  app: "My App",
  interactions: ["..."],
  assertions: ["..."]
});
```

---

## Navigation Guide

| I want to... | Read this |
|--------------|-----------|
| Get started quickly | `QUICK_START.md` |
| Learn the system | `README_PHASE7.md` |
| Understand architecture | `docs/ARCHITECTURE.md` |
| Create a custom adapter | `docs/ADAPTER_GUIDE.md` |
| Fix a problem | `docs/TROUBLESHOOTING.md` |
| Contribute code | `docs/DEVELOPMENT.md` |
| See what's coming | `docs/ROADMAP.md` |
| Look up an API | `docs/API_REFERENCE.md` |

---

**Last Updated**: 2026-01-25 (Phase 7)
**Status**: Production Ready

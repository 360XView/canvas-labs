# Quick Start - TUI Testing Framework

Get up and running in 5 minutes.

---

## Install (2 minutes)

```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing

# Install dependencies
bun install

# Build
bun run build
```

---

## Run First Test (1 minute)

```bash
bun run examples/simple-menu-test.ts
```

**Expected output**:
```
✓ Simple Menu Test
  ✓ Start menu (150ms)
  ✓ Navigate down (100ms)
  ✓ Select option (200ms)
  ✓ Verify selection (150ms)
  ✓ Quit (100ms)

Test passed: 5/5 steps
```

---

## Write Your First Test (2 minutes)

Create `my-test.ts`:

```typescript
import { createGenericAdapter } from "./adapters/index.js";
import { TUITestRunner } from "./core/tui-test-runner.js";
import { TestLogger } from "./core/reporter.js";

const adapter = createGenericAdapter({
  launchCommand: "echo 'Hello World'"
});

const runner = new TUITestRunner(
  adapter,
  new TestLogger(),
  { sessionName: "my-test" }
);

const result = await runner.run({
  title: "My First Test",
  steps: [
    { title: "Start", action: "start" },
    { title: "Verify output", action: "assertText", pattern: "Hello" }
  ]
});

console.log(result.report);
process.exit(result.passed ? 0 : 1);
```

Run it:
```bash
bun run my-test.ts
```

---

## Next Steps

- 📖 [Getting Started Guide](docs/GETTING_STARTED.md) - Full walkthrough
- 📚 [API Reference](docs/API_REFERENCE.md) - All functions
- 🏗️ [Architecture](docs/ARCHITECTURE.md) - How it works
- 💬 [Examples](examples/README.md) - More examples

---

## Common Commands

```bash
# Run all examples
bun run examples/simple-menu-test.ts
bun run examples/canvas-vta-test.ts

# Build TypeScript
bun run build

# Run tests
bun test

# Use agent (natural language)
bun run agents/tui-tester-agent.ts
```

---

## Troubleshooting

**"tmux not found"**
```bash
brew install tmux        # macOS
sudo apt install tmux    # Linux
```

**Test hangs**
- Increase timeout: `timeout: 10000`
- Check app runs: `bun run examples/simple-menu.ts`

**"Module not found"**
```bash
bun run build  # Rebuild TypeScript
```

---

**You're ready to test!** 🚀

See [README.md](README_PHASE7.md) for full documentation.

---
name: validate-migration
description: Run TUI tests to validate the Canvas migration. Use after copying files to new location or when verifying the project works correctly.
disable-model-invocation: true
---

# Validate Migration

Run the full validation suite to ensure the Canvas project works correctly.

## Validation Steps

1. **Install dependencies** in all packages
2. **Run unit tests** in canvas-plugin (expect 137 tests)
3. **Run TUI integration test** (expect 10 assertions)
4. **Manual smoke test** - launch a lab

## Commands

```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs

# 1. Install dependencies
bun install
cd packages/canvas-plugin && bun install && cd ../..
cd packages/tui-testing && bun install && cd ../..

# 2. Run unit tests
cd packages/canvas-plugin && bun test src/lab/

# 3. Run TUI integration test
bun run packages/tui-testing/examples/canvas-vta-test.ts

# 4. Manual smoke test
cd packages/canvas-plugin
bun run src/cli.ts lab linux-user-management --no-tutor
```

## Success Criteria

- [ ] `bun install` succeeds without errors
- [ ] 137 unit tests pass
- [ ] TUI test shows "PASSED" with 10/10 steps
- [ ] Lab launches and VTA pane displays content
- [ ] Docker container is accessible

## Troubleshooting

If tests fail:
1. Check Docker is running
2. Check tmux is installed (`brew install tmux`)
3. Verify all files were copied (compare with source)
4. Check for path issues in imports

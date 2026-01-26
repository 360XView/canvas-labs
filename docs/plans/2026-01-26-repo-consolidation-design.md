# Canvas Labs Repository Consolidation Plan

**Date:** January 26, 2026
**Status:** Design (Awaiting Approval)
**Goal:** Consolidate scattered Canvas projects into a single, well-organized monorepo with proper git backup

---

## 1. Problem Statement

Current state has multiple issues:

| Issue | Risk Level | Description |
|-------|------------|-------------|
| **Code in cache folder** | HIGH | Main Canvas code lives in `~/.claude/plugins/cache/` - can be cleared |
| **No git remote** | HIGH | Both repos have local git only, no backup |
| **Scattered projects** | MEDIUM | Related projects in different locations |
| **Documentation noise** | LOW | 26+ markdown files in tui-testing from dev phases |
| **Non-standard skill location** | LOW | Canvas uses `.claude/skills/` instead of `skills/` |

### Current Asset Locations

| Asset | Location | Git Status |
|-------|----------|------------|
| Canvas Learning Labs | `~/.claude/plugins/cache/claude-canvas/canvas/0.1.0/` | Local only |
| Canvas Skills (6) | `.../canvas/0.1.0/skills/` | Part of above |
| tui-testing | `26Q1/Canvas/tui-testing/` | Local only |
| vscode-extension | `26Q1/Canvas/vscode-canvas-extension/` | Not in git |
| tests-poc | `26Q1/Canvas/tests-poc/` | Not in git |
| Loose docs | `26Q1/Canvas/*.md` | Not in git |

---

## 2. Target Structure

```
/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/
├── README.md                           # Project overview
├── CLAUDE.md                           # Claude Code instructions
├── package.json                        # Bun workspace root
│
├── .claude/                            # PROJECT-level Claude config
│   ├── settings.local.json
│   └── skills/                         # Developer workflow skills
│       ├── validate-migration/
│       │   └── SKILL.md                # Run TUI tests to validate
│       └── clean-repo/
│           └── SKILL.md                # Remove stale files
│
├── packages/
│   ├── canvas-plugin/                  # The installable Claude Code plugin
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json             # Plugin manifest (required)
│   │   ├── skills/                     # Plugin skills (shipped to users)
│   │   │   ├── canvas/SKILL.md
│   │   │   ├── vta/SKILL.md
│   │   │   ├── calendar/SKILL.md
│   │   │   ├── document/SKILL.md
│   │   │   ├── flight/SKILL.md
│   │   │   └── lab-launcher/SKILL.md
│   │   ├── src/                        # Source code
│   │   │   ├── cli.ts
│   │   │   ├── canvases/
│   │   │   ├── lab/
│   │   │   ├── curriculum/
│   │   │   └── tutor/
│   │   ├── labs/                       # Lab content
│   │   │   ├── linux-user-management/
│   │   │   ├── shell-navigation/
│   │   │   ├── shell-file-operations/
│   │   │   ├── shell-text-processing/
│   │   │   ├── shell-find-files/
│   │   │   ├── shell-bash-scripting/
│   │   │   └── shell-log-analysis/
│   │   ├── courses/                    # Course definitions
│   │   ├── docker/                     # Docker environment
│   │   │   └── lab-environment/
│   │   └── package.json
│   │
│   ├── tui-testing/                    # TUI testing framework
│   │   ├── src/                        # Renamed from core/
│   │   │   ├── tmux-controller.ts
│   │   │   ├── tui-test-runner.ts
│   │   │   ├── state-observer.ts
│   │   │   └── reporter.ts
│   │   ├── adapters/
│   │   │   └── canvas-adapter.ts
│   │   ├── examples/
│   │   │   ├── canvas-vta-test.ts
│   │   │   └── simple-menu-test.ts
│   │   └── package.json
│   │
│   └── vscode-extension/               # VSCode integration
│       ├── src/
│       └── package.json
│
├── docs/
│   ├── designs/                        # Architecture decisions
│   │   └── multi-lab-telemetry.md
│   ├── plans/                          # Implementation plans
│   │   └── 2026-01-26-repo-consolidation-design.md
│   └── archive/                        # Old phase docs (reference)
│       ├── PHASE_1_SUMMARY.md
│       ├── PHASE_2_*.md
│       └── ... (26 files from tui-testing)
│
└── scripts/
    ├── validate-migration.sh           # Migration validation
    └── build-all.sh                    # Build all packages
```

---

## 3. Migration Strategy: Create New, Validate, Then Retire

### Principle: Never Touch Old Until New Is Proven

```
Phase 1: Create new structure (old untouched)
    ↓
Phase 2: Copy files to new location
    ↓
Phase 3: Validate with TUI tests
    ↓
Phase 4: Push to GitHub (backup!)
    ↓
Phase 5: Retire old locations
```

---

## 4. Phase 1: Create New Structure

### 4.1 Create Directory Structure

```bash
# Create new repo location
mkdir -p /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs

cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs

# Create directory structure
mkdir -p .claude/skills/validate-migration
mkdir -p .claude/skills/clean-repo
mkdir -p packages/canvas-plugin/.claude-plugin
mkdir -p packages/canvas-plugin/skills
mkdir -p packages/tui-testing/src
mkdir -p packages/tui-testing/adapters
mkdir -p packages/tui-testing/examples
mkdir -p packages/vscode-extension
mkdir -p docs/designs
mkdir -p docs/plans
mkdir -p docs/archive
mkdir -p scripts
```

### 4.2 Initialize Git

```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs

git init
git branch -M main
```

### 4.3 Create Root package.json (Bun Workspace)

```json
{
  "name": "canvas-labs",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun run --filter '*' test",
    "test:tui": "bun run packages/tui-testing/examples/canvas-vta-test.ts"
  }
}
```

### 4.4 Create Plugin Manifest

Create `packages/canvas-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "canvas",
  "description": "Interactive terminal-based learning labs with automatic task detection",
  "version": "0.2.0",
  "author": {
    "name": "Canvas Team"
  },
  "repository": "https://github.com/YOUR_ORG/canvas-labs",
  "license": "MIT",
  "keywords": ["learning", "labs", "tui", "vta", "terminal"]
}
```

---

## 5. Phase 2: Copy Files

### 5.1 Copy Canvas Plugin (from cache)

```bash
SOURCE="/Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0"
DEST="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/canvas-plugin"

# Copy source code
cp -r "$SOURCE/src" "$DEST/"

# Copy labs
cp -r "$SOURCE/labs" "$DEST/"

# Copy courses
cp -r "$SOURCE/courses" "$DEST/"

# Copy docker
cp -r "$SOURCE/docker" "$DEST/"

# Copy skills (fix location: skills/ not .claude/skills/)
cp -r "$SOURCE/skills/"* "$DEST/skills/"

# Copy package.json
cp "$SOURCE/package.json" "$DEST/"

# Copy other root files
cp "$SOURCE/CLAUDE.md" "$DEST/"
cp "$SOURCE/README.md" "$DEST/"
cp "$SOURCE/bun.lock" "$DEST/"
```

### 5.2 Copy TUI Testing Framework

```bash
SOURCE="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing"
DEST="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/tui-testing"

# Copy core as src
cp -r "$SOURCE/core/"* "$DEST/src/"

# Copy adapters
cp -r "$SOURCE/adapters" "$DEST/"

# Copy examples
cp -r "$SOURCE/examples" "$DEST/"

# Copy package.json
cp "$SOURCE/package.json" "$DEST/"
```

### 5.3 Move Phase Documentation to Archive

```bash
SOURCE="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing"
ARCHIVE="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/docs/archive"

# Move all PHASE_*.md files
cp "$SOURCE"/PHASE_*.md "$ARCHIVE/"
cp "$SOURCE"/CHANGES_SUMMARY.txt "$ARCHIVE/"
cp "$SOURCE"/IMPLEMENTATION_COMPLETE.txt "$ARCHIVE/"
cp "$SOURCE"/VALIDATION_REPORT.md "$ARCHIVE/"
cp "$SOURCE"/EXTRACTION_MANIFEST.md "$ARCHIVE/"
cp "$SOURCE"/QUICK_REFERENCE.md "$ARCHIVE/"
```

### 5.4 Copy VSCode Extension

```bash
SOURCE="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/vscode-canvas-extension"
DEST="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/packages/vscode-extension"

cp -r "$SOURCE/src" "$DEST/"
cp "$SOURCE/package.json" "$DEST/"
cp "$SOURCE/tsconfig.json" "$DEST/" 2>/dev/null || true
```

### 5.5 Copy Design Documents

```bash
SOURCE="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/docs"
DEST="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs/docs"

cp -r "$SOURCE/designs/"* "$DEST/designs/" 2>/dev/null || true
cp -r "$SOURCE/plans/"* "$DEST/plans/" 2>/dev/null || true
```

### 5.6 Create Root CLAUDE.md

Merge and update the CLAUDE.md to reflect new structure.

---

## 6. Phase 3: Validate with TUI Tests

### 6.1 Install Dependencies

```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs

# Install root dependencies
bun install

# Install package dependencies
cd packages/canvas-plugin && bun install && cd ../..
cd packages/tui-testing && bun install && cd ../..
```

### 6.2 Run Unit Tests

```bash
cd packages/canvas-plugin
bun test src/lab/
```

**Expected:** 137 tests pass

### 6.3 Run TUI Integration Test

```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs

# Update test to use new paths
bun run packages/tui-testing/examples/canvas-vta-test.ts
```

**Expected:** 10 assertions pass, including:
- Lab launches successfully
- VTA canvas renders "Introduction"
- Navigation between steps works
- Docker container responds

### 6.4 Manual Smoke Test

```bash
cd packages/canvas-plugin
bun run src/cli.ts lab linux-user-management --no-tutor
```

**Expected:**
- tmux session starts
- VTA pane shows lab content
- Docker container is accessible
- Can complete at least one task

### 6.5 Validation Checklist

- [ ] `bun install` succeeds in all packages
- [ ] `bun test` passes in canvas-plugin (137 tests)
- [ ] TUI integration test passes (10 assertions)
- [ ] Manual lab launch works
- [ ] Skills are in correct location (`skills/` not `.claude/skills/`)
- [ ] Plugin manifest exists (`.claude-plugin/plugin.json`)

---

## 7. Phase 4: Git Remote & Backup

### 7.1 Create GitHub Repository

Create new repo: `github.com/YOUR_ORG/canvas-labs`

### 7.2 Push to Remote

```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs

# Add all files
git add .

# Initial commit
git commit -m "Initial commit: consolidate Canvas projects

- Canvas learning labs (from cache)
- TUI testing framework
- VSCode extension
- 6 plugin skills
- Documentation

Co-Authored-By: Claude <noreply@anthropic.com>"

# Add remote
git remote add origin git@github.com:YOUR_ORG/canvas-labs.git

# Push
git push -u origin main
```

### 7.3 Verify Backup

```bash
# Verify remote is set
git remote -v

# Verify push succeeded
git log origin/main --oneline -3
```

---

## 8. Phase 5: Retire Old Locations

**Only after Phase 4 is complete and verified!**

### 8.1 Mark Old Locations as Deprecated

Create `MOVED.md` in old locations:

```markdown
# This Project Has Moved

This code has been consolidated into:
https://github.com/YOUR_ORG/canvas-labs

Please use the new location.
```

Place in:
- `/Users/taavi/.claude/plugins/cache/claude-canvas/canvas/0.1.0/MOVED.md`
- `/Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing/MOVED.md`

### 8.2 Wait Period

Keep old locations for **2 weeks** as safety net.

### 8.3 Final Cleanup (After Wait Period)

```bash
# Remove old experiment folder (keep git history in new repo)
rm -rf /Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tui-testing
rm -rf /Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/vscode-canvas-extension
rm -rf /Users/taavi/Documents/Main_Docs/3_Code/26Q1/Canvas/tests-poc

# Note: Cache folder will be managed by Claude Code
# Don't delete manually - update plugin to point to new location
```

---

## 9. Project-Level Skills (For Developers)

### 9.1 validate-migration Skill

Create `.claude/skills/validate-migration/SKILL.md`:

```yaml
---
name: validate-migration
description: Run TUI tests to validate the Canvas migration. Use after copying files to new location.
disable-model-invocation: true
---

# Validate Migration

Run the full validation suite to ensure the migrated Canvas project works correctly.

## Steps

1. Install dependencies in all packages
2. Run unit tests in canvas-plugin
3. Run TUI integration test
4. Generate validation report

## Commands

```bash
cd /Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs

# Install
bun install
cd packages/canvas-plugin && bun install && cd ../..
cd packages/tui-testing && bun install && cd ../..

# Test
cd packages/canvas-plugin && bun test src/lab/

# TUI test
bun run packages/tui-testing/examples/canvas-vta-test.ts
```

## Success Criteria

- 137 unit tests pass
- TUI test shows "PASSED"
- Lab can be launched manually
```

### 9.2 clean-repo Skill

Create `.claude/skills/clean-repo/SKILL.md`:

```yaml
---
name: clean-repo
description: Remove stale files and noise from the repository. Use when repo has accumulated old files.
disable-model-invocation: true
---

# Clean Repository

Remove files that add noise and confuse humans or agents.

## Safe to Remove

- `node_modules/` - regenerated by `bun install`
- `dist/` - regenerated by build
- `.DS_Store` - macOS artifacts
- `*.log` - log files
- Duplicate documentation

## Commands

```bash
# Remove build artifacts
find . -name "node_modules" -type d -prune -exec rm -rf {} +
find . -name "dist" -type d -prune -exec rm -rf {} +
find . -name ".DS_Store" -delete

# Show large files that might be stale
find . -type f -size +1M -not -path "*/node_modules/*" -not -path "*/.git/*"
```

## Never Remove

- Source files (`*.ts`, `*.tsx`)
- Configuration (`*.json`, `*.yaml`)
- Documentation in `docs/`
- Git history
```

---

## 10. File Mapping Reference

| Old Location | New Location |
|--------------|--------------|
| `cache/.../canvas/0.1.0/src/` | `packages/canvas-plugin/src/` |
| `cache/.../canvas/0.1.0/labs/` | `packages/canvas-plugin/labs/` |
| `cache/.../canvas/0.1.0/skills/` | `packages/canvas-plugin/skills/` |
| `cache/.../canvas/0.1.0/docker/` | `packages/canvas-plugin/docker/` |
| `cache/.../canvas/0.1.0/courses/` | `packages/canvas-plugin/courses/` |
| `26Q1/Canvas/tui-testing/core/` | `packages/tui-testing/src/` |
| `26Q1/Canvas/tui-testing/adapters/` | `packages/tui-testing/adapters/` |
| `26Q1/Canvas/tui-testing/examples/` | `packages/tui-testing/examples/` |
| `26Q1/Canvas/tui-testing/PHASE_*.md` | `docs/archive/` |
| `26Q1/Canvas/vscode-canvas-extension/` | `packages/vscode-extension/` |
| `26Q1/Canvas/docs/designs/` | `docs/designs/` |

---

## 11. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Cache cleared before migration | Start Phase 1-4 immediately |
| Copy misses files | Use explicit file lists, verify after copy |
| Tests fail in new location | Debug before retiring old |
| Git push fails | Verify SSH keys, try HTTPS |
| Plugin stops working | Keep old location for 2 weeks |

---

## 12. Success Criteria

Migration is complete when:

- [ ] All code in `canvas-labs/` monorepo
- [ ] Git remote configured and pushed
- [ ] 137 unit tests passing
- [ ] TUI integration test passing
- [ ] Manual lab launch works
- [ ] Skills in correct location with manifest
- [ ] Old locations marked as deprecated
- [ ] Documentation consolidated

---

## 13. Next Steps After Migration

1. **Update plugin installation** - Point to new repo location
2. **Create testing skill** - Add `/testing` skill for TUI framework
3. **Set up CI/CD** - GitHub Actions for tests
4. **Create WPM agent** - Work Process Manager for ongoing maintenance

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

**cswap** — A cross-platform CLI tool for switching between Claude Code providers. Supports both CC Switch database and its own config file (`~/.cswap.json`).

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode
node dist/index.js     # Run directly
npm link               # Global link for testing
```

## Architecture

```
src/
├── index.ts          # Entry point, Commander CLI, main orchestration
├── db.ts             # SQLite queries to CC Switch database + provider merging
├── config.ts         # cswap config file management (~/.cswap.json)
├── history.ts        # Usage history persistence (~/.ccsc-history)
├── settings.ts       # Provider-specific settings file generation
├── types.ts          # TypeScript interfaces
└── ui/
    └── selector.ts   # Interactive provider selection (subprocess-based)
```

### Data Flow

1. `db.ts` + `config.ts` merge providers from CC Switch database and `~/.cswap.json`
2. `history.ts` sorts providers by recent usage
3. `ui/selector.ts` runs interactive selection in a child process (avoids stdin issues on Windows)
4. `settings.ts` creates isolated `~/.cswap-{slug}.settings.json` with merged env vars
5. `index.ts` spawns Claude CLI with `--settings` flag

### Key Design Decisions

- **Subprocess-based UI**: Interactive selection runs in a child Node.js process to avoid stdin conflicts with the spawned Claude Code on Windows
- **No Ink/React**: Uses simple readline-based UI instead of Ink to prevent raw mode issues
- **Two provider sources**: CC Switch database (read-only) + cswap config file (read-write)
- **Settings isolation**: Each provider gets its own settings file, never modifies `~/.claude/settings.json`

# cswap

> Switch Claude Code providers on the fly — without touching your global settings.

**cswap** is a lightweight CLI that lets you pick a Claude Code provider before each session. It creates isolated settings per provider, so you can run different providers in different terminal tabs simultaneously.

## Why?

If you use [CC Switch](https://github.com/farion1231/cc-switch) to manage multiple Claude providers, you've probably run into these problems:

- Switching providers in CC Switch affects **all running Claude sessions**
- You can't use different providers in different projects at the same time
- Every switch modifies your global `~/.claude/settings.json`

cswap solves this by creating **per-session provider isolation** — each `cswap` invocation spawns Claude with its own settings file, leaving your global config untouched.

## Features

- **Provider isolation** — each session gets its own settings, no cross-contamination
- **Two config sources** — reads from CC Switch database and/or its own config file (`~/.cswap.json`)
- **Interactive selection** — pick a provider by number or name
- **Direct mode** — `--provider` flag to skip the interactive prompt
- **Management commands** — add, remove, list, import providers
- **Cross-platform** — macOS, Linux, Windows
- **Zero config** — works out of the box if CC Switch is installed

## Install

```bash
npm install -g @godiao/cswap
```

## Quick Start

```bash
# Interactive — pick a provider from the list
cswap

# Direct — skip the prompt
cswap --provider "Claude Official"

# Pass any Claude Code flags through
cswap --provider df --dangerously-skip-permissions --continue
```

## Usage

### Interactive Mode

```bash
cswap
```

Shows a numbered list of providers. Type a number or name to select:

```
  Select a provider:

  1. df
  2. Claude Official
  3. DeepSeek
  4. OpenRouter

  Type number or name, "q" to quit

  > 1
```

### Direct Mode

```bash
cswap --provider df -r --dangerously-skip-permissions
```

### Management Commands

```bash
# List all providers (shows source: cswap or cc-switch)
cswap list

# Add a provider to cswap config
cswap add myprovider \
  --env ANTHROPIC_API_KEY=sk-xxx \
  ANTHROPIC_BASE_URL=https://api.example.com

# Remove a provider
cswap remove myprovider

# Import all CC Switch providers into cswap config
cswap import
```

### Config File

cswap stores its providers in `~/.cswap.json`:

```json
{
  "providers": [
    {
      "name": "My Provider",
      "env": {
        "ANTHROPIC_API_KEY": "sk-xxx",
        "ANTHROPIC_BASE_URL": "https://api.example.com"
      }
    }
  ]
}
```

When both CC Switch and cswap config exist, providers are merged (cswap config takes priority on name conflicts).

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CC_CLI_PATH` | Path to Claude CLI binary | `claude` |
| `CC_SWITCH_DB_PATH` | Full path to CC Switch database | `~/.cc-switch/cc-switch.db` |
| `CC_SWITCH_HOME` | CC Switch config directory | `~/.cc-switch` |

### Custom CLI

```bash
# Via environment variable
export CC_CLI_PATH=/path/to/claude
cswap

# Via command line (higher priority)
cswap --cli /path/to/claude
```

### Cleanup

```bash
# Remove all cswap-generated settings files
cswap --clear
```

## How It Works

1. Reads providers from CC Switch database and/or `~/.cswap.json`
2. Shows interactive selection (or uses `--provider` flag)
3. Creates an isolated settings file at `~/.cswap-{name}.settings.json`
4. Spawns `claude --settings=<file>` with your chosen provider
5. cswap exits — Claude runs independently

The generated settings file inherits your hooks, plugins, and permissions from `~/.claude/settings.json`, but replaces environment variables and model config with the selected provider's values.

## Requirements

- Node.js >= 18
- [Claude Code](https://claude.ai/code) installed
- Optionally: [CC Switch](https://github.com/farion1231/cc-switch) for database-based provider management

## License

MIT

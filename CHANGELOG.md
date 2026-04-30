# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepchangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-30

### Added
- `--provider <name>` flag to skip interactive UI and launch directly
- `cswap add` command to add providers to cswap config
- `cswap remove` command to remove providers from cswap config
- `cswap list` command to list all providers with source tags
- `cswap import` command to import CC Switch providers into cswap config
- Own config file support (`~/.cswap.json`) — works without CC Switch
- Merged provider view from both CC Switch and cswap config
- Subprocess-based interactive selection (fixes Windows stdin issues)
- Trailing comma tolerance when reading JSON settings files

### Changed
- Renamed from `ccsc` to `cswap`
- Replaced Ink-based UI with subprocess readline approach (Windows compatibility)
- Removed Ink, React, ink-text-input dependencies (54 fewer packages)

### Fixed
- Windows stdin corruption after Ink UI exits (arrow keys producing `[A [B`)
- Focus event escape sequences appearing in terminal after exit
- Settings file JSON parsing with trailing commas

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flatban is a filesystem-based Kanban project management system designed specifically for AI-assisted development. It stores tasks as markdown files with YAML frontmatter, making it git-friendly and portable. Built with minimal dependencies (only `marked` for markdown rendering) using pure Node.js.

**Key Design Principle**: The filesystem is the source of truth. The `index.json` file is merely a performance cache that can always be rebuilt from the markdown files.

## Commands

### Development
```bash
# Test the CLI (runs help command)
npm test

# Install globally for testing
npm install -g .

# Uninstall
npm uninstall -g flatban
```

### Flatban Usage
```bash
# Initialize a board
flatban init "Project Name"

# Create tasks
flatban create "Task title" --priority high --tags backend,api --column todo
flatban create "Task with details" --description "Task description" --notes "- Note 1\n- Note 2"

# Move tasks (partial IDs work)
flatban move abc1234 in-progress
flatban move abc in-progress  # Partial ID

# View tasks
flatban list                   # All tasks
flatban list in-progress       # Filter by column
flatban list --priority high   # Filter by priority
flatban show abc1234           # Full task details

# View board
flatban board                  # Terminal view
flatban board --compact        # Compact view
flatban serve                  # Web UI at http://localhost:3847
flatban kanban                 # Same as serve (auto-opens browser)

# Rebuild index from filesystem
flatban sync
```

## Architecture

### Entry Point
- **bin/flatban** - CLI entry point and command router. Flexible argument parser that supports both `--key=value` and `--key value` formats for options.

**Argument Parsing Logic:**
- `--key=value` - Splits on `=` and assigns value
- `--key value` - Looks ahead to next argument; if it doesn't start with `--`, uses it as value
- `--flag` - If no value follows or next arg starts with `--`, sets to `true` (boolean)
- This dual format support makes the CLI more intuitive and matches common CLI tool behavior

### Core Modules

**lib/utils.js** - Shared utilities used across all commands:
- `generateTaskId()` - Creates unique 7-character IDs (3-char random + 4-char base36 timestamp)
- `parseSimpleYaml()` - Custom YAML parser for config files (no external dependencies)
- `parseFrontmatter()` - Extracts YAML frontmatter and markdown body from task files
- `loadIndex()` / `saveIndex()` - Manage index.json cache
- `loadConfig()` - Load config.yaml
- `findTaskByPartialId()` - Find tasks by partial ID match
- `slugify()` - Convert titles to URL-friendly slugs for filenames

**lib/server.js** - Web UI server:
- Pure Node.js HTTP server (no Express or frameworks)
- Real-time updates via Server-Sent Events (SSE) - keeps persistent connection to instantly broadcast changes
- Auto-syncs on page load by checking file modification times
- Filesystem watcher for CLI command changes (broadcasts SSE updates when files change)
- Drag-and-drop task movement between columns via `/api/move` endpoint
- Generates HTML with embedded CSS and JavaScript (no build step)
- Modal-based task details using CSS :target pseudo-class
- Uses `marked` library to render task markdown content safely

### Command Structure
Each command in `lib/commands/` follows a consistent pattern:
1. Parse arguments and options
2. Load config and index
3. Perform operation
4. Update index if needed
5. Save index
6. Display success/error message

**lib/commands/init.js** - Creates `.flatban/` directory structure, config.yaml, template.md, and initial index.json

**lib/commands/create.js** - Creates new task files from template with unique ID. Supports optional --description and --notes flags for adding content during creation (use `\n` for line breaks)

**lib/commands/move.js** - Moves task files between column directories and updates index

**lib/commands/sync.js** - Rebuilds index.json by scanning all `.flatban/*/` directories

**lib/commands/list.js** - Lists tasks with filtering support

**lib/commands/show.js** - Displays full task details including markdown body

**lib/commands/board.js** - Terminal-based Kanban board visualization

**lib/commands/serve.js** - Starts web server for browser-based board view with intelligent port selection (tries requested port, falls back to random available port if in use). Auto-opens browser by default (use `--no-open` to disable). Also accessible via `flatban kanban` command.

## File Structure

After initialization, a Flatban board has this structure:
```
.flatban/
├── config.yaml          # Board configuration (name, columns, priorities)
├── template.md          # Template for new tasks
├── index.json           # Performance cache (can be regenerated)
├── backlog/             # Task files: {id}-{slug}.md
├── todo/
├── in-progress/
├── review/
└── done/
```

### Task File Format
Tasks are markdown files with YAML frontmatter:
```markdown
---
id: abc1234
title: "Task title"
priority: high
tags: [backend, api]
assigned: username
---

## Description
Task description here.

## Notes
- Implementation notes

## History
- 2025-10-27 14:30: Task created
```

The task ID (7 characters) and status (directory location) form the core identity of a task. Moving a task = moving the file to a different column directory.

## Important Implementation Details

### ID Generation
Task IDs are 7 characters: 3 random base36 chars + 4-char base36 timestamp (seconds since 2000-01-01). This provides visual randomness while maintaining chronological ordering in the timestamp portion. Collision detection tries up to 100 times.

### Index Syncing
The index.json file stores task metadata for fast lookups without reading all markdown files. It becomes stale when:
- Task files are manually edited
- Files are moved outside the CLI
- Changes are pulled from git

Always run `flatban sync` after manual filesystem changes. The web server auto-syncs by checking file modification times against `index.last_sync`.

### Partial ID Matching
The `findTaskByPartialId()` utility allows users to type just the first few characters of a task ID (e.g., "abc" instead of "abc1234"). It errors if multiple matches are found or if no matches exist.

### Dependencies
The project uses pure Node.js standard library (`fs`, `path`, `http`, `net`) with one external dependency:
- `marked` (v12.0.0+) - For safely rendering markdown content in the web UI

This minimal dependency approach is intentional for portability and simplicity. The custom YAML parser handles the simple subset needed for config files without requiring external YAML libraries.

### Real-Time Updates
The web UI uses Server-Sent Events (SSE) to maintain a persistent connection with the server. Changes made via CLI commands trigger filesystem watch events, which broadcast SSE updates to all connected clients, causing instant board refreshes. The SSE connection automatically reconnects if dropped. This replaces the old polling mechanism for better performance and instant feedback.

### Web Server API
The server exposes these endpoints:
- `GET /` - Serves the main board HTML (auto-syncs if needed)
- `GET /api/events` - SSE endpoint for real-time updates (persistent connection)
- `GET /api/status` - Returns `last_sync` timestamp (kept for backwards compatibility)
- `POST /api/move` - Move task between columns (accepts `{taskId, targetColumn}`)

When tasks are moved via drag-and-drop in the web UI, it posts to `/api/move`, which updates the filesystem and broadcasts an SSE update to all clients.

### Port Selection Strategy
`lib/commands/serve.js` implements intelligent port selection to avoid conflicts:
1. Try the requested port (default: 3847, or `--port=<num>`)
2. If unavailable, try up to 10 random ports between 4000-9999 (avoiding common ports like 3000, 8080, etc.)
3. Error if no port found after 10 attempts
4. Uses `net.createServer()` to test port availability before binding

### Browser Auto-Open
Both `flatban serve` and `flatban kanban` commands automatically open the board in your default browser after starting the server. This uses platform-specific commands:
- macOS: `open`
- Windows: `start`
- Linux/Unix: `xdg-open`

To disable auto-open, use the `--no-open` flag: `flatban serve --no-open`

## Claude Code Integration

The `.claude/commands/flatban.md` file provides a custom slash command (`/flatban`) that gives Claude full context about:
- Flatban's file structure and conventions
- CLI command syntax
- Task creation best practices
- How to break down features into tasks

When users invoke `/flatban`, Claude can naturally manage tasks through conversation rather than requiring users to remember command syntax.

## Development Notes

- No build step or transpilation - pure Node.js scripts
- No test framework currently (tests would be a good addition)
- Files use CommonJS modules (`require`/`module.exports`)
- Node.js version requirement: >=10.0.0
- Designed to be installed globally (`npm install -g flatban`)

## Task Management Best Practices

When creating tasks via AI assistance:
- Use action-oriented titles (e.g., "Implement X" not just "X")
- Break large features into 3-5 smaller tasks
- Set appropriate priorities: critical > high > medium > low
- Use tags for categorization (frontend, backend, bug, feature, etc.)
- Add context in the description, not just the title
- Keep tasks focused - one clear outcome per task

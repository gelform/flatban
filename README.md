# Flatban

> A filesystem-based Kanban project management system

Flatban is a lightweight, git-friendly Kanban board that stores tasks as markdown files. Perfect for developers who want to track tasks alongside their code without external dependencies or databases.

## Features

- **Filesystem-based** - Tasks are just markdown files with YAML frontmatter
- **Git-friendly** - Plain text files that diff beautifully
- **Zero dependencies** - Pure Node.js, no external packages
- **CLI + Web UI** - Command-line interface and browser-based board viewer
- **Portable** - Copy your board anywhere, sync via git
- **Simple** - No database, no server setup, no configuration files to learn

## Installation

```bash
npm install -g flatban
```

## Quick Start

```bash
# Initialize a new board
flatban init "My Project"

# Create some tasks
flatban create "Fix login bug" --priority=high --tags=backend
flatban create "Update documentation" --priority=low

# Move tasks through your workflow
flatban move <task-id> in-progress
flatban move <task-id> done

# View your board
flatban board                    # Terminal view
flatban serve                    # Web UI at http://localhost:3847
```

## Commands

### `flatban init [name]`

Initialize a new Flatban board in the current directory.

```bash
flatban init "Q4 Sprint"
```

Creates:
- `.flatban/` directory with config and task template
- Column directories: `backlog/`, `todo/`, `in-progress/`, `review/`, `done/`
- `index.json` for fast task lookups

### `flatban create "title" [options]`

Create a new task with a unique 7-character ID.

**Options:**
- `--priority=<low|medium|high|critical>` - Task priority (default: medium)
- `--column=<column>` - Starting column (default: todo)
- `--tags=<tag1,tag2>` - Comma-separated tags
- `--assigned=<name>` - Assignee name

**Examples:**
```bash
flatban create "Implement API endpoint" --priority=high --tags=backend,api
flatban create "Write tests" --column=backlog --assigned=alice
```

### `flatban move <task-id> <column>`

Move a task to a different column.

```bash
flatban move abc1234 in-progress
flatban move abc done              # Partial IDs work too
```

Valid columns: `backlog`, `todo`, `in-progress`, `review`, `done`

### `flatban list [column] [options]`

List tasks with optional filtering.

**Options:**
- `--priority=<priority>` - Filter by priority
- `--tag=<tag>` - Filter by tag
- `--assigned=<name>` - Filter by assignee

**Examples:**
```bash
flatban list                       # All tasks
flatban list in-progress           # Tasks in specific column
flatban list --priority=high       # High-priority tasks
flatban list --tag=backend         # Tasks tagged 'backend'
```

### `flatban show <task-id>`

Show full details of a task including markdown content.

```bash
flatban show abc1234
```

### `flatban board [options]`

Display board in terminal.

**Options:**
- `--compact` - Compact view (one line per task)

```bash
flatban board                      # Spacious view
flatban board --compact            # Compact view
```

### `flatban serve [options]`

Start web viewer.

**Options:**
- `--port=<port>` - Port to run server on (default: 3847)

```bash
flatban serve                      # Starts on port 3847
flatban serve --port=8080          # Custom port
```

Then open http://localhost:3847 in your browser.

### `flatban sync`

Rebuild index from filesystem. Use after manually editing task files or pulling changes from git.

```bash
flatban sync
```

## Task File Format

Tasks are markdown files with YAML frontmatter:

**File:** `.flatban/todo/abc1234-implement-auth.md`

```markdown
---
id: abc1234
title: "Implement user authentication"
priority: high
tags: [backend, security]
assigned: alice
---

## Description

Create a secure authentication system with JWT tokens.

## Notes

- Use bcrypt for password hashing
- JWT expiry: 24 hours
- Add rate limiting

## History
- 2025-10-27 14:30: Task created
- 2025-10-27 15:45: Moved to In Progress
```

## Project Structure

After initialization:

```
your-project/
├── .flatban/
│   ├── config.yaml          # Board configuration
│   ├── template.md          # Task template
│   ├── index.json           # Task cache (auto-generated)
│   ├── backlog/             # Tasks not yet started
│   ├── todo/                # Tasks ready to work on
│   ├── in-progress/         # Tasks being worked on
│   ├── review/              # Tasks under review
│   └── done/                # Completed tasks
└── [your project files]
```

## Git Integration

Flatban works great with git:

```bash
# Add your board to git
git add .flatban/

# The index.json file can be gitignored (it's auto-generated)
echo ".flatban/index.json" >> .gitignore

# Or commit it for faster board loading
git add .flatban/index.json

git commit -m "Add Flatban board"
```

When you pull changes, run `flatban sync` to rebuild the index.

## Design Philosophy

1. **Filesystem is the source of truth** - index.json is just a cache
2. **Git-friendly** - Plain text files with meaningful diffs
3. **Status from directory** - Moving a file = changing status
4. **Zero configuration** - Works out of the box
5. **No vendor lock-in** - Your data is just markdown files

## Use Cases

- **Solo developers** - Track personal projects
- **Small teams** - Share board via git
- **Project documentation** - Keep tasks with code
- **Client work** - One board per client/project
- **Learning** - Track course progress, tutorials
- **Writing** - Manage blog posts, articles

## Tips

- Use partial IDs: `flatban move abc done` instead of the full 7-character ID
- Edit tasks directly in your editor, then run `flatban sync`
- Keep the web viewer open while working - it auto-syncs
- Customize columns in `.flatban/config.yaml`
- Archive old boards: just move the `.flatban/` directory

## License

MIT

## Contributing

Issues and pull requests welcome on [GitHub](https://github.com/yourusername/flatban)

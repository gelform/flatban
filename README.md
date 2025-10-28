# Flatban

> A filesystem-based Kanban project management system designed for AI-assisted development

Flatban is a lightweight, git-friendly Kanban board that stores tasks as markdown files. Perfect for developers who want to track tasks alongside their code without external dependencies or databases. Built from the ground up to work seamlessly with AI assistants like Claude Code for natural language task management.

## Features

- **AI-native design** - Built specifically to work with AI assistants like Claude Code
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
- `--description=<text>` - Task description (use `\n` for line breaks)
- `--notes=<text>` - Task notes (use `\n` for line breaks)

**Examples:**
```bash
flatban create "Implement API endpoint" --priority=high --tags=backend,api
flatban create "Write tests" --column=backlog --assigned=alice
flatban create "Fix dropdown bug" --description="Convert dropdown to toggle" --notes="- ContactForm.tsx:400-412 uses IonSelect\n- Required: Simple IonToggle"
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

1. **AI-first** - Designed to be controlled naturally through AI assistants
2. **Filesystem is the source of truth** - index.json is just a cache
3. **Git-friendly** - Plain text files with meaningful diffs
4. **Status from directory** - Moving a file = changing status
5. **Zero configuration** - Works out of the box
6. **No vendor lock-in** - Your data is just markdown files

## Use Cases

- **Solo developers** - Track personal projects
- **Small teams** - Share board via git
- **Project documentation** - Keep tasks with code
- **Client work** - One board per client/project
- **Learning** - Track course progress, tutorials
- **Writing** - Manage blog posts, articles

## Claude Code Integration

**Flatban was specifically designed to be used with AI assistants.** The traditional CLI commands are available, but the real power comes from natural language task management through AI.

Flatban includes a custom slash command for [Claude Code](https://claude.com/claude-code) that unlocks the full potential of AI-driven project management.

### Setup

The `.claude/commands/flatban.md` file is included with Flatban. When you're in a Flatban project directory with Claude Code, you can use:

```bash
/flatban
```

This activates Claude as your project management partner in "Flatban mode". **After running `/flatban` once, you can use natural language for the rest of the session** - no need to keep mentioning "flatban"!

Just say:
- "Do the next task"
- "Create a task for fixing the login bug"
- "Show me the board"
- "Move task abc to review"

Claude will understand you're working with Flatban and handle everything accordingly.

This activates Claude as your project management partner, understanding Flatban's structure and helping you:

- **Create tasks from natural language** - Describe your work in plain English and let Claude break it down into organized, actionable tasks
- **Manage task workflow** - Move tasks between columns with simple conversational requests
- **Break down features** - Turn complex features into logical, prioritized task lists automatically
- **Update task details** - Modify tasks naturally without worrying about YAML syntax or file structure
- **Understand your project** - Claude reads your existing tasks to provide context-aware suggestions
- **Do tasks automatically** - Ask Claude to "do" a task and it will read the requirements, implement the changes, and move the task to review

### Usage Examples

**Create tasks from a feature description:**
```
/flatban I need to add user authentication with JWT tokens and a login page
```

Claude will create multiple organized tasks with appropriate priorities, tags, descriptions, and implementation notes.

**Create a task with specific details:**
```
/flatban Create a task: Contact status is dropdown, not toggle. ContactForm.tsx:400-412 uses IonSelect. Need IonToggle instead.
```

Claude will parse your description and create a properly formatted task with all the details in the right sections.

**Move tasks:**
```
/flatban Move the authentication tasks to in-progress
```

**Get an overview:**
```
/flatban Show me all high-priority tasks
```

**Update existing tasks:**
```
/flatban Update task abc1234 to add notes about using bcrypt for password hashing
```

**Do a task (implement and move to review):**
```
/flatban Do the next task
/flatban Do task abc1234
```

Claude will read the task, implement the changes, and move it to review when complete.

### How It Works

Flatban's design makes it the perfect task system for AI collaboration. The slash command gives Claude complete context about:
- Flatban's file structure and command syntax
- Best practices for task creation and organization
- Proper YAML frontmatter formatting
- Your existing tasks and board state

Claude can then use the `flatban` CLI commands or directly manipulate task files to manage your board. Because tasks are just markdown files, AI can read, create, and modify them as easily as you can - but much faster.

**Why this matters:** Instead of clicking through a UI or memorizing commands, you can manage your entire project in natural conversation. "Break down the authentication feature into tasks" or "Show me what's blocking the release" - Flatban with AI understands and executes.

### Tips for Using with Claude Code

- Use natural language to describe features or work items
- Claude will automatically set reasonable priorities, tags, and add descriptions/notes
- Claude now uses `--description` and `--notes` flags to create fully detailed tasks in one command
- Ask Claude to show the board status: `/flatban show me the board`
- Let Claude break down complex features into smaller tasks
- Ask Claude to "do" the next task and it will implement it automatically
- After Claude creates or completes tasks, review them with `flatban board` or `flatban serve`

## Tips

- Use partial IDs: `flatban move abc done` instead of the full 7-character ID
- Edit tasks directly in your editor, then run `flatban sync`
- Keep the web viewer open while working - it auto-syncs
- Customize columns in `.flatban/config.yaml`
- Archive old boards: just move the `.flatban/` directory
- Use `/flatban` with Claude Code for AI-powered task management

## License

MIT

## Contributing

Issues and pull requests welcome on [GitHub](https://github.com/yourusername/flatban)

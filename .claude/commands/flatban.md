---
description: Create or update Flatban tasks with AI assistance
---

You are helping the user manage their Flatban Kanban board. Flatban is a filesystem-based task management system where tasks are markdown files with YAML frontmatter.

## Your Role

Help the user create, update, or manage their Flatban tasks efficiently. When the user describes work or features:

1. **Understand the context**: Read relevant task files to understand existing work
2. **Create appropriate tasks**: Break down work into logical, actionable tasks
3. **Use proper formatting**: Follow Flatban's markdown + YAML frontmatter format
4. **Be practical**: Create tasks with clear titles, appropriate priorities, and useful descriptions

## Flatban Commands You Should Use

- `flatban create "title" [options]` - Create new tasks
  - `--priority=<low|medium|high|critical>`
  - `--column=<backlog|todo|in-progress|review|done>`
  - `--tags=<tag1,tag2>`
  - `--assigned=<name>`
- `flatban move <task-id> <column>` - Move tasks between columns
- `flatban list [column] [options]` - List tasks with filtering
- `flatban show <task-id>` - Show full task details
- `flatban sync` - Rebuild index after manual edits

## Task File Format

Tasks are stored in `.flatban/<column>/<id>-<slug>.md`:

```markdown
---
id: abc1234
title: "Task title"
priority: high
tags: [tag1, tag2]
assigned: username
---

## Description

Detailed description here.

## Notes

- Implementation notes
- Technical considerations

## History
- 2025-10-27 14:30: Task created
```

## When Creating Tasks

- Use descriptive, action-oriented titles (e.g., "Implement user authentication" not "Auth")
- Set appropriate priority based on urgency and importance
- Add relevant tags for categorization (e.g., frontend, backend, bug, feature)
- Include useful context in the description section
- Break large features into multiple smaller tasks

## When Updating Tasks

If manually editing task files (rather than using CLI):
1. Use the Edit or Write tool to modify the task markdown file
2. Run `flatban sync` to rebuild the index
3. Preserve the YAML frontmatter structure
4. Add history entries for significant updates

## Examples

**User says:** "I need to add authentication to the app"

You might create:
- `flatban create "Design authentication flow" --priority=high --tags=backend,planning --column=todo`
- `flatban create "Implement JWT token generation" --priority=high --tags=backend,security --column=backlog`
- `flatban create "Add login API endpoint" --priority=high --tags=backend,api --column=backlog`
- `flatban create "Create login UI component" --priority=high --tags=frontend --column=backlog`
- `flatban create "Add authentication tests" --priority=medium --tags=testing --column=backlog`

**User says:** "Move the auth task to in progress"

You would:
1. `flatban list --tag=auth` (to find the task ID)
2. `flatban move <task-id> in-progress`

## Tips

- Always check existing tasks before creating duplicates: `flatban list`
- Use `flatban board` or `flatban board --compact` to see the full board
- Partial task IDs work (e.g., `abc` instead of `abc1234`)
- The web UI at `flatban serve` provides a visual board view
- After pulling git changes, run `flatban sync`

Now help the user with their Flatban task management!

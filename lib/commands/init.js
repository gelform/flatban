const fs = require('fs');
const path = require('path');
const { success, error } = require('../utils');

function init(args) {
    const boardName = args[0] || 'My Project Board';
    const boardPath = '.';

    // Check if already initialized
    const configFile = path.join(boardPath, '.flatban', 'config.yaml');
    if (fs.existsSync(configFile)) {
        error('Flatban board already initialized in this directory');
    }

    // Create directory structure
    const directories = [
        '.flatban',
        '.flatban/backlog',
        '.flatban/todo',
        '.flatban/in-progress',
        '.flatban/review',
        '.flatban/done'
    ];

    for (const dir of directories) {
        const dirPath = path.join(boardPath, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    // Create config.yaml
    const configContent = `# Flatban Configuration
name: "${boardName}"

columns:
  - id: backlog
    name: "Backlog"
  - id: todo
    name: "To Do"
  - id: in-progress
    name: "In Progress"
  - id: review
    name: "Review"
  - id: done
    name: "Done"

priorities:
  - low
  - medium
  - high
  - critical

# Browser notification settings
notifications:
  enabled: false              # Enable/disable browser notifications
  all_changes: false          # Notify on all task changes (moves, creates, deletes)
  notify_columns: []          # List of column IDs to notify when tasks move into them (e.g., [review, done])
`;

    fs.writeFileSync(configFile, configContent);

    // Create template.md
    const templateFile = path.join(boardPath, '.flatban', 'template.md');
    const templateContent = `---
id: {id}
title: "{title}"
priority: {priority}
tags: {tags}
assigned: {assigned}
---

## Description



## Notes



## History
- {datetime}: Task created
`;

    fs.writeFileSync(templateFile, templateContent);

    // Create initial empty index.json
    const index = {
        version: '1.0',
        board_name: boardName,
        last_sync: new Date().toISOString(),
        tasks: {},
        columns: {
            'backlog': 0,
            'todo': 0,
            'in-progress': 0,
            'review': 0,
            'done': 0
        }
    };

    const indexFile = path.join(boardPath, '.flatban', 'index.json');
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));

    success(`Board initialized: ${boardName}`);
    success(`Created directories: ${directories.join(', ')}`);
    console.log('');
    console.log('To view the board in your browser, run:');
    console.log('  flatban serve');
    console.log('');
}

module.exports = init;

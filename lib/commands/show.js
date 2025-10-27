const fs = require('fs');
const path = require('path');
const {
    loadConfig,
    loadIndex,
    findTaskByPartialId,
    parseFrontmatter,
    error
} = require('../utils');

function show(args) {
    const boardPath = '.';

    // Parse arguments
    const taskId = args[0];

    if (!taskId) {
        error('Usage: flatban show <task-id>');
    }

    // Load config and index
    const config = loadConfig(boardPath);
    const index = loadIndex(boardPath);

    // Find full task ID
    const fullTaskId = findTaskByPartialId(index, taskId);

    if (!index.tasks[fullTaskId]) {
        error(`Task not found: ${taskId}`);
    }

    const task = index.tasks[fullTaskId];

    // Read full file content
    const taskFile = path.join(boardPath, task.file);

    if (!fs.existsSync(taskFile)) {
        error(`Task file not found: ${task.file}. Run 'flatban sync' to rebuild index.`);
    }

    const content = fs.readFileSync(taskFile, 'utf8');

    // Parse frontmatter and body
    const { frontmatter, body } = parseFrontmatter(content);

    // Display formatted task details
    console.log('');
    console.log(`Task: ${fullTaskId}`);
    console.log(`Title: ${task.title}`);
    console.log(`Status: ${task.status}`);
    console.log(`Priority: ${task.priority}`);

    if (task.tags && task.tags.length > 0) {
        console.log(`Tags: ${task.tags.join(', ')}`);
    }

    if (task.assigned) {
        console.log(`Assigned: ${task.assigned}`);
    }

    const created = new Date(task.created).toISOString().substring(0, 16).replace('T', ' ');
    const modified = new Date(task.modified).toISOString().substring(0, 16).replace('T', ' ');

    console.log(`Created: ${created}`);
    console.log(`Modified: ${modified}`);
    console.log('');
    console.log('─'.repeat(60));
    console.log('');
    console.log(body.trim());
    console.log('');
}

module.exports = show;

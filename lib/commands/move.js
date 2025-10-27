const fs = require('fs');
const path = require('path');
const {
    loadConfig,
    loadIndex,
    saveIndex,
    findTaskByPartialId,
    appendToHistory,
    success,
    error
} = require('../utils');

function move(args) {
    const boardPath = '.';

    // Parse arguments
    const taskId = args[0];
    const targetColumn = args[1];

    if (!taskId || !targetColumn) {
        error('Usage: flatban move <task-id> <column>');
    }

    // Load config and index
    const config = loadConfig(boardPath);
    const index = loadIndex(boardPath);

    // Find full task ID
    const fullTaskId = findTaskByPartialId(index, taskId);

    // Validate target column
    const validColumns = config.columns.map(c => c.id);
    if (!validColumns.includes(targetColumn)) {
        error(`Invalid column: ${targetColumn}. Valid columns: ${validColumns.join(', ')}`);
    }

    const task = index.tasks[fullTaskId];
    const oldColumn = task.status;

    // Check if already in target column
    if (oldColumn === targetColumn) {
        success(`Task ${fullTaskId} already in ${targetColumn}`);
        return;
    }

    // Move file
    const oldPath = path.join(boardPath, task.file);
    const newFilename = path.basename(task.file);
    const newPath = path.join(boardPath, '.flatban', targetColumn, newFilename);

    if (!fs.existsSync(oldPath)) {
        error(`Task file not found: ${task.file}. Run 'flatban sync' to rebuild index.`);
    }

    fs.renameSync(oldPath, newPath);

    // Update task history
    const targetColumnName = config.columns.find(c => c.id === targetColumn)?.name || 'unknown';
    appendToHistory(newPath, `Moved to ${targetColumnName}`);

    // Update index
    index.tasks[fullTaskId].file = `.flatban/${targetColumn}/${newFilename}`;
    index.tasks[fullTaskId].status = targetColumn;

    const stats = fs.statSync(newPath);
    index.tasks[fullTaskId].modified = stats.mtime.toISOString();

    index.columns[oldColumn]--;
    index.columns[targetColumn]++;

    saveIndex(index, boardPath);

    success(`Moved ${fullTaskId} to ${targetColumn}`);
}

module.exports = move;

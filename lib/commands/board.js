const { loadConfig, loadIndex } = require('../utils');

function board(args, options = {}) {
    const boardPath = '.';
    const compact = options.compact || false;

    // Load config and index
    const config = loadConfig(boardPath);
    const index = loadIndex(boardPath);

    const columns = config.columns;
    const columnWidth = 22; // Width of each column

    // Print header
    let header = '';
    for (const column of columns) {
        const count = index.columns[column.id] || 0;
        const headerText = `${column.name} (${count})`;
        header += headerText.padEnd(columnWidth);
    }
    console.log(header);
    console.log('═'.repeat(columnWidth * columns.length));

    if (compact) {
        // Compact mode: one line per task
        // Group tasks by column
        const tasksByColumn = {};
        for (const column of columns) {
            tasksByColumn[column.id] = [];
        }

        for (const [id, task] of Object.entries(index.tasks)) {
            tasksByColumn[task.status].push({ id, ...task });
        }

        // Find max tasks in any column
        let maxTasks = 0;
        for (const column of columns) {
            const count = tasksByColumn[column.id].length;
            if (count > maxTasks) maxTasks = count;
        }

        // Print rows
        for (let i = 0; i < maxTasks; i++) {
            let row = '';
            for (const column of columns) {
                const tasks = tasksByColumn[column.id];
                if (i < tasks.length) {
                    const task = tasks[i];
                    const taskText = `${task.id.substring(0, 7)} ${task.title.substring(0, 12)}`;
                    row += taskText.substring(0, columnWidth - 1).padEnd(columnWidth);
                } else {
                    row += ''.padEnd(columnWidth);
                }
            }
            console.log(row);
        }
    } else {
        // Spacious mode: ID above title, blank line between tasks
        const tasksByColumn = {};
        for (const column of columns) {
            tasksByColumn[column.id] = [];
        }

        for (const [id, task] of Object.entries(index.tasks)) {
            tasksByColumn[task.status].push({ id, ...task });
        }

        // Find max tasks in any column
        let maxTasks = 0;
        for (const column of columns) {
            const count = tasksByColumn[column.id].length;
            if (count > maxTasks) maxTasks = count;
        }

        // Print tasks (each task takes 3 lines: ID, title, blank)
        for (let i = 0; i < maxTasks; i++) {
            // ID line
            let idRow = '';
            for (const column of columns) {
                const tasks = tasksByColumn[column.id];
                if (i < tasks.length) {
                    const task = tasks[i];
                    idRow += task.id.padEnd(columnWidth);
                } else {
                    idRow += ''.padEnd(columnWidth);
                }
            }
            console.log(idRow);

            // Title line
            let titleRow = '';
            for (const column of columns) {
                const tasks = tasksByColumn[column.id];
                if (i < tasks.length) {
                    const task = tasks[i];
                    const truncated = task.title.substring(0, columnWidth - 1);
                    titleRow += truncated.padEnd(columnWidth);
                } else {
                    titleRow += ''.padEnd(columnWidth);
                }
            }
            console.log(titleRow);

            // Blank line
            console.log('');
        }
    }

    console.log('═'.repeat(columnWidth * columns.length));
    console.log(`Total: ${Object.keys(index.tasks).length} task(s)`);
}

module.exports = board;

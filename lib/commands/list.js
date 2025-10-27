const { loadConfig, loadIndex, error } = require('../utils');

function list(args, options = {}) {
    const boardPath = '.';

    // Load config and index
    const config = loadConfig(boardPath);
    const index = loadIndex(boardPath);

    // Parse filters
    const columnFilter = args[0] || null;
    const priorityFilter = options.priority || null;
    const tagFilter = options.tag || null;
    const assignedFilter = options.assigned || null;

    // Validate column filter
    if (columnFilter) {
        const validColumns = config.columns.map(c => c.id);
        if (!validColumns.includes(columnFilter)) {
            error(`Invalid column: ${columnFilter}. Valid columns: ${validColumns.join(', ')}`);
        }
    }

    // Filter tasks
    let tasks = Object.entries(index.tasks);

    if (columnFilter) {
        tasks = tasks.filter(([id, task]) => task.status === columnFilter);
    }

    if (priorityFilter) {
        tasks = tasks.filter(([id, task]) => task.priority === priorityFilter);
    }

    if (tagFilter) {
        tasks = tasks.filter(([id, task]) => task.tags && task.tags.includes(tagFilter));
    }

    if (assignedFilter) {
        tasks = tasks.filter(([id, task]) => task.assigned === assignedFilter);
    }

    // Sort by modified date, newest first
    tasks.sort((a, b) => {
        const dateA = new Date(a[1].modified);
        const dateB = new Date(b[1].modified);
        return dateB - dateA;
    });

    // Print header
    console.log('ID       Title                          Column        Priority   Created           Modified');
    console.log('-'.repeat(110));

    // Print tasks
    for (const [id, task] of tasks) {
        const title = task.title.substring(0, 30).padEnd(30);
        const column = task.status.substring(0, 13).padEnd(13);
        const priority = task.priority.padEnd(10);
        const created = new Date(task.created).toISOString().substring(0, 16).replace('T', ' ');
        const modified = new Date(task.modified).toISOString().substring(0, 16).replace('T', ' ');

        console.log(`${id}  ${title} ${column} ${priority} ${created}  ${modified}`);
    }

    console.log('');
    console.log(`Total: ${tasks.length} task(s)`);
}

module.exports = list;

const fs = require('fs');
const path = require('path');
const {
    loadConfig,
    loadIndex,
    saveIndex,
    generateTaskId,
    slugify,
    success,
    error
} = require('../utils');

function create(args, options = {}) {
    const boardPath = '.';

    // Parse arguments
    const title = args[0];
    if (!title) {
        error('Task title required. Usage: flatban create "Task title"');
    }

    // Parse options
    const priority = options.priority || 'medium';
    const column = options.column || 'todo';
    const tags = options.tags ? options.tags.split(',').map(t => t.trim()) : [];
    const assigned = options.assigned || '';
    const description = options.description ? options.description.replace(/\\n/g, '\n') : '';
    const notes = options.notes ? options.notes.replace(/\\n/g, '\n') : '';

    // Load config and index
    const config = loadConfig(boardPath);
    const index = loadIndex(boardPath);

    // Validate column
    const validColumns = config.columns.map(c => c.id);
    if (!validColumns.includes(column)) {
        error(`Invalid column: ${column}. Valid columns: ${validColumns.join(', ')}`);
    }

    // Validate priority
    if (!config.priorities.includes(priority)) {
        error(`Invalid priority: ${priority}. Valid priorities: ${config.priorities.join(', ')}`);
    }

    // Generate unique task ID
    const taskId = generateTaskId(index);

    // Create filename
    const slug = slugify(title);
    const filename = `.flatban/${column}/${taskId}-${slug}.md`;
    const filepath = path.join(boardPath, filename);

    // Load template
    const templatePath = path.join(boardPath, '.flatban', 'template.md');
    let template = fs.readFileSync(templatePath, 'utf8');

    // Fill template
    const tagsStr = tags.length === 0 ? '[]' : `[${tags.join(', ')}]`;
    const datetime = new Date().toISOString().replace('T', ' ').substring(0, 16);

    template = template.replace('{id}', taskId);
    template = template.replace('{title}', title);
    template = template.replace('{priority}', priority);
    template = template.replace('{tags}', tagsStr);
    template = template.replace('{assigned}', assigned);
    template = template.replace('{datetime}', datetime);

    // Add description and notes content if provided
    if (description) {
        template = template.replace('## Description\n\n\n', `## Description\n\n${description}\n`);
    }
    if (notes) {
        template = template.replace('## Notes\n\n\n', `## Notes\n\n${notes}\n`);
    }

    // Write file
    fs.writeFileSync(filepath, template);

    // Get file stats
    const stats = fs.statSync(filepath);

    // Update index
    index.tasks[taskId] = {
        file: filename,
        title: title,
        status: column,
        priority: priority,
        tags: tags,
        assigned: assigned,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString()
    };

    index.columns[column]++;

    saveIndex(index, boardPath);

    success(`Created task: ${taskId}`);
}

module.exports = create;

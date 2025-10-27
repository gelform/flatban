const fs = require('fs');
const path = require('path');
const {
    loadConfig,
    saveIndex,
    parseFrontmatter,
    success,
    error
} = require('../utils');

function sync(args) {
    const boardPath = '.';

    // Load config
    const config = loadConfig(boardPath);

    // Initialize new index
    const index = {
        version: '1.0',
        board_name: config.name,
        last_sync: new Date().toISOString(),
        tasks: {},
        columns: {}
    };

    // Initialize column counts
    for (const column of config.columns) {
        index.columns[column.id] = 0;
    }

    let taskCount = 0;
    let errorCount = 0;

    // Scan all column directories
    for (const column of config.columns) {
        const columnDir = path.join(boardPath, '.flatban', column.id);

        if (!fs.existsSync(columnDir)) {
            continue;
        }

        // Find all .md files
        const files = fs.readdirSync(columnDir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(columnDir, f));

        for (const taskFile of files) {
            try {
                // Read file
                const content = fs.readFileSync(taskFile, 'utf8');

                // Parse frontmatter
                const { frontmatter, body } = parseFrontmatter(content);

                const taskId = frontmatter.id;
                if (!taskId) {
                    console.error(`Warning: No ID in ${taskFile}`);
                    errorCount++;
                    continue;
                }

                // Get filesystem timestamps
                const stats = fs.statSync(taskFile);
                const created = stats.birthtime.toISOString();
                const modified = stats.mtime.toISOString();

                // Add to index
                const relativePath = path.relative(boardPath, taskFile);
                index.tasks[taskId] = {
                    file: relativePath,
                    title: frontmatter.title || 'Untitled',
                    status: column.id,
                    priority: frontmatter.priority || 'medium',
                    tags: frontmatter.tags || [],
                    assigned: frontmatter.assigned || '',
                    created: created,
                    modified: modified
                };

                // Increment column count
                index.columns[column.id]++;
                taskCount++;

            } catch (err) {
                console.error(`Warning: Could not parse ${taskFile}: ${err.message}`);
                errorCount++;
            }
        }
    }

    // Save index
    saveIndex(index, boardPath);

    success(`Synced ${taskCount} tasks across ${config.columns.length} columns`);
    if (errorCount > 0) {
        console.log(`Warning: ${errorCount} file(s) had errors`);
    }
}

module.exports = sync;

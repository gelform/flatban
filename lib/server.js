const http = require('http');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { loadConfig, loadIndex, saveIndex, parseFrontmatter, findTaskByPartialId, appendToHistory } = require('./utils');

function createServer(boardPath, port) {
    const server = http.createServer((req, res) => {
        // Handle API endpoint for status/polling
        if (req.method === 'GET' && req.url === '/api/status') {
            try {
                const index = loadIndex(boardPath);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    last_sync: index.last_sync,
                    timestamp: new Date().toISOString()
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        // Handle API endpoint for moving tasks
        if (req.method === 'POST' && req.url === '/api/move') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const { taskId, targetColumn } = JSON.parse(body);

                    const config = loadConfig(boardPath);
                    const index = loadIndex(boardPath);

                    // Find full task ID
                    const fullTaskId = findTaskByPartialId(index, taskId);

                    // Validate target column
                    const validColumns = config.columns.map(c => c.id);
                    if (!validColumns.includes(targetColumn)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Invalid column' }));
                        return;
                    }

                    const task = index.tasks[fullTaskId];
                    const oldColumn = task.status;

                    // Check if already in target column
                    if (oldColumn === targetColumn) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                        return;
                    }

                    // Move file
                    const oldPath = path.join(boardPath, task.file);
                    const newFilename = path.basename(task.file);
                    const newPath = path.join(boardPath, '.flatban', targetColumn, newFilename);

                    if (!fs.existsSync(oldPath)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Task file not found' }));
                        return;
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

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
            return;
        }

        // Serve the root path
        if (req.url !== '/' && req.url !== '/index.html') {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        try {
            // Load config and index
            const config = loadConfig(boardPath);
            let index = loadIndex(boardPath);

            // Check if sync needed and rebuild if necessary
            if (checkIfSyncNeeded(index, config, boardPath)) {
                index = rebuildIndex(config, boardPath);
            }

            // Generate HTML
            const html = generateHTML(config, index, boardPath);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } catch (err) {
            res.writeHead(500);
            res.end(`Error: ${err.message}`);
        }
    });

    server.listen(port, () => {
        console.log(`\n✓ Web viewer running at http://localhost:${port}`);
        console.log('Press Ctrl+C to stop\n');
    });

    return server;
}

function checkIfSyncNeeded(index, config, boardPath) {
    if (!index.last_sync) {
        return true;
    }

    const lastSync = new Date(index.last_sync).getTime();

    for (const column of config.columns) {
        const columnDir = path.join(boardPath, '.flatban', column.id);

        if (!fs.existsSync(columnDir)) {
            continue;
        }

        const files = fs.readdirSync(columnDir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(columnDir, f));

        for (const file of files) {
            const stats = fs.statSync(file);
            if (stats.mtimeMs > lastSync) {
                return true;
            }
        }
    }

    return false;
}

function rebuildIndex(config, boardPath) {
    const index = {
        version: '1.0',
        board_name: config.name,
        last_sync: new Date().toISOString(),
        tasks: {},
        columns: {}
    };

    for (const column of config.columns) {
        index.columns[column.id] = 0;
    }

    for (const column of config.columns) {
        const columnDir = path.join(boardPath, '.flatban', column.id);

        if (!fs.existsSync(columnDir)) {
            continue;
        }

        const files = fs.readdirSync(columnDir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(columnDir, f));

        for (const taskFile of files) {
            try {
                const content = fs.readFileSync(taskFile, 'utf8');
                const { frontmatter, body } = parseFrontmatter(content);

                const taskId = frontmatter.id;
                if (!taskId) continue;

                const stats = fs.statSync(taskFile);
                const relativePath = path.relative(boardPath, taskFile);

                index.tasks[taskId] = {
                    file: relativePath,
                    title: frontmatter.title || 'Untitled',
                    status: column.id,
                    priority: frontmatter.priority || 'medium',
                    tags: frontmatter.tags || [],
                    assigned: frontmatter.assigned || '',
                    created: stats.birthtime.toISOString(),
                    modified: stats.mtime.toISOString(),
                    body: body
                };

                index.columns[column.id]++;
            } catch (err) {
                console.error(`Warning: Could not parse ${taskFile}`);
            }
        }
    }

    // Save updated index
    const indexFile = path.join(boardPath, '.flatban', 'index.json');
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));

    return index;
}

function formatDatetime(timestamp) {
    const date = new Date(timestamp);
    const month = date.toLocaleString('en', { month: 'short' });
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${hours}:${minutes}`;
}

function generateHTML(config, index, boardPath) {
    const tasksByColumn = {};
    for (const column of config.columns) {
        tasksByColumn[column.id] = [];
    }

    // Group tasks by column and add body content
    for (const [taskId, task] of Object.entries(index.tasks)) {
        // Always read task body fresh from file to ensure history is up to date
        try {
            const taskFile = path.join(boardPath, task.file);
            const content = fs.readFileSync(taskFile, 'utf8');
            const { body } = parseFrontmatter(content);
            task.body = body;
        } catch (err) {
            task.body = '';
        }

        tasksByColumn[task.status].push({ id: taskId, ...task });
    }

    // Sort each column by modified date, newest first
    for (const column of config.columns) {
        tasksByColumn[column.id].sort((a, b) => {
            return new Date(b.modified) - new Date(a.modified);
        });
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(config.name)} - Flatban</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f0f2f5;
            margin: 0;
            padding: 0;
            overflow: hidden;
        }

        .board {
            display: flex;
            gap: 16px;
            padding: 20px 20px 60px 20px;
            overflow-x: auto;
            overflow-y: hidden;
            height: 100vh;
            box-sizing: border-box;
        }

        .column {
            flex: 1;
            min-width: 200px;
            background: #ebecf0;
            border-radius: 8px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            height: calc(100vh - 100px);
        }

        .column-header {
            font-weight: 600;
            font-size: 14px;
            color: #172b4d;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 4px;
            flex-shrink: 0;
        }

        .column-count {
            background: #dfe1e6;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }

        .column-tasks {
            flex: 1;
            overflow-y: auto;
            padding: 0 2px;
        }

        .task {
            background: white;
            padding: 12px;
            margin-bottom: 8px;
            border-radius: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: box-shadow 0.2s;
            border-left: 4px solid #dfe1e6;
            text-decoration: none;
            color: inherit;
            display: block;
        }

        .task:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }

        .task.dragging {
            opacity: 0.5;
            cursor: grabbing;
        }

        .column-tasks.drag-over {
            background: #e3e8ef;
            border-radius: 4px;
        }

        .drop-indicator {
            display: none;
            height: 4px;
            background: #3498db;
            border-radius: 2px;
            margin: 8px 0;
            transition: all 0.2s;
        }

        .drop-indicator.active {
            display: block;
            height: 40px;
            background: #e3f2fd;
            border: 2px dashed #3498db;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #3498db;
            font-size: 13px;
            font-weight: 500;
        }

        .drop-indicator.active::after {
            content: 'Drop here';
        }

        .task.priority-critical {
            border-left-color: #e74c3c;
        }

        .task.priority-high {
            border-left-color: #e67e22;
        }

        .task.priority-medium {
            border-left-color: #3498db;
        }

        .task.priority-low {
            border-left-color: #95a5a6;
        }

        .task-id {
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 10px;
            color: #5e6c84;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
        }

        .task-title {
            font-weight: 500;
            font-size: 14px;
            color: #172b4d;
            margin-bottom: 8px;
            line-height: 1.4;
        }

        .task-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: #5e6c84;
            flex-wrap: wrap;
        }

        .task-tag {
            background: #dfe1e6;
            padding: 2px 6px;
            border-radius: 3px;
            margin-right: 6px;
        }

        .task-tag:last-child {
            margin-right: 0;
        }

        .task-assigned {
            color: #0052cc;
        }

        footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #5e6c84;
            font-size: 12px;
            background: white;
            border-top: 1px solid #dfe1e6;
            z-index: 10;
        }

        footer h1 {
            font-size: 16px;
            color: #172b4d;
            margin: 0;
            font-weight: 600;
        }

        .footer-info {
            color: #5e6c84;
            font-size: 11px;
        }

        /* Modal Styles */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            overflow-y: auto;
            padding: 20px;
        }

        .modal:target {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background: white;
            border-radius: 8px;
            max-width: 700px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            position: relative;
            padding: 24px;
        }

        .modal-close {
            position: absolute;
            top: 16px;
            right: 16px;
            font-size: 32px;
            color: #5e6c84;
            text-decoration: none;
            line-height: 1;
            cursor: pointer;
            transition: color 0.2s;
        }

        .modal-close:hover {
            color: #172b4d;
        }

        .modal-header {
            margin-bottom: 20px;
            padding-right: 40px;
        }

        .modal-id {
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 12px;
            color: #5e6c84;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
        }

        .modal-header h2 {
            font-size: 24px;
            color: #172b4d;
            margin: 0;
            font-weight: 600;
        }

        .modal-meta {
            background: #f4f5f7;
            padding: 16px;
            border-radius: 4px;
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }

        .meta-item {
            font-size: 13px;
            color: #172b4d;
        }

        .meta-item strong {
            color: #5e6c84;
            font-weight: 600;
            display: inline-block;
            margin-right: 6px;
        }

        .priority-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
        }

        .priority-badge.priority-critical {
            background: #e74c3c;
            color: white;
        }

        .priority-badge.priority-high {
            background: #e67e22;
            color: white;
        }

        .priority-badge.priority-medium {
            background: #3498db;
            color: white;
        }

        .priority-badge.priority-low {
            background: #95a5a6;
            color: white;
        }

        .modal-body {
            font-size: 14px;
            line-height: 1.6;
            color: #172b4d;
        }

        .modal-body h2 {
            font-size: 18px;
            font-weight: 600;
            margin: 16px 0 8px 0;
            color: #172b4d;
        }

        .modal-body h2:first-child {
            margin-top: 0;
        }

        .modal-body p {
            margin: 0 0 12px 0;
        }

        .modal-body p:last-child {
            margin-bottom: 0;
        }

        .modal-body ul, .modal-body ol {
            margin: 0 0 12px 0;
            padding-left: 24px;
        }

        .modal-body li {
            margin-bottom: 4px;
        }

        .modal-body code {
            background: #f4f5f7;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="board">
        ${config.columns.map(column => {
            const tasks = tasksByColumn[column.id] || [];
            return `
        <div class="column" data-column-id="${escapeHtml(column.id)}">
            <div class="column-header">
                <span>${escapeHtml(column.name)}</span>
                <span class="column-count">${index.columns[column.id] || 0}</span>
            </div>
            <div class="column-tasks" data-column-id="${escapeHtml(column.id)}">
                <div class="drop-indicator"></div>
                ${tasks.map(task => `
                <a href="#task-${escapeHtml(task.id)}" class="task priority-${escapeHtml(task.priority)}" title="${escapeHtml(task.id)}" draggable="true" data-task-id="${escapeHtml(task.id)}" data-column-id="${escapeHtml(column.id)}">
                    <div class="task-id">${escapeHtml(task.id)}</div>
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    <div class="task-meta">
                        ${task.tags && task.tags.length > 0 ? task.tags.map(tag =>
                            `<span class="task-tag">${escapeHtml(tag)}</span>`
                        ).join('') : ''}
                        ${task.assigned ? `<span class="task-assigned">@${escapeHtml(task.assigned)}</span>` : ''}
                    </div>
                </a>

                <!-- Modal for this task -->
                <div id="task-${escapeHtml(task.id)}" class="modal">
                    <div class="modal-content">
                        <a href="#" class="modal-close">&times;</a>
                        <div class="modal-header">
                            <div class="modal-id">${escapeHtml(task.id)}</div>
                            <h2>${escapeHtml(task.title)}</h2>
                        </div>
                        <div class="modal-meta">
                            <div class="meta-item">
                                <strong>Status:</strong> ${escapeHtml(task.status)}
                            </div>
                            <div class="meta-item">
                                <strong>Priority:</strong>
                                <span class="priority-badge priority-${escapeHtml(task.priority)}">
                                    ${escapeHtml(task.priority)}
                                </span>
                            </div>
                            ${task.tags && task.tags.length > 0 ? `
                            <div class="meta-item">
                                <strong>Tags:</strong>
                                ${task.tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}
                            </div>
                            ` : ''}
                            ${task.assigned ? `
                            <div class="meta-item">
                                <strong>Assigned:</strong> @${escapeHtml(task.assigned)}
                            </div>
                            ` : ''}
                            <div class="meta-item">
                                <strong>Created:</strong> ${formatDatetime(task.created)}
                            </div>
                            <div class="meta-item">
                                <strong>Modified:</strong> ${formatDatetime(task.modified)}
                            </div>
                        </div>
                        <div class="modal-body">${formatMarkdown(task.body || '')}</div>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
            `;
        }).join('')}
    </div>

    <footer>
        <h1>${escapeHtml(config.name)}</h1>
        <div class="footer-info">
            Last synced: ${formatDatetime(index.last_sync)} &middot; Flatban v1.0
        </div>
    </footer>

    <script>
        // Drag and drop functionality
        let draggedTask = null;

        // Handle drag start
        document.querySelectorAll('.task').forEach(task => {
            task.addEventListener('dragstart', (e) => {
                draggedTask = e.target;
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', e.target.innerHTML);
            });

            task.addEventListener('dragend', (e) => {
                e.target.classList.remove('dragging');
                draggedTask = null;

                // Hide all drop indicators
                document.querySelectorAll('.drop-indicator').forEach(indicator => {
                    indicator.classList.remove('active');
                });

                // Remove drag-over class from all columns
                document.querySelectorAll('.column-tasks').forEach(col => {
                    col.classList.remove('drag-over');
                });
            });
        });

        // Handle drop zones
        document.querySelectorAll('.column-tasks').forEach(column => {
            const dropIndicator = column.querySelector('.drop-indicator');

            column.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                column.classList.add('drag-over');

                // Show drop indicator
                if (dropIndicator) {
                    dropIndicator.classList.add('active');
                }
            });

            column.addEventListener('dragleave', (e) => {
                // Check if we're actually leaving the column (not just entering a child)
                const rect = column.getBoundingClientRect();
                const x = e.clientX;
                const y = e.clientY;

                // If cursor is outside column bounds, hide indicator
                if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                    column.classList.remove('drag-over');
                    if (dropIndicator) {
                        dropIndicator.classList.remove('active');
                    }
                }
            });

            column.addEventListener('drop', (e) => {
                e.preventDefault();
                column.classList.remove('drag-over');

                // Hide drop indicator
                if (dropIndicator) {
                    dropIndicator.classList.remove('active');
                }

                if (!draggedTask) return;

                const taskId = draggedTask.dataset.taskId;
                const oldColumn = draggedTask.dataset.columnId;
                const newColumn = column.dataset.columnId;

                if (oldColumn === newColumn) return;

                // Send move request to server
                fetch('/api/move', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        taskId: taskId,
                        targetColumn: newColumn
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Reload page to show updated board
                        window.location.reload();
                    } else {
                        alert('Failed to move task: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(error => {
                    console.error('Error moving task:', error);
                    alert('Failed to move task');
                });
            });
        });

        // Auto-refresh polling
        let lastSync = ${JSON.stringify(index.last_sync)};
        let pollInterval = null;

        function checkForUpdates() {
            fetch('/api/status')
                .then(response => response.json())
                .then(data => {
                    if (data.last_sync && data.last_sync !== lastSync) {
                        console.log('Board updated, refreshing...');
                        window.location.reload();
                    }
                })
                .catch(error => {
                    console.error('Error checking for updates:', error);
                });
        }

        function startPolling() {
            if (pollInterval) return; // Already polling
            pollInterval = setInterval(checkForUpdates, 3000); // Poll every 3 seconds
        }

        function stopPolling() {
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
        }

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopPolling();
            } else {
                // Tab became visible - check immediately and resume polling
                checkForUpdates();
                startPolling();
            }
        });

        // Start polling if page is visible
        if (!document.hidden) {
            startPolling();
        }
    </script>
</body>
</html>`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatMarkdown(text) {
    if (!text) return '';

    // Remove excessive blank lines
    text = text.trim().replace(/\n{3,}/g, '\n\n');

    // Use marked to convert markdown to HTML
    // marked automatically escapes HTML for security
    return marked(text, {
        headerIds: false,
        mangle: false
    });
}

module.exports = { createServer };

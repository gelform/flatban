const http = require('http');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const { loadConfig, loadIndex, saveIndex, parseFrontmatter, findTaskByPartialId, appendToHistory } = require('./utils');

// Track SSE clients
const sseClients = [];

function broadcastUpdate(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => {
        try {
            client.write(message);
        } catch (err) {
            // Client disconnected, will be cleaned up
        }
    });
}

function createServer(boardPath, port) {
    // Watch .flatban directory for changes (CLI commands)
    const watchPath = path.join(boardPath, '.flatban');
    let watchDebounce = null;

    try {
        fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
            // Ignore index.json changes (we cause those)
            if (filename && filename.includes('index.json')) {
                return;
            }

            // Debounce to avoid multiple rapid updates
            clearTimeout(watchDebounce);
            watchDebounce = setTimeout(() => {
                console.log('Filesystem change detected, broadcasting update...');
                broadcastUpdate({
                    type: 'update',
                    timestamp: new Date().toISOString(),
                    source: 'filesystem'
                });
            }, 100);
        });
    } catch (err) {
        console.warn('Could not watch .flatban directory:', err.message);
    }

    const server = http.createServer((req, res) => {
        // Handle SSE endpoint for real-time updates
        if (req.method === 'GET' && req.url === '/api/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            // Send initial connection message
            res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

            // Add client to list
            sseClients.push(res);

            // Remove client when connection closes
            req.on('close', () => {
                const index = sseClients.indexOf(res);
                if (index !== -1) {
                    sseClients.splice(index, 1);
                }
            });

            return;
        }

        // Handle API endpoint for status/polling (kept for backwards compatibility)
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

                    // Broadcast update to all connected SSE clients
                    broadcastUpdate({
                        type: 'update',
                        action: 'move',
                        taskId: fullTaskId,
                        taskTitle: task.title,
                        fromColumn: oldColumn,
                        toColumn: targetColumn,
                        toColumnName: targetColumnName,
                        last_sync: index.last_sync,
                        timestamp: new Date().toISOString()
                    });

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
            return;
        }

        // Handle API endpoint for deleting tasks
        if (req.method === 'POST' && req.url === '/api/delete') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const { taskId } = JSON.parse(body);

                    const config = loadConfig(boardPath);
                    const index = loadIndex(boardPath);

                    // Find full task ID
                    const fullTaskId = findTaskByPartialId(index, taskId);

                    const task = index.tasks[fullTaskId];
                    if (!task) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Task not found' }));
                        return;
                    }

                    // Delete file
                    const taskPath = path.join(boardPath, task.file);
                    if (fs.existsSync(taskPath)) {
                        fs.unlinkSync(taskPath);
                    }

                    // Update index
                    const taskColumn = task.status;
                    const taskTitle = task.title;
                    delete index.tasks[fullTaskId];
                    index.columns[taskColumn]--;

                    saveIndex(index, boardPath);

                    // Broadcast update to all connected SSE clients
                    broadcastUpdate({
                        type: 'update',
                        action: 'delete',
                        taskId: fullTaskId,
                        taskTitle: taskTitle,
                        last_sync: index.last_sync,
                        timestamp: new Date().toISOString()
                    });

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
            padding: 80px 20px 20px 20px;
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

        header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #5e6c84;
            font-size: 12px;
            background: white;
            border-bottom: 1px solid #dfe1e6;
            z-index: 10;
        }

        header h1 {
            font-size: 18px;
            color: #172b4d;
            margin: 0;
            font-weight: 600;
        }

        .header-info {
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

        .modal-actions {
            margin-top: 24px;
            padding-top: 24px;
            border-top: 1px solid #dfe1e6;
            display: flex;
            justify-content: flex-end;
        }

        .btn-delete {
            background: #e74c3c;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }

        .btn-delete:hover {
            background: #c0392b;
        }

        .btn-delete:active {
            transform: scale(0.98);
        }
    </style>
</head>
<body>
    <header>
        <h1>${escapeHtml(config.name)}</h1>
        <div class="header-info">
            Flatban v1.0
        </div>
    </header>

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
                        <div class="modal-actions">
                            <button class="btn-delete" onclick="deleteTask('${escapeHtml(task.id)}', '${escapeHtml(task.title)}'); return false;">
                                Delete Task
                            </button>
                        </div>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
            `;
        }).join('')}
    </div>

    <script>
        // Configuration from server
        const boardConfig = ${JSON.stringify({
            notifications: config.notifications || {
                enabled: false,
                all_changes: false,
                notify_columns: []
            }
        })};

        // Browser notification support
        let notificationsPermission = 'default';

        // Request notification permission on load if notifications are enabled
        if (boardConfig.notifications.enabled && 'Notification' in window) {
            notificationsPermission = Notification.permission;

            if (notificationsPermission === 'default') {
                Notification.requestPermission().then(permission => {
                    notificationsPermission = permission;
                    if (permission === 'granted') {
                        console.log('Notification permission granted');
                    }
                });
            }
        }

        function showNotification(title, body, icon = '📋') {
            if (!boardConfig.notifications.enabled || !('Notification' in window)) {
                return;
            }

            if (notificationsPermission === 'granted') {
                try {
                    new Notification(title, {
                        body: body,
                        icon: '/favicon.ico',
                        badge: '/favicon.ico',
                        tag: 'flatban-update',
                        requireInteraction: false
                    });
                } catch (err) {
                    console.error('Failed to show notification:', err);
                }
            }
        }

        function shouldNotify(updateData) {
            if (!boardConfig.notifications.enabled) {
                return false;
            }

            // Always skip if this is the active tab (user can see the change)
            if (document.hasFocus()) {
                return false;
            }

            // Notify on all changes if configured
            if (boardConfig.notifications.all_changes) {
                return true;
            }

            // Check if we should notify for specific column moves
            if (updateData.action === 'move' && updateData.toColumn) {
                return boardConfig.notifications.notify_columns.includes(updateData.toColumn);
            }

            return false;
        }

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

        // Server-Sent Events for real-time updates
        let eventSource = null;

        function connectSSE() {
            if (eventSource) {
                eventSource.close();
            }

            eventSource = new EventSource('/api/events');

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'update') {
                        console.log('Board updated via SSE, refreshing...');

                        // Check if we should show a notification
                        if (shouldNotify(data)) {
                            let notificationTitle = 'Flatban Update';
                            let notificationBody = '';

                            if (data.action === 'move') {
                                notificationTitle = 'Task Moved';
                                notificationBody = \`"\${data.taskTitle}" moved to \${data.toColumnName}\`;
                            } else if (data.action === 'delete') {
                                notificationTitle = 'Task Deleted';
                                notificationBody = \`"\${data.taskTitle}" was deleted\`;
                            } else {
                                notificationBody = 'A task was updated';
                            }

                            showNotification(notificationTitle, notificationBody);
                        }

                        window.location.reload();
                    } else if (data.type === 'connected') {
                        console.log('SSE connected');
                    }
                } catch (err) {
                    console.error('Error parsing SSE message:', err);
                }
            };

            eventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                eventSource.close();
                // Reconnect after 3 seconds
                setTimeout(connectSSE, 3000);
            };
        }

        // Connect SSE immediately and keep it open
        connectSSE();

        // Also check for updates when window gains focus
        window.addEventListener('focus', () => {
            console.log('Window focused, checking for updates...');
            window.location.reload();
        });

        // Delete task function
        function deleteTask(taskId, taskTitle) {
            // Confirm deletion
            if (!confirm(\`Are you sure you want to delete "\${taskTitle}"?\\n\\nThis action cannot be undone.\`)) {
                return;
            }

            // Send delete request to server
            fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    taskId: taskId
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Close modal and reload page
                    window.location.hash = '';
                    window.location.reload();
                } else {
                    alert('Failed to delete task: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error deleting task:', error);
                alert('Failed to delete task');
            });
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

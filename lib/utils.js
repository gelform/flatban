const fs = require('fs');
const path = require('path');

// Constants
const EPOCH_2000 = 946684800; // Unix timestamp for 2000-01-01 00:00:00 UTC
const BASE36_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Generate a unique 7-character task ID
 * Format: {3-char-random}{4-char-timestamp}
 */
function generateTaskId(index) {
    for (let attempt = 0; attempt < 100; attempt++) {
        // Generate 3-char random component (goes first for visual distinction)
        let randomPrefix = '';
        for (let i = 0; i < 3; i++) {
            randomPrefix += BASE36_CHARS[Math.floor(Math.random() * 36)];
        }

        // Generate 4-char timestamp component
        const secondsSince2000 = Math.floor(Date.now() / 1000) - EPOCH_2000;
        let timestampB36 = secondsSince2000.toString(36).toLowerCase();

        // Pad to 4 characters
        timestampB36 = timestampB36.padStart(4, '0');

        const taskId = randomPrefix + timestampB36;

        // Check for collision
        if (!index.tasks[taskId]) {
            return taskId;
        }
    }

    throw new Error('Failed to generate unique task ID after 100 attempts');
}

/**
 * Simple YAML parser for config files
 */
function parseSimpleYaml(content) {
    const config = {
        name: 'My Project Board',
        columns: [],
        priorities: []
    };

    const lines = content.split('\n');
    let currentSection = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Match top-level name
        if (currentSection === null && /^name:\s*"?([^"]+)"?/.test(trimmed)) {
            const match = trimmed.match(/^name:\s*"?([^"]+)"?/);
            config.name = match[1].replace(/"/g, '');
        } else if (trimmed === 'columns:') {
            currentSection = 'columns';
        } else if (trimmed === 'priorities:') {
            currentSection = 'priorities';
        } else if (currentSection === 'columns' && /^-\s+id:\s+(\S+)/.test(trimmed)) {
            const match = trimmed.match(/^-\s+id:\s+(\S+)/);
            const columnId = match[1];
            const columnName = columnId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            config.columns.push({ id: columnId, name: columnName });
        } else if (currentSection === 'columns' && /^\s+name:\s*"?([^"]+)"?/.test(trimmed)) {
            const match = trimmed.match(/^\s+name:\s*"?([^"]+)"?/);
            const lastIdx = config.columns.length - 1;
            if (lastIdx >= 0) {
                config.columns[lastIdx].name = match[1].replace(/"/g, '');
            }
        } else if (currentSection === 'priorities' && /^-\s+(\S+)/.test(trimmed)) {
            const match = trimmed.match(/^-\s+(\S+)/);
            config.priorities.push(match[1]);
        }
    }

    return config;
}

/**
 * Parse frontmatter from markdown content
 * Returns { frontmatter, body }
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\s*\n(.*?)\n---\s*\n(.*)$/s);
    if (!match) {
        throw new Error('No valid frontmatter found');
    }

    const frontmatterStr = match[1];
    const body = match[2];

    const parsed = {};
    const lines = frontmatterStr.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        const fieldMatch = trimmed.match(/^(\w+):\s*(.+)$/);

        if (fieldMatch) {
            const key = fieldMatch[1];
            let value = fieldMatch[2].trim();

            // Handle different value types
            if (value === '""' || value === "''") {
                parsed[key] = '';
            } else if (value.startsWith('"') || value.startsWith("'")) {
                parsed[key] = value.replace(/^["']|["']$/g, '');
            } else if (value.startsWith('[')) {
                // Parse array
                value = value.replace(/^\[|\]$/g, '');
                parsed[key] = value ? value.split(',').map(v => v.trim()) : [];
            } else {
                parsed[key] = value;
            }
        }
    }

    return { frontmatter: parsed, body };
}

/**
 * Load index.json from board directory
 */
function loadIndex(boardPath = '.') {
    const indexFile = path.join(boardPath, '.flatban', 'index.json');

    if (!fs.existsSync(indexFile)) {
        return {
            version: '1.0',
            board_name: 'Untitled Board',
            last_sync: null,
            tasks: {},
            columns: {}
        };
    }

    const content = fs.readFileSync(indexFile, 'utf8');

    try {
        return JSON.parse(content);
    } catch (err) {
        console.error('Warning: index.json is corrupted, will rebuild');
        return {
            version: '1.0',
            board_name: 'Untitled Board',
            last_sync: null,
            tasks: {},
            columns: {}
        };
    }
}

/**
 * Save index.json to board directory
 */
function saveIndex(index, boardPath = '.') {
    const indexFile = path.join(boardPath, '.flatban', 'index.json');

    // Update last_sync timestamp
    index.last_sync = new Date().toISOString();

    // Write with pretty formatting
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
}

/**
 * Load config.yaml from board directory
 */
function loadConfig(boardPath = '.') {
    const configFile = path.join(boardPath, '.flatban', 'config.yaml');

    if (!fs.existsSync(configFile)) {
        throw new Error("No Flatban board found. Run 'flatban init' first.");
    }

    const content = fs.readFileSync(configFile, 'utf8');
    return parseSimpleYaml(content);
}

/**
 * Find task by partial ID
 */
function findTaskByPartialId(index, partialId) {
    const matches = Object.keys(index.tasks).filter(id => id.startsWith(partialId));

    if (matches.length === 0) {
        throw new Error(`No task found matching: ${partialId}`);
    }

    if (matches.length > 1) {
        throw new Error(`Multiple tasks found matching: ${partialId}\n${matches.join(', ')}`);
    }

    return matches[0];
}

/**
 * Create a slug from a string
 */
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);
}

/**
 * Append to task history
 */
function appendToHistory(filePath, message) {
    const content = fs.readFileSync(filePath, 'utf8');
    const datetime = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const historyEntry = `- ${datetime}: ${message}\n`;

    fs.writeFileSync(filePath, content + historyEntry);
}

/**
 * Format datetime for display
 */
function formatDatetime(timestamp) {
    const date = new Date(timestamp);
    const month = date.toLocaleString('en', { month: 'short' });
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${hours}:${minutes}`;
}

/**
 * Output functions
 */
function success(message) {
    console.log(`✓ ${message}`);
}

function error(message, code = 1) {
    console.error(`✗ ${message}`);
    process.exit(code);
}

module.exports = {
    generateTaskId,
    parseSimpleYaml,
    parseFrontmatter,
    loadIndex,
    saveIndex,
    loadConfig,
    findTaskByPartialId,
    slugify,
    appendToHistory,
    formatDatetime,
    success,
    error
};

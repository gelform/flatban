const fs = require('fs');
const path = require('path');
const { loadConfig, parseSimpleYaml, success, error } = require('../utils');

function config(args) {
    const boardPath = '.';
    const configFile = path.join(boardPath, '.flatban', 'config.yaml');

    if (!fs.existsSync(configFile)) {
        error('Not a Flatban board. Run "flatban init" first.');
    }

    const subcommand = args[0];

    // If no subcommand, show current config
    if (!subcommand) {
        showConfig(boardPath);
        return;
    }

    // Handle subcommands
    switch (subcommand) {
        case 'get':
            getConfigValue(args[1], boardPath);
            break;
        case 'set':
            setConfigValue(args[1], args[2], boardPath);
            break;
        case 'notifications':
            handleNotifications(args.slice(1), boardPath);
            break;
        default:
            error(`Unknown subcommand: ${subcommand}`);
            console.log('');
            console.log('Usage:');
            console.log('  flatban config                                      # Show all settings');
            console.log('  flatban config get <key>                            # Get a setting value');
            console.log('  flatban config set <key> <value>                    # Set a setting value');
            console.log('  flatban config notifications enable                 # Enable notifications');
            console.log('  flatban config notifications disable                # Disable notifications');
            console.log('  flatban config notifications all                    # Enable all-changes notifications');
            console.log('  flatban config notifications column <column-id>     # Add column to notify list');
            console.log('  flatban config notifications remove <column-id>     # Remove column from notify list');
            console.log('');
    }
}

function showConfig(boardPath) {
    try {
        const configFile = path.join(boardPath, '.flatban', 'config.yaml');
        const configYaml = fs.readFileSync(configFile, 'utf8');

        console.log('Current configuration:\n');
        console.log(configYaml);
    } catch (err) {
        error(`Failed to read config: ${err.message}`);
    }
}

function getConfigValue(key, boardPath) {
    if (!key) {
        error('Key is required. Usage: flatban config get <key>');
    }

    try {
        const config = loadConfig(boardPath);
        const value = getNestedValue(config, key);

        if (value === undefined) {
            error(`Setting not found: ${key}`);
        }

        console.log(JSON.stringify(value, null, 2));
    } catch (err) {
        error(`Failed to get config value: ${err.message}`);
    }
}

function setConfigValue(key, value, boardPath) {
    if (!key || value === undefined) {
        error('Key and value are required. Usage: flatban config set <key> <value>');
    }

    try {
        const configFile = path.join(boardPath, '.flatban', 'config.yaml');
        const config = loadConfig(boardPath);

        // Parse value (handle booleans, arrays, etc.)
        let parsedValue = value;
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (value.startsWith('[') && value.endsWith(']')) {
            parsedValue = JSON.parse(value);
        }

        setNestedValue(config, key, parsedValue);

        // Write back to YAML
        const yamlContent = configToYaml(config);
        fs.writeFileSync(configFile, yamlContent);

        success(`Set ${key} = ${JSON.stringify(parsedValue)}`);
    } catch (err) {
        error(`Failed to set config value: ${err.message}`);
    }
}

function handleNotifications(args, boardPath) {
    const action = args[0];

    if (!action) {
        error('Action required. See "flatban config" for usage.');
    }

    const configFile = path.join(boardPath, '.flatban', 'config.yaml');
    const config = loadConfig(boardPath);

    // Ensure notifications object exists
    if (!config.notifications) {
        config.notifications = {
            enabled: false,
            all_changes: false,
            notify_columns: []
        };
    }

    switch (action) {
        case 'enable':
            config.notifications.enabled = true;
            fs.writeFileSync(configFile, configToYaml(config));
            success('Browser notifications enabled');
            break;

        case 'disable':
            config.notifications.enabled = false;
            fs.writeFileSync(configFile, configToYaml(config));
            success('Browser notifications disabled');
            break;

        case 'all':
            config.notifications.enabled = true;
            config.notifications.all_changes = true;
            fs.writeFileSync(configFile, configToYaml(config));
            success('All-changes notifications enabled');
            break;

        case 'column':
            const columnToAdd = args[1];
            if (!columnToAdd) {
                error('Column ID required. Usage: flatban config notifications column <column-id>');
            }
            if (!config.notifications.notify_columns) {
                config.notifications.notify_columns = [];
            }
            if (!config.notifications.notify_columns.includes(columnToAdd)) {
                config.notifications.notify_columns.push(columnToAdd);
                config.notifications.enabled = true;
                fs.writeFileSync(configFile, configToYaml(config));
                success(`Added "${columnToAdd}" to notification columns`);
            } else {
                console.log(`Column "${columnToAdd}" already in notification list`);
            }
            break;

        case 'remove':
            const columnToRemove = args[1];
            if (!columnToRemove) {
                error('Column ID required. Usage: flatban config notifications remove <column-id>');
            }
            if (!config.notifications.notify_columns) {
                config.notifications.notify_columns = [];
            }
            const index = config.notifications.notify_columns.indexOf(columnToRemove);
            if (index !== -1) {
                config.notifications.notify_columns.splice(index, 1);
                fs.writeFileSync(configFile, configToYaml(config));
                success(`Removed "${columnToRemove}" from notification columns`);
            } else {
                console.log(`Column "${columnToRemove}" not in notification list`);
            }
            break;

        default:
            error(`Unknown notifications action: ${action}`);
            console.log('See "flatban config" for usage.');
    }
}

function getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
        value = value[key];
        if (value === undefined) break;
    }
    return value;
}

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = obj;

    for (const key of keys) {
        if (!target[key]) target[key] = {};
        target = target[key];
    }

    target[lastKey] = value;
}

function configToYaml(config) {
    let yaml = `# Flatban Configuration\nname: "${config.name}"\n\n`;

    // Columns
    yaml += 'columns:\n';
    for (const col of config.columns) {
        yaml += `  - id: ${col.id}\n`;
        yaml += `    name: "${col.name}"\n`;
    }
    yaml += '\n';

    // Priorities
    yaml += 'priorities:\n';
    for (const priority of config.priorities) {
        yaml += `  - ${priority}\n`;
    }
    yaml += '\n';

    // Notifications
    yaml += '# Browser notification settings\n';
    yaml += 'notifications:\n';
    yaml += `  enabled: ${config.notifications?.enabled || false}              # Enable/disable browser notifications\n`;
    yaml += `  all_changes: ${config.notifications?.all_changes || false}          # Notify on all task changes (moves, creates, deletes)\n`;

    const notifyColumns = config.notifications?.notify_columns || [];
    if (notifyColumns.length > 0) {
        yaml += `  notify_columns: [${notifyColumns.join(', ')}]     # List of column IDs to notify when tasks move into them\n`;
    } else {
        yaml += `  notify_columns: []          # List of column IDs to notify when tasks move into them (e.g., [review, done])\n`;
    }

    return yaml;
}

module.exports = config;

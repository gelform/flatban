const path = require('path');
const fs = require('fs');
const { createServer } = require('../server');
const { error } = require('../utils');

function serve(args, options = {}) {
    const boardPath = '.';
    const port = options.port || 3847;

    // Check if board is initialized
    const configFile = path.join(boardPath, '.flatban', 'config.yaml');
    if (!fs.existsSync(configFile)) {
        error('No Flatban board found. Run "flatban init" first.');
    }

    // Create and start the server
    const server = createServer(boardPath, port);

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n\nStopping server...');
        server.close(() => {
            process.exit(0);
        });
    });
}

module.exports = serve;

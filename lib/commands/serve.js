const path = require('path');
const fs = require('fs');
const net = require('net');
const { createServer } = require('../server');
const { error } = require('../utils');

// Common ports to avoid
const COMMON_PORTS = [3000, 3001, 8000, 8080, 8888, 5000, 5001, 3847, 4200, 9000];

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', () => {
            resolve(false);
        });

        server.once('listening', () => {
            server.close();
            resolve(true);
        });

        server.listen(port);
    });
}

function getRandomPort() {
    // Generate random port between 4000-9999, avoiding common ones
    let port;
    do {
        port = Math.floor(Math.random() * 6000) + 4000;
    } while (COMMON_PORTS.includes(port));
    return port;
}

async function findAvailablePort(preferredPort) {
    // Try preferred port first
    if (await isPortAvailable(preferredPort)) {
        return preferredPort;
    }

    // Try random ports
    for (let i = 0; i < 10; i++) {
        const randomPort = getRandomPort();
        if (await isPortAvailable(randomPort)) {
            return randomPort;
        }
    }

    error('Could not find an available port after 10 attempts');
}

async function serve(args, options = {}) {
    const boardPath = '.';
    const requestedPort = options.port || 3847;

    // Check if board is initialized
    const configFile = path.join(boardPath, '.flatban', 'config.yaml');
    if (!fs.existsSync(configFile)) {
        error('No Flatban board found. Run "flatban init" first.');
    }

    // Find an available port
    const port = await findAvailablePort(requestedPort);

    if (port !== requestedPort) {
        console.log(`Port ${requestedPort} is in use, using ${port} instead.`);
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

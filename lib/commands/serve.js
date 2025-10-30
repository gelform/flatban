const path = require('path');
const fs = require('fs');
const net = require('net');
const { exec } = require('child_process');
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

function openBrowser(url) {
    const platform = process.platform;
    let command;

    switch (platform) {
        case 'darwin':
            command = `open "${url}"`;
            break;
        case 'win32':
            command = `start "${url}"`;
            break;
        default: // linux, freebsd, etc.
            command = `xdg-open "${url}"`;
            break;
    }

    exec(command, (err) => {
        if (err) {
            console.log(`Could not auto-open browser: ${err.message}`);
            console.log(`Please manually open: ${url}`);
        }
    });
}

async function serve(args, options = {}) {
    const boardPath = '.';
    const requestedPort = options.port || 3847;
    const shouldOpen = !options['no-open']; // Auto-open by default

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

    // Auto-open browser after a short delay to ensure server is ready
    if (shouldOpen) {
        setTimeout(() => {
            openBrowser(`http://localhost:${port}`);
        }, 500);
    }

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n\nStopping server...');
        server.close(() => {
            process.exit(0);
        });
    });
}

module.exports = serve;

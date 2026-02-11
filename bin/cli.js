#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Start the server
const serverPath = path.join(__dirname, '..', 'server.js');
const server = spawn('node', [serverPath], {
  stdio: 'inherit'
});

server.on('error', (err) => {
  console.error('Failed to start Lando GUI:', err);
  process.exit(1);
});

server.on('exit', (code) => {
  process.exit(code);
});

// Handle cleanup
process.on('SIGINT', () => {
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});

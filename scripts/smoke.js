/**
 * Smoke test: start the server, hit /health, exit 0 on success.
 * Usage: npm run smoke
 */
'use strict';

const { spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3000;
const TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 400;
const MAX_POLLS = Math.floor(TIMEOUT_MS / POLL_INTERVAL_MS);

let server;
let polls = 0;
let done = false;

function finish(code, message) {
  if (done) return;
  done = true;
  console.log(message);
  if (server) server.kill();
  process.exit(code);
}

function check() {
  polls += 1;
  if (polls > MAX_POLLS) {
    finish(1, `FAIL: /health did not respond within ${TIMEOUT_MS}ms`);
    return;
  }

  const req = http.get(`http://localhost:${PORT}/health`, (res) => {
    if (res.statusCode === 200) {
      finish(0, `OK: /health returned 200 (${polls * POLL_INTERVAL_MS}ms)`);
    } else {
      finish(1, `FAIL: /health returned ${res.statusCode}`);
    }
  });

  req.on('error', () => {
    // Server not up yet — keep polling
    setTimeout(check, POLL_INTERVAL_MS);
  });

  req.setTimeout(POLL_INTERVAL_MS, () => {
    req.destroy();
    setTimeout(check, POLL_INTERVAL_MS);
  });
}

// Start server as a child process
server = spawn(process.execPath, ['backend/server.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));

server.on('exit', (code) => {
  if (!done) {
    finish(1, `FAIL: server exited early with code ${code}`);
  }
});

// Give the process a tick to start, then begin polling
setTimeout(check, POLL_INTERVAL_MS);

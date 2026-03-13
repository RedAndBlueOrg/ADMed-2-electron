'use strict';

// Worker process for ZIP extraction — keeps the main process event loop free.
// Usage: fork('extract-worker.js') and send { zipPath, targetDir }.
// Uses 7-Zip to handle streaming ZIPs without EOCD (Central Directory).

const { execFile } = require('child_process');
const { path7za } = require('7zip-bin');

process.on('message', (msg) => {
  const args = ['x', msg.zipPath, `-o${msg.targetDir}`, '-y', '-aoa'];
  execFile(path7za, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      process.send({ ok: false, error: err.message + (stderr ? ` | ${stderr}` : '') });
    } else {
      process.send({ ok: true });
    }
    process.exit(0);
  });
});

'use strict';

// Worker process for ZIP extraction — keeps the main process event loop free.
// Usage: fork('extract-worker.js') and send { zipPath, targetDir }.

const AdmZip = require('adm-zip');

process.on('message', (msg) => {
  try {
    const zip = new AdmZip(msg.zipPath);
    zip.extractAllTo(msg.targetDir, true);
    process.send({ ok: true });
  } catch (err) {
    process.send({ ok: false, error: err.message });
  }
  process.exit(0);
});

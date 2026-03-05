'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');
const state = require('./state');

async function startCacheServer(cacheRoot) {
  if (state.cacheServerBase) return state.cacheServerBase;
  if (state.cacheServerReady) {
    await state.cacheServerReady;
    return state.cacheServerBase;
  }

  const server = http.createServer((req, res) => {
    const prefix = '/cache/';
    if (!req.url.startsWith(prefix)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const relPath = decodeURIComponent(req.url.slice(prefix.length));
    const targetPath = path.join(cacheRoot, relPath);
    if (!targetPath.startsWith(cacheRoot)) {
      res.statusCode = 400;
      res.end('invalid path');
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin');
      res.end();
      return;
    }
    fs.stat(targetPath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.statusCode = 404;
        res.end();
        return;
      }

      const ext = path.extname(targetPath).toLowerCase();
      const mimeMap = {
        '.m3u8': 'application/vnd.apple.mpegurl',
        '.ts': 'video/mp2t',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
      };
      const mime = mimeMap[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache');

      const rangeHeader = req.headers.range;
      let start = 0;
      let end = stat.size - 1;

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          start = match[1] ? parseInt(match[1], 10) : 0;
          end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
        }
        if (start > end || start >= stat.size) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${stat.size}`);
          res.end();
          return;
        }
        if (end >= stat.size) end = stat.size - 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      } else {
        res.statusCode = 200;
      }

      res.setHeader('Content-Length', end - start + 1);

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      if (ext === '.ts') {
        fs.readFile(targetPath, (readErr, buf) => {
          if (readErr) { res.statusCode = 500; res.end(); return; }
          const slice = (rangeHeader) ? buf.subarray(start, end + 1) : buf;
          res.end(slice);
        });
      } else {
        const stream = fs.createReadStream(targetPath, { start, end });
        stream.on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end(); });
        req.on('close', () => { stream.destroy(); });
        stream.pipe(res);
      }
    });
  });

  state.cacheServerReady = new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      state.cacheServerPort = server.address().port;
      state.cacheServerBase = `http://127.0.0.1:${state.cacheServerPort}/cache`;
      resolve(state.cacheServerBase);
    });
  });

  state.cacheServer = server;
  await state.cacheServerReady;
  return state.cacheServerBase;
}

function extractZip(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, '..', '..', 'extract-worker.js');
    const child = fork(workerPath, { silent: true });

    child.on('message', (msg) => {
      if (msg.ok) resolve();
      else reject(new Error(msg.error || 'extract failed'));
    });

    child.on('error', reject);

    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`extract-worker exited with code ${code}`));
    });

    child.send({ zipPath, targetDir });
  });
}

function findFirstManifest(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const nested = findFirstManifest(fullPath);
        if (nested) return nested;
      } else if (stat.isFile() && path.extname(fullPath).toLowerCase() === '.m3u8') {
        return fullPath;
      }
    }
  } catch {}
  return null;
}

function cleanupCache(cacheRoot, keepPaths) {
  try {
    const entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
    const now = Date.now();
    const staleMs = 15 * 60 * 1000;

    for (const entry of entries) {
      const fullPath = path.join(cacheRoot, entry.name);
      if (keepPaths.has(fullPath)) continue;

      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs < staleMs) continue;

        if (entry.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.rmSync(fullPath, { force: true });
        }
      } catch (err) {
        console.warn('[cache] remove failed:', fullPath, err.message);
      }
    }
  } catch (err) {
    console.warn('[cache] cleanup skipped:', err.message);
  }
}

module.exports = {
  startCacheServer,
  extractZip,
  findFirstManifest,
  cleanupCache,
};

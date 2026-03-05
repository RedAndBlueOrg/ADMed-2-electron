'use strict';

const fs = require('fs');
const { pipeline } = require('stream/promises');
const http = require('http');
const https = require('https');

function selectHttpModule(url) {
  return url.startsWith('https') ? https : http;
}

async function downloadFileWithHeaders(url, destPath, { maxRetries = 3 } = {}) {
  const tempPath = `${destPath}.part`;

  const attempt = () => new Promise((resolve, reject) => {
    const mod = selectHttpModule(url);
    const request = mod.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const contentType = response.headers['content-type'];
      const fileStream = fs.createWriteStream(tempPath);
      pipeline(response, fileStream)
        .then(() => fs.rename(tempPath, destPath, (err) => (err ? reject(err) : resolve({ path: destPath, contentType }))))
        .catch(reject);
    });

    request.on('error', reject);
  });

  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      const isRetryable = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN'].includes(err.code)
        || /aborted|socket hang up/i.test(err.message);
      if (!isRetryable || i === maxRetries - 1) throw err;
      const delay = 1000 * (i + 1);
      console.warn(`[download] retry ${i + 1}/${maxRetries} in ${delay}ms: ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function downloadFile(url, destPath) {
  const result = await downloadFileWithHeaders(url, destPath);
  return result.path;
}

module.exports = {
  downloadFileWithHeaders,
  downloadFile,
};

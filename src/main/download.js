'use strict';

const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

async function downloadFileWithHeaders(url, destPath, { maxRetries = 3 } = {}) {
  const tempPath = `${destPath}.part`;

  const attempt = async () => {
    const response = await fetch(url);
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status} for ${url}`);
      err.statusCode = response.status;
      throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    const fileStream = fs.createWriteStream(tempPath);
    await pipeline(Readable.fromWeb(response.body), fileStream);
    await fs.promises.rename(tempPath, destPath);
    return { path: destPath, contentType };
  };

  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
      const statusCode = err.statusCode || 0;
      const isServerError = statusCode >= 500 && statusCode < 600;
      const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN'].includes(err.code)
        || /aborted|socket hang up|fetch failed/i.test(err.message);
      if ((!isServerError && !isNetworkError) || i === maxRetries - 1) throw err;
      const delay = 1000 * (i + 1);
      console.warn(`[download] retry ${i + 1}/${maxRetries} in ${delay}ms: ${err.message}`);
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

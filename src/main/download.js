'use strict';

const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

async function downloadFileWithHeaders(url, destPath, { maxRetries = 5 } = {}) {
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
      const causeCode = err.cause?.code || '';
      const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(err.code)
        || ['UND_ERR_SOCKET', 'ECONNRESET', 'ETIMEDOUT'].includes(causeCode)
        || /aborted|terminated|socket hang up|fetch failed|other side closed/i.test(err.message);
      if ((!isServerError && !isNetworkError) || i === maxRetries - 1) throw err;
      try { fs.rmSync(tempPath, { force: true }); } catch {}
      const delay = Math.min(5000, 2000 * (i + 1));
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

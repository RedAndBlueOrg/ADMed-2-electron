import state from './state.js';
import {
  versionToast, downloadOverlay, downloadProgressFill,
  downloadProgressText, downloadProgressBar, errorOverlay, statusOverlay,
} from './dom.js';

let versionToastTimer = null;
let downloadHideTimer = null;
let downloadProgressUnsub = null;

// --- Version toast ---

export function showVersionToast(message) {
  if (!versionToast) return;
  if (versionToastTimer) {
    clearTimeout(versionToastTimer);
    versionToastTimer = null;
  }
  versionToast.textContent = message;
  versionToast.style.display = 'block';
  versionToastTimer = setTimeout(() => {
    if (versionToast) versionToast.style.display = 'none';
  }, 5000);
}

export async function renderVersionToast() {
  if (!window.appInfo?.getVersion || !versionToast) return;
  try {
    const version = await window.appInfo.getVersion();
    const text = version ? `ADMed v${version}` : 'ADMed 버전 확인';
    showVersionToast(text);
  } catch (err) {
    console.warn('version toast failed:', err?.message || err);
  }
}

// --- Download progress overlay ---

export function updateDownloadOverlay({ total = 0, finished = 0, active = false, currentTitle = '' } = {}) {
  if (!downloadOverlay) return;
  if (downloadHideTimer) {
    clearTimeout(downloadHideTimer);
    downloadHideTimer = null;
  }

  const totalCount = Number(total) || 0;
  const doneCount = Math.min(Number(finished) || 0, totalCount);
  const isActive = Boolean(active) && totalCount > 0;
  const ratio = totalCount ? Math.min(1, doneCount / totalCount) : 0;
  const percent = Math.round(ratio * 100);

  const rawTitle = (currentTitle || '').trim();
  const maxLen = 28;
  const displayTitle =
    rawTitle && rawTitle.length > maxLen ? `${rawTitle.slice(0, maxLen - 3)}...` : rawTitle || '시나리오 컨텐츠';

  if (downloadProgressText) {
    downloadProgressText.textContent = `${displayTitle} (${doneCount}/${totalCount || 0})`;
  }
  if (downloadProgressFill) {
    downloadProgressFill.style.width = `${percent}%`;
  }
  if (downloadProgressBar) {
    downloadProgressBar.setAttribute('aria-valuenow', String(percent));
  }

  if (!isActive) {
    downloadOverlay.classList.remove('visible');
    return;
  }

  downloadOverlay.classList.add('visible');
  if (statusOverlay) statusOverlay.style.display = 'none';
}

export function setupDownloadProgressListener() {
  if (!window.mediaAPI?.onDownloadProgress) return;
  downloadProgressUnsub = window.mediaAPI.onDownloadProgress((payload) => {
    updateDownloadOverlay(payload || {});
  });
  updateDownloadOverlay({ total: 0, finished: 0, active: false });
}

export function cleanupDownloadProgress() {
  if (typeof downloadProgressUnsub === 'function') {
    downloadProgressUnsub();
    downloadProgressUnsub = null;
  }
}

// --- Error overlay ---

export function showError(message) {
  if (!errorOverlay) return;
  const msgEl = errorOverlay.querySelector('.error-message');
  if (msgEl) msgEl.textContent = message || '네트워크 오류가 발생했습니다. 잠시 후 다시 시도합니다.';
  errorOverlay.classList.add('visible');
  if (statusOverlay) statusOverlay.style.display = 'none';
  state.overlayLocked = false;
  state.errorState = true;
}

export function hideError() {
  if (!errorOverlay) return;
  errorOverlay.classList.remove('visible');
  state.errorState = false;
}

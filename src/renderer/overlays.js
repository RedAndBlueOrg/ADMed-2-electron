import state from './state.js';
import {
  versionToast, downloadOverlay, downloadProgressFill,
  downloadProgressText, downloadProgressBar, errorOverlay, statusOverlay,
  contentSpinner,
} from './dom.js';

let versionToastTimer = null;
let downloadHideTimer = null;
let downloadProgressUnsub = null;
let spinnerDelayTimer = null;

// 짧은 캐시 사이클(즉시 성공)에 도넛이 깜빡이지 않도록 표시를 지연하는 시간.
const SPINNER_DELAY_MS = 500;

// --- Corner donut spinner ---
// state.downloadActive(실제 다운로드 진행) 또는 state.fetchingContent(새 콘텐츠 탐색/재시도)
// 중 하나라도 true 면 직전 프레임 위에 코너 도넛을 띄운다. 짧은 캐시 사이클(즉시 성공)엔
// 깜빡이지 않도록 500ms 지연 후 표시.
export function updateContentSpinner() {
  if (!contentSpinner) return;
  const shouldShow = state.downloadActive || state.fetchingContent;
  if (shouldShow) {
    if (contentSpinner.classList.contains('visible') || spinnerDelayTimer) return;
    spinnerDelayTimer = setTimeout(() => {
      spinnerDelayTimer = null;
      contentSpinner.classList.add('visible');
    }, SPINNER_DELAY_MS);
  } else {
    if (spinnerDelayTimer) {
      clearTimeout(spinnerDelayTimer);
      spinnerDelayTimer = null;
    }
    contentSpinner.classList.remove('visible');
  }
}

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
    state.downloadActive = false;
    updateContentSpinner();
    return;
  }

  state.downloadActive = true;
  updateContentSpinner();
  if (state.overlayLocked) {
    // 콜드 스타트: 기존 큰 진행 오버레이 유지 (흰 status 화면 위에 명확한 진행률)
    downloadOverlay.classList.add('visible');
    if (statusOverlay) statusOverlay.style.display = 'none';
  } else {
    // 운영 중: 직전 콘텐츠를 가리지 않도록 큰 오버레이 대신 코너 도넛만
    downloadOverlay.classList.remove('visible');
  }
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

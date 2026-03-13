import state from './state.js';
import { videoEl, statusOverlay, noticeBar, landingMessage, log } from './dom.js';
import { applyLayout, showLandingOverlay, setLandingUrl } from './layout.js';
import { showError, hideError } from './overlays.js';
import { playIndex, renderPlaylist } from './media.js';
import { renderNotice, loadNotices } from './notice.js';
import { updateWeatherPanel } from './weather.js';
import { setupClinicRealtime, stopClinicSocket, restartClinicRealtime } from './clinic.js';

let retryTimer = null;
let onlineCheckTimer = null;
let onlineCheckStarted = false;
let overlayTimer = null;

// --- Online detection ---

function startOnlineCheck() {
  if (onlineCheckTimer) return;
  onlineCheckStarted = true;
  onlineCheckTimer = setInterval(() => {
    if (navigator.onLine) {
      attemptRecovery();
    }
  }, 5000);
}

function stopOnlineCheck() {
  if (onlineCheckTimer) {
    clearInterval(onlineCheckTimer);
    onlineCheckTimer = null;
  }
}

// --- Recovery ---

function attemptRecovery() {
  if (state.recovering) return;
  state.recovering = true;
  hideError();
  loadPlaylist({ fromCycle: true, fromRecovery: true })
    .catch(() => {})
    .finally(() => {
      state.recovering = false;
    });
}

// --- playNext (wired into media.js via state.onPlayNext) ---

async function playNext() {
  const next = state.currentIndex + 1;
  if (next < state.playlist.length) {
    playIndex(next);
  } else {
    // 한 사이클 끝 → 시나리오 갱신
    await loadPlaylist({ fromCycle: true });
  }
}

// Register callback so media.js can call playNext without circular import
state.onPlayNext = () => playNext();

// --- Main playlist loader ---

export async function loadPlaylist({ fromCycle = false, fromRecovery = false } = {}) {
  if (state.playlistLoading) return;
  state.playlistLoading = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (!fromRecovery) hideError();
  try {
    let nextMemberSeq = null;
    let nextDeviceSerial = '';
    let nextClinicApiOrigin = '';
    let nextClinicWsOrigin = '';
    let nextLandingUrl = '';
    if (fromRecovery || fromCycle) {
      state.overlayLocked = false;
      if (statusOverlay) statusOverlay.style.display = 'none';
    } else {
      state.overlayLocked = true;
      if (statusOverlay) {
        statusOverlay.style.display = 'flex';
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await window.mediaAPI.preparePlaylist();

    if (Array.isArray(response)) {
      state.playlist = response;
      state.noticeList = [];
      state.noticeIndex = 0;
    } else {
      state.playlist = response.playlist || [];
      nextMemberSeq = response.memberSeq ?? null;
      nextDeviceSerial = response.deviceSerial ?? '';
      nextClinicApiOrigin = response.clinicApiOrigin || '';
      nextClinicWsOrigin = response.clinicWsOrigin || '';
      nextLandingUrl = response.landingUrl || '';
      const nextWaitingInfo =
        typeof response.waitingInfo !== 'undefined' && response.waitingInfo !== null
          ? response.waitingInfo
          : state.waitingInfo;
      state.waitingInfo = nextWaitingInfo;

      state.noticeList = response.noticeList || [];
      state.noticeIndex = 0;
    }

    if (nextLandingUrl) {
      setLandingUrl(nextLandingUrl);
    }

    if (!nextDeviceSerial) {
      state.overlayLocked = false;
      if (statusOverlay) statusOverlay.style.display = 'none';
      if (landingMessage) {
        landingMessage.textContent =
          '기기 시리얼이 설정되지 않았습니다. 컨텍스트 메뉴(우클릭) → 관리자 설정에서 시리얼을 입력해 주세요.';
      }
      showLandingOverlay(true);
      state.playlist = [];
      state.noticeList = [];
      renderPlaylist();
      applyLayout('N');
      stopClinicSocket();
      return;
    }

    showLandingOverlay(false);
    applyLayout(state.waitingInfo);
    updateWeatherPanel();
    setupClinicRealtime({
      waitingInfo: state.waitingInfo,
      memberSeq: nextMemberSeq,
      deviceSerial: nextDeviceSerial,
      clinicApiOrigin: nextClinicApiOrigin,
      clinicWsOrigin: nextClinicWsOrigin,
    });

    if (state.waitingInfo !== 'N') {
      if (state.noticeList.length) renderNotice(true);
    } else if (noticeBar) {
      noticeBar.style.display = 'none';
    }

    state.currentIndex = 0;
    renderPlaylist();

    const firstPlayable = state.playlist.findIndex((item) => item.localFile || item.streamUrl);
    if (firstPlayable >= 0) {
      if (state.overlayLocked) {
        if (overlayTimer) clearTimeout(overlayTimer);
        overlayTimer = setTimeout(() => {
          state.overlayLocked = false;
          if (statusOverlay) statusOverlay.style.display = 'none';
          playIndex(firstPlayable);
        }, 1000);
      } else {
        playIndex(firstPlayable);
      }
    } else {
      if (statusOverlay) {
        statusOverlay.style.display = 'none';
      }
      log('No playable content available (download failed?).');
      showError('No playable content available. Please retry or check network/settings.');
    }
  } catch (err) {
    state.overlayLocked = false;
    if (statusOverlay) statusOverlay.style.display = 'none';
    log(`Playlist load failed: ${err.message}`);
    showError('Failed to load media due to configuration or network issue. Retrying shortly.');
    retryTimer = setTimeout(() => {
      attemptRecovery();
    }, 5000);
    startOnlineCheck();
  } finally {
    state.playlistLoading = false;
    if (statusOverlay && state.playlist.length && state.overlayLocked) {
      setTimeout(() => {
        state.overlayLocked = false;
        statusOverlay.style.display = 'none';
      }, 1000);
    }
  }
}

// --- Online / Offline events ---

window.addEventListener('online', () => {
  if (state.errorState) {
    attemptRecovery();
  } else {
    hideError();
    loadPlaylist({ fromCycle: true }).catch(() => {});
  }
  restartClinicRealtime();
});

window.addEventListener('offline', () => {
  startOnlineCheck();
  if (state.clinicEnabled) {
    stopClinicSocket();
  }
});

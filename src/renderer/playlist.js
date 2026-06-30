import state from './state.js';
import { videoEl, statusOverlay, noticeBar, landingMessage, log } from './dom.js';
import { applyLayout, showLandingOverlay, setLandingUrl } from './layout.js';
import { showError, hideError, updateContentSpinner } from './overlays.js';
import { playIndex, renderPlaylist } from './media.js';
import { renderNotice, loadNotices } from './notice.js';
import { updateWeatherPanel } from './weather.js';
import { setupClinicRealtime, stopClinicSocket, restartClinicRealtime } from './clinic.js';

let retryTimer = null;
let onlineCheckTimer = null;
let onlineCheckStarted = false;
let overlayTimer = null;

// 재생 가능 콘텐츠가 없을 때(새 콘텐츠 미준비/일시 실패) 백그라운드 재시도 간격.
// 예외 catch 분기의 재시도와 동일한 5초.
const NO_CONTENT_RETRY_MS = 5000;

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
      // 운영 중 새 콘텐츠 탐색/수신 시작 → 도넛 후보(실제 표시는 500ms 지연 후, 즉시 성공 시 안 뜸)
      state.fetchingContent = true;
      updateContentSpinner();
    } else {
      state.overlayLocked = true;
      if (statusOverlay) {
        statusOverlay.style.display = 'flex';
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    // hasEverPlayed=true(운영 중)면 main 이 미캐시 HLS-ZIP 을 await 하지 않고 백그라운드로 받아
    // 준비된 항목부터 즉시 재생하게 한다. 콜드 스타트(false)는 기존처럼 차단+큰 n/m 오버레이.
    const response = await window.mediaAPI.preparePlaylist(state.hasEverPlayed);

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
      state.fetchingContent = false;
      state.downloadActive = false;
      updateContentSpinner();
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
      // 새 콘텐츠 준비 완료 → 재생 확정. 도넛 끔.
      state.hasEverPlayed = true;
      state.fetchingContent = false;
      updateContentSpinner();
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
      if (statusOverlay) statusOverlay.style.display = 'none';
      if (state.hasEverPlayed) {
        // 운영 중: 여기서 resetMedia/playIndex 를 호출하지 않으므로 videoEl/imageEl 의
        // 마지막 프레임이 그대로 남는다 (위의 currentIndex 리셋·renderPlaylist 는 보이지 않는
        // 디버그 리스트만 갱신, 미디어 DOM 미변경). 빨간 에러 없이 도넛만 돌리며 조용히 재시도 →
        // 새 콘텐츠가 준비되면 다음 재시도에서 자동 교체된다.
        hideError();
        state.fetchingContent = true;
        updateContentSpinner();
        log('No playable content this cycle — keeping previous frame, retrying.');
      } else {
        // 콜드 스타트(아직 한 번도 재생 못 함): 보여줄 프레임이 없으므로 에러 표시.
        // 단, 이제 아래 retryTimer 로 자동 재시도하므로 수동 새로고침 없이도 복구된다.
        state.fetchingContent = false;
        updateContentSpinner();
        log('No playable content available (cold start) — retrying.');
        showError('No playable content available. Please retry or check network/settings.');
      }
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => attemptRecovery(), NO_CONTENT_RETRY_MS);
    }
  } catch (err) {
    state.overlayLocked = false;
    if (statusOverlay) statusOverlay.style.display = 'none';
    // preparePlaylist 가 다운로드 도중 throw 하면 종료 progress(active:false) 이벤트가
    // 안 와 downloadActive 가 true 로 남을 수 있다 → 에러 위에 도넛이 영구 회전. 함께 정리.
    state.fetchingContent = false;
    state.downloadActive = false;
    updateContentSpinner();
    log(`Playlist load failed: ${err.message}`);
    showError('Failed to load media due to configuration or network issue. Retrying shortly.');
    retryTimer = setTimeout(() => {
      attemptRecovery();
    }, NO_CONTENT_RETRY_MS);
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

import state from './state.js';
import { videoEl, imageEl, listEl, log } from './dom.js';

let hlsInstance = null;
let imageTimer = null;
// HLS stall 감지 / 매니페스트 로딩 타임아웃 타이머. 모듈 레벨이라 destroyHls() 가 정리한다.
// (예전엔 playIndex 호출마다 만들어지는 클로저 지역변수라 항목 교체 시 안 치워져 누적됐고,
//  쌓인 stale 타이머가 다음 항목의 videoEl.currentTime 을 엉뚱하게 +5초 seek → 짧은 클립이 반복 재생됨)
let hlsStallTimer = null;
let hlsManifestTimer = null;
// stall checker 를 첫 'playing' 이벤트 후에 arm 하기 위한 컨트롤러.
// 첫 segment 가 늦게 와서 currentTime 이 0 에 머무는 동안 stall 로 오인하는 false-positive 차단용.
let hlsArmCtl = null;

function clearImageTimer() {
  if (imageTimer) {
    clearTimeout(imageTimer);
    imageTimer = null;
  }
}

function clearHlsStallTimer() {
  if (hlsStallTimer) {
    clearTimeout(hlsStallTimer);
    hlsStallTimer = null;
  }
}

function clearHlsManifestTimer() {
  if (hlsManifestTimer) {
    clearTimeout(hlsManifestTimer);
    hlsManifestTimer = null;
  }
}

function destroyHls() {
  clearHlsStallTimer();
  clearHlsManifestTimer();
  if (hlsArmCtl) {
    hlsArmCtl.abort();
    hlsArmCtl = null;
  }
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

function resetMedia(nextType) {
  clearImageTimer();
  destroyHls();
  videoEl.pause();
  videoEl.style.display = 'none';
  videoEl.removeAttribute('src');
  videoEl.load();
  // 이전 항목의 stall seek 으로 점프된 currentTime 이 다음 항목 시작 위치로
  // 새어 들어가는 것 차단 (load() 만으론 일부 경로에서 reset 보장 안 됨).
  videoEl.currentTime = 0;

  if (nextType !== 'image') {
    imageEl.style.display = 'none';
    imageEl.src = '';
  }
}

export function renderPlaylist() {
  if (!listEl) return;
  listEl.innerHTML = '';
  state.playlist.forEach((item, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${item.title || item.id || item.url}`;
    if (idx === state.currentIndex) li.classList.add('active');
    listEl.appendChild(li);
  });
}

function callPlayNext() {
  if (state.onPlayNext) {
    Promise.resolve(state.onPlayNext()).catch(() => {});
  }
}

export function playIndex(idx) {
  const item = state.playlist[idx];
  if (!item) return;

  resetMedia(item.type);

  if (!item.localFile && !item.streamUrl) {
    log(`Playback unavailable: ${item.url || 'unknown'} (download failed?), skipping`);
    callPlayNext();
    return;
  }

  state.currentIndex = idx;
  renderPlaylist();

  const title = item.title || item.id || item.url;

  if (item.type === 'image') {
    imageEl.style.display = 'block';
    imageEl.src = item.localFile || item.streamUrl;

    const durationMs = (item.durationSeconds || 5) * 1000;
    imageTimer = setTimeout(() => callPlayNext(), durationMs);
    log(`Image display start (${(durationMs / 1000).toFixed(1)}s): ${title}`);
    return;
  }

  // Video / HLS
  videoEl.style.display = 'block';
  videoEl.style.objectFit = 'contain';
  imageEl.style.objectFit = 'contain';
  videoEl.volume = 1;
  videoEl.muted = !!state.videoMutedByAlert;

  if (item.type === 'hls') {
    if (window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls({
        enableWorker: true,
        progressive: true,
        lowLatencyMode: false,
        // attachMedia 시점의 videoEl.currentTime 대신 항상 0 부터 시작.
        startPosition: 0,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000000,
        maxBufferHole: 0.5,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 6,
        levelLoadingMaxRetry: 6,
      });
      hlsInstance.loadSource(item.streamUrl);
      hlsInstance.attachMedia(videoEl);
      videoEl.autoplay = true;
      let manifestLoaded = false;
      hlsManifestTimer = setTimeout(() => {
        if (!manifestLoaded && hlsInstance) {
          log(`HLS manifest timeout (15s): ${title}, skipping`);
          destroyHls();
          callPlayNext();
        }
      }, 15000);

      hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
        manifestLoaded = true;
        clearHlsManifestTimer();
        log(`HLS manifest loaded: ${title}`);
        videoEl.play().catch((err) => log(`Playback error (HLS): ${err.message}`));
      });

      // Stall detection — 타이머 핸들은 모듈 레벨(hlsStallTimer). destroyHls() 가 정리하므로
      // 항목 교체 시 이전 항목의 검사 루프가 새 항목에 끼어들지 않는다.
      let lastTime = -1;
      let stallCount = 0;

      function checkStalled() {
        if (!hlsInstance || !videoEl || videoEl.paused || videoEl.ended) return;
        if (lastTime >= 0 && Math.abs(videoEl.currentTime - lastTime) < 0.1) {
          stallCount++;
          if (stallCount <= 2) {
            const seekTo = videoEl.currentTime + 5;
            log(`HLS stall #${stallCount}: seeking from ${videoEl.currentTime.toFixed(1)}s to ${seekTo.toFixed(1)}s`);
            videoEl.currentTime = seekTo;
            videoEl.play().catch(() => {});
          } else {
            log('HLS stall persists after seek, skipping to next content');
            destroyHls();
            callPlayNext();
            return;
          }
        } else {
          stallCount = 0;
        }
        lastTime = videoEl.currentTime;
        hlsStallTimer = setTimeout(checkStalled, 3000);
      }

      // 첫 'playing' 이벤트 후에만 stall checker arm — manifest_loaded 직후 buffer 채우는
      // 동안의 currentTime 0 상태를 stall 로 오인하지 않도록 한다 (Windows cold disk 시나리오).
      // playing 이 영영 발화 안 하는 시나리오(첫 segment 완전 실패)는 hls.js fragLoadingMaxRetry → ERROR fatal → destroyHls + callPlayNext 경로로 cover.
      hlsArmCtl = new AbortController();
      videoEl.addEventListener('playing', () => {
        hlsStallTimer = setTimeout(checkStalled, 3000);
      }, { once: true, signal: hlsArmCtl.signal });

      hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
        log(`HLS error [${data.type}/${data.details}]`);
        if (!data.fatal) {
          if (videoEl && !videoEl.paused) {
            videoEl.pause();
            videoEl.play().catch(() => {});
          }
          return;
        }
        switch (data.type) {
          case window.Hls.ErrorTypes.NETWORK_ERROR:
            log('HLS network error, retrying...');
            hlsInstance.startLoad();
            break;
          case window.Hls.ErrorTypes.MEDIA_ERROR:
            log('HLS media error, recovering...');
            hlsInstance.recoverMediaError();
            break;
          default:
            log('HLS fatal error, skipping to next content');
            destroyHls();
            callPlayNext();
            break;
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = item.streamUrl;
      videoEl.play().catch((err) => log(`Playback error (HLS native): ${err.message}`));
    } else {
      log('HLS playback not supported.');
      callPlayNext();
    }
    log(`HLS streaming start: ${title}`);
    return;
  }

  // Standard video
  videoEl.autoplay = true;
  videoEl.muted = !!state.videoMutedByAlert;
  videoEl.src = item.localFile || item.streamUrl;
  videoEl.play().catch((err) => log(`Playback error: ${err.message}`));
  log(`Video playback start: ${title}`);
}

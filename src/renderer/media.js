import state from './state.js';
import { videoEl, imageEl, listEl, log } from './dom.js';

let hlsInstance = null;
let imageTimer = null;

function clearImageTimer() {
  if (imageTimer) {
    clearTimeout(imageTimer);
    imageTimer = null;
  }
}

function destroyHls() {
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
    log(`Playback unavailable: ${item.url || 'unknown'} (download failed?)`);
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
      hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
        log(`HLS manifest loaded: ${title}`);
        videoEl.play().catch((err) => log(`Playback error (HLS): ${err.message}`));
      });

      // Stall detection
      let lastTime = -1;
      let stallCount = 0;
      let stalledTimer = null;

      function clearStalledTimer() {
        if (stalledTimer) { clearTimeout(stalledTimer); stalledTimer = null; }
      }

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
            clearStalledTimer();
            destroyHls();
            callPlayNext();
            return;
          }
        } else {
          stallCount = 0;
        }
        lastTime = videoEl.currentTime;
        stalledTimer = setTimeout(checkStalled, 3000);
      }

      stalledTimer = setTimeout(checkStalled, 3000);
      videoEl.addEventListener('ended', clearStalledTimer, { once: true });

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
            clearStalledTimer();
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

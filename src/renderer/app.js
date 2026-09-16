/**
 * App entry point — orchestrates module initialization and event binding.
 * Loaded as <script type="module"> from index.html.
 */
import state from './state.js';
import { videoEl, moveHandle, statusOverlay, log } from './dom.js';
import { initScale } from './layout.js';
import { setupDownloadProgressListener, renderVersionToast, cleanupDownloadProgress } from './overlays.js';
import { loadNotices } from './notice.js';
import { loadPlaylist } from './playlist.js';
import { callPlayNext } from './media.js';
import { setupMoveHandle } from './move-handle.js';
import { startWeatherClock } from './weather.js';

// Initialise scaling (runs immediately — DOM is ready because module scripts are deferred)
initScale();

// --- DOMContentLoaded ---
window.addEventListener('DOMContentLoaded', () => {
  setupDownloadProgressListener();
  renderVersionToast();
  loadNotices().catch((err) => {
    log(`Notice load error: ${err.message}`);
  });
  loadPlaylist().catch((err) => {
    log(`Playlist load error: ${err.message}`);
    if (statusOverlay) {
      statusOverlay.style.display = 'flex';
    }
  });
  setupMoveHandle();
  startWeatherClock();
});

// --- Cleanup ---
window.addEventListener('beforeunload', () => {
  cleanupDownloadProgress();
});

// --- Video events ---
videoEl.addEventListener('ended', () => {
  callPlayNext();
});
videoEl.addEventListener('waiting', () => log('Buffering...'));
videoEl.addEventListener('stalled', () => log('Stream stalled'));
videoEl.addEventListener('error', () => {
  const err = videoEl.error;
  // err 가 없어도 로그는 남긴다 — resetMedia 의 removeAttribute+load() 가 빈 src error 를
  // 유발할 수 있는데, 조용히 넘기면 항목이 왜 스킵됐는지 현장에서 추적할 수 없다.
  log(err ? `Video error: ${err.message || err.code}, skipping to next` : 'Video error (no error object), skipping to next');
  callPlayNext();
});

// --- Input prevention ---
videoEl.addEventListener('click', (e) => e.preventDefault());
videoEl.addEventListener('dblclick', (e) => e.preventDefault());
videoEl.addEventListener('keydown', (e) => e.preventDefault());

// --- Context menu ---
document.addEventListener('contextmenu', (e) => {
  const isMoveHandle = moveHandle && moveHandle.contains(e.target);
  e.preventDefault();
  if (isMoveHandle) {
    e.stopPropagation();
    return;
  }
  if (window.mediaAPI?.showContextMenu) window.mediaAPI.showContextMenu();
}, { capture: true });

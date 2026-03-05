import state from './state.js';
import {
  noticeBar, weatherPanel, waitingPanel,
  landingOverlay, landingFrame, statusOverlay,
} from './dom.js';

let scaleTimer = null;
let landingUrl = 'https://www.admed.kr';
let landingLoaded = false;

export function applyLayout(nextWaitingInfo) {
  const mode = (nextWaitingInfo || '').toString().toUpperCase();
  let noticeH = 10;
  let panelW = 0;
  let showWeather = false;
  let showWaiting = false;

  switch (mode) {
    case 'N':
      noticeH = 0;
      panelW = 0;
      break;
    case 'A':
      noticeH = 10;
      panelW = 0;
      break;
    case 'B':
      noticeH = 12;
      panelW = 12;
      showWeather = true;
      break;
    case 'Y':
      noticeH = 15;
      panelW = 15;
      showWaiting = true;
      break;
    default:
      noticeH = 10;
      panelW = 0;
      break;
  }

  document.documentElement.style.setProperty('--notice-h', String(noticeH));
  document.documentElement.style.setProperty('--panel-w', String(panelW));

  if (weatherPanel) weatherPanel.style.display = showWeather ? 'flex' : 'none';
  if (waitingPanel) waitingPanel.style.display = showWaiting ? 'flex' : 'none';

  if (noticeBar) {
    if (mode === 'N') {
      noticeBar.style.display = 'none';
    } else {
      noticeBar.style.display = state.noticeList.length ? 'flex' : 'none';
    }
  }
}

export function applyScale() {
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));
}

export function initScale() {
  applyScale();
  window.addEventListener(
    'resize',
    () => {
      if (scaleTimer) clearTimeout(scaleTimer);
      scaleTimer = setTimeout(applyScale, 50);
    },
    { passive: true },
  );
}

export function showLandingOverlay(show) {
  if (!landingOverlay) return;
  landingOverlay.style.display = show ? 'flex' : 'none';
  if (show && landingFrame && landingUrl) {
    if (!landingLoaded || landingFrame.src === 'about:blank') {
      landingFrame.src = landingUrl;
      landingLoaded = true;
    }
  }
}

export function setLandingUrl(url) {
  if (url) {
    landingUrl = url;
    landingLoaded = false;
    if (landingFrame) landingFrame.src = 'about:blank';
  }
}

// Show logo overlay on load
if (statusOverlay) {
  statusOverlay.style.display = 'flex';
}

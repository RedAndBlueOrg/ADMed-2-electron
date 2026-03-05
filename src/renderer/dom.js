import state from './state.js';

// DOM element references (module scripts are deferred — DOM is ready)
export const videoEl = document.getElementById('video');
export const imageEl = document.getElementById('image');
export const listEl = document.getElementById('playlist');
export const noticeBar = document.getElementById('notice-bar');
export const noticeText = document.getElementById('notice-text');
export const noticeSpan = noticeText?.querySelector('.moving-text-span');
export const statusOverlay = document.getElementById('status-overlay');
export const errorOverlay = document.getElementById('error-overlay');
export const landingOverlay = document.getElementById('landing-overlay');
export const landingFrame = document.getElementById('landing-iframe');
export const landingMessage = document.getElementById('landing-message');
export const moveHandle = document.querySelector('.move-handle');
export const playerEl = document.getElementById('player');
export const weatherPanel = document.getElementById('weather-panel');
export const weatherTitle = document.getElementById('weather-title');
export const weatherMeta = document.getElementById('weather-meta');
export const weatherContent = document.getElementById('weather-content');
export const waitingPanel = document.getElementById('waiting-panel');
export const clinicListEl = document.getElementById('clinic-list');
export const clinicAlertEl = document.getElementById('clinic-alert');
export const downloadOverlay = document.getElementById('download-overlay');
export const downloadProgressFill = document.getElementById('download-progress-fill');
export const downloadProgressText = document.getElementById('download-progress-text');
export const downloadProgressBar = document.getElementById('download-progress-bar');
export const versionToast = document.getElementById('version-toast');

/** Centralised log — hides status overlay once content starts playing. */
export function log(message) {
  console.log(message);
  if (!state.overlayLocked && statusOverlay) {
    statusOverlay.style.display = 'none';
  }
}

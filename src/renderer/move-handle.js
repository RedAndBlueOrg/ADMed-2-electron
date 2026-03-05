import { moveHandle, playerEl } from './dom.js';

let moveHandleTimer = null;

function isFullscreenLike() {
  if (document.fullscreenElement) return true;
  const sw = window.screen?.width || 0;
  const sh = window.screen?.height || 0;
  return window.innerWidth >= sw && window.innerHeight >= sh - 1;
}

export function setupMoveHandle() {
  if (!moveHandle || !playerEl) return;

  let dragging = false;
  moveHandle.style.cursor = 'grab';

  const showHandle = () => {
    if (isFullscreenLike()) return;
    moveHandle.classList.add('visible');
    if (moveHandleTimer) clearTimeout(moveHandleTimer);
    if (!dragging) {
      moveHandleTimer = setTimeout(() => moveHandle.classList.remove('visible'), 1500);
    }
  };
  playerEl.addEventListener('mousemove', showHandle);
  moveHandle.addEventListener('mouseenter', showHandle);

  moveHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    dragging = true;
    if (moveHandleTimer) {
      clearTimeout(moveHandleTimer);
      moveHandleTimer = null;
    }
    moveHandle.style.display = 'flex';
    moveHandle.style.opacity = '1';
    moveHandle.classList.add('visible', 'dragging');
    moveHandle.style.setProperty('cursor', 'grabbing', 'important');
    document.body.style.setProperty('cursor', 'grabbing', 'important');
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    moveHandle.classList.remove('dragging');
    moveHandle.style.setProperty('cursor', 'grab', 'important');
    document.body.style.removeProperty('cursor');
    if (moveHandleTimer) clearTimeout(moveHandleTimer);
    moveHandleTimer = setTimeout(() => moveHandle.classList.remove('visible'), 1500);
  };
  window.addEventListener('mouseup', endDrag);

  moveHandle.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  const updateHandleVisibility = () => {
    if (isFullscreenLike()) {
      moveHandle.classList.remove('visible');
      moveHandle.classList.remove('dragging');
      moveHandle.style.display = 'none';
      moveHandle.style.removeProperty('cursor');
      document.body.style.removeProperty('cursor');
    } else {
      moveHandle.style.display = 'flex';
    }
  };
  document.addEventListener('fullscreenchange', updateHandleVisibility);
  window.addEventListener('resize', updateHandleVisibility);
  updateHandleVisibility();
}

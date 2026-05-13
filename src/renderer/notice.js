import state from './state.js';
import { noticeBar, noticeText, noticeSpan, log } from './dom.js';
import { applyLayout } from './layout.js';
import { setupClinicRealtime } from './clinic.js';

let startPosition = '100%';
let endPosition = '-100%';
let animationDuration = 18;

export function renderNotice(shouldShow) {
  if (!noticeBar || !noticeText || !noticeSpan) return;
  if (!shouldShow || !state.noticeList.length) {
    noticeBar.style.display = shouldShow ? 'flex' : 'none';
    return;
  }

  const sorted = [...state.noticeList].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const item = sorted[state.noticeIndex % sorted.length];
  const text = item.content || '';
  noticeSpan.textContent = text;

  requestAnimationFrame(() => {
    const barWidth = noticeBar.clientWidth || window.innerWidth || 1920;
    const textWidth = noticeSpan.offsetWidth || text.length * 20;
    const totalDistance = barWidth + textWidth;
    const speed = 140; // px/sec — 흐르는 속도는 글자 길이와 무관하게 일정. 길면 비례해서 더 오래 흐른다.
    let duration = totalDistance / speed;
    // 아래쪽만 클램프(아주 짧은 공지가 순식간에 지나가는 것 방지). 위쪽 캡은 두지 않는다 —
    // 캡을 두면 긴 공지가 그 시간 안에 압축돼서 빨라져 못 읽게 됨.
    duration = Math.max(8, duration);
    animationDuration = duration;

    startPosition = `${barWidth}px`;
    endPosition = `${-textWidth}px`;

    noticeText.style.setProperty('--start-position', startPosition);
    noticeText.style.setProperty('--end-position', endPosition);
    noticeText.style.animation = 'none';
    // reflow
    // eslint-disable-next-line no-unused-expressions
    noticeText.offsetWidth;
    noticeText.style.animation = `move ${animationDuration}s linear`;
    noticeText.style.animationDelay = '0s';
    noticeText.style.animationIterationCount = '1';
    noticeText.style.animationPlayState = 'running';
    noticeBar.style.display = 'flex';

    noticeText.onanimationend = () => {
      state.noticeIndex = (state.noticeIndex + 1) % sorted.length;
      renderNotice(true);
    };
  });
}

export async function loadNotices() {
  try {
    const res = await window.mediaAPI.fetchNotices();
    state.waitingInfo = res.waitingInfo || state.waitingInfo;
    state.noticeList = res.noticeList || [];
    state.noticeIndex = 0;
    applyLayout(state.waitingInfo);
    setupClinicRealtime({
      waitingInfo: state.waitingInfo,
      memberSeq: state.clinicMemberSeq,
      deviceSerial: state.clinicDeviceSerial,
      clinicApiOrigin: state.clinicApiOrigin,
      clinicWsOrigin: state.clinicWsOrigin,
    });
    if (state.waitingInfo !== 'N' && state.noticeList.length) {
      renderNotice(true);
    }
  } catch (err) {
    log(`Notice load error: ${err.message}`);
  }
}

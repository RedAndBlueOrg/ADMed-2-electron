import state from './state.js';
import { videoEl, clinicListEl, clinicAlertEl, waitingPanel, playerEl, weatherPanel } from './dom.js';

// --- Module-local state ---
let clinicQueues = new Map();
let clinicWsUnsubscribe = null;
let clinicConfigKey = '';
let clinicSeqHint = null;
let clinicRotationTimer = null;
let clinicScrollRaf = null;
let clinicRotationIndex = 0;
let clinicPanelSide = 'L';
let clinicTestAlertShown = false;
let clinicAlertAudio = null;
let clinicAlertQueue = [];
let clinicAlertProcessing = false;
let clinicSeqList = [];
let clinicAlertTimer = null;

// --- TTS / Name utilities ---

function maskName(name) {
  const str = (name || '').toString();
  if (!str) return '-';
  if (str.length === 1) return str;
  if (str.length === 2) return `${str[0]}O`;
  const chars = str.split('');
  const mid = Math.floor(chars.length / 2);
  chars[mid] = 'O';
  return chars.join('');
}

function commaByChar(text) {
  return text
    .split(' ')
    .map(word => word.split('').join(', '))
    .join(' ');
}

function numberToKorean(num) {
  const map = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  return String(num)
    .split('')
    .map(d => map[Number(d)] || d)
    .join('');
}

function clinicLabelForTts(label) {
  const match = label.match(/(\d+)/);
  if (!match) return label;
  const num = match[1];
  const kor = numberToKorean(num);
  return label
    .replace(`${num}번`, `${kor} 번`)
    .replace(num, kor);
}

// --- Panel layout ---

function applyClinicPanelSide() {
  const side = clinicPanelSide === 'R' ? 'R' : 'L';
  if (waitingPanel) waitingPanel.style.order = side === 'R' ? 2 : 0;
  if (playerEl) playerEl.style.order = 1;
  if (weatherPanel) weatherPanel.style.order = side === 'R' ? 1 : 2;
  const stage = document.getElementById('stage');
  if (stage) stage.style.justifyContent = 'flex-start';
}

// --- Queue helpers ---

function resetClinicUi() {
  clinicQueues = new Map();
  if (clinicListEl) clinicListEl.innerHTML = '';
}

function getClinicNameBySeq(seq) {
  if (!clinicQueues.size) return null;
  const found = clinicQueues.get(seq);
  return found?.name || null;
}

function sortQueue(content = []) {
  return [...content].sort((a, b) => {
    const sa = a?.sort ?? 0;
    const sb = b?.sort ?? 0;
    if (sa !== sb) return sa - sb;
    const ia = (a?.id || a?.name || '').toString();
    const ib = (b?.id || b?.name || '').toString();
    return ia.localeCompare(ib);
  });
}

// --- Render clinic list ---

function renderClinicList() {
  if (clinicRotationTimer) {
    clearTimeout(clinicRotationTimer);
    clinicRotationTimer = null;
  }
  if (clinicScrollRaf) {
    cancelAnimationFrame(clinicScrollRaf);
    clinicScrollRaf = null;
  }

  if (!clinicListEl) return;
  const clinics = Array.from(clinicQueues.values()).sort((a, b) => {
    const sa = a.seq ?? 0;
    const sb = b.seq ?? 0;
    if (sa !== sb) return sa - sb;
    return (a.name || '').toString().localeCompare((b.name || '').toString());
  });

  clinicListEl.innerHTML = '';
  if (!clinics.length) {
    const placeholder = document.createElement('div');
    placeholder.className = 'queue-empty';
    placeholder.textContent = state.clinicEnabled
      ? '대기 환자가 없습니다.'
      : '대기 현황 비활성화됨';
    clinicListEl.appendChild(placeholder);
    return;
  }

  const clinicsToShow = clinics;
  if (clinicRotationIndex >= clinicsToShow.length) clinicRotationIndex = 0;
  const clinic = clinicsToShow[clinicRotationIndex];

  if (!clinic) return;
  if (clinic.screenDirection) {
    clinicPanelSide = clinic.screenDirection.toUpperCase() === 'R' ? 'R' : 'L';
    applyClinicPanelSide();
  }

  const queue = clinic.queue || [];
  const highlightActive = clinic.highlight && Date.now() - clinic.highlight < 4000;
  const card = document.createElement('div');
  card.className = `clinic-card${highlightActive ? ' highlight' : ''}`;

  const head = document.createElement('div');
  head.className = 'clinic-head';
  const nameEl = document.createElement('div');
  nameEl.textContent = clinic.name || `진료실 ${clinic.seq || ''}`;
  nameEl.classList.add('oneLine', 'text-wrap');
  head.appendChild(nameEl);

  const meta = document.createElement('div');
  meta.className = 'clinic-meta-bar';
  const metaLabel1 = document.createElement('div');
  metaLabel1.className = 'label';
  metaLabel1.textContent = '진료중';
  const metaValue1 = document.createElement('div');
  metaValue1.className = 'value text-wrap oneLine';
  metaValue1.textContent = clinic.currentPatient ? maskName(clinic.currentPatient.name || clinic.currentPatient.id) : '-';
  const metaLabel2 = document.createElement('div');
  metaLabel2.className = 'label';
  metaLabel2.textContent = '대기';
  const metaValue2 = document.createElement('div');
  metaValue2.className = 'value text-wrap oneLine';
  metaValue2.textContent = `${queue.length}명`;
  meta.appendChild(metaLabel1);
  meta.appendChild(metaValue1);
  meta.appendChild(metaLabel2);
  meta.appendChild(metaValue2);

  const queueWrapper = document.createElement('div');
  queueWrapper.className = 'clinic-queue';
  const queueViewport = document.createElement('div');
  queueViewport.className = 'queue-viewport';
  const queueRows = document.createElement('div');
  queueRows.className = 'queue-rows';

  if (!queue.length) {
    const empty = document.createElement('div');
    empty.className = 'queue-empty';
    empty.textContent = '대기 환자가 없습니다.';
    queueRows.appendChild(empty);
  } else {
    queue.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'queue-row';

      const idxEl = document.createElement('div');
      idxEl.className = 'idx';
      idxEl.textContent = String(idx + 1);

      const nameElRow = document.createElement('div');
      nameElRow.className = 'name oneLine text-wrap';
      const masked = maskName(item.name || item.id || '환자');
      nameElRow.textContent = masked;
      if (item.reserved) {
        const resv = document.createElement('span');
        resv.className = 'badge-reserved';
        resv.textContent = '예약';
        nameElRow.appendChild(resv);
      }

      row.appendChild(idxEl);
      row.appendChild(nameElRow);
      queueRows.appendChild(row);
    });
  }

  queueViewport.appendChild(queueRows);
  queueWrapper.appendChild(queueViewport);

  card.appendChild(head);
  card.appendChild(meta);
  card.appendChild(queueWrapper);
  clinicListEl.appendChild(card);

  const totalClinics = clinicsToShow.length;
  const baseDelay = 4000;
  let scrollStarted = false;

  const scheduleNext = (extra = 0) => {
    if (clinicRotationTimer) clearTimeout(clinicRotationTimer);
    clinicRotationTimer = setTimeout(() => {
      if (totalClinics > 1) {
        clinicRotationIndex = (clinicRotationIndex + 1) % totalClinics;
        renderClinicList();
      } else {
        startAutoScroll();
      }
    }, baseDelay + extra);
  };

  const startAutoScroll = () => {
    queueViewport.scrollTop = 0;
    const extra = queueViewport.scrollHeight - queueViewport.clientHeight;
    if (extra <= 0) {
      scheduleNext();
      return;
    }
    const duration = Math.min(18000, Math.max(8000, extra * 40));
    setTimeout(() => {
      const start = performance.now();
      const from = 0;
      const to = extra;
      const step = (ts) => {
        const t = Math.min(1, (ts - start) / duration);
        queueViewport.scrollTop = from + to * t;
        if (t < 1) {
          clinicScrollRaf = requestAnimationFrame(step);
        } else {
          clinicScrollRaf = null;
          setTimeout(() => {
            if (totalClinics > 1) {
              clinicRotationIndex = (clinicRotationIndex + 1) % totalClinics;
              renderClinicList();
            } else {
              queueViewport.scrollTop = 0;
              setTimeout(() => {
                startAutoScroll();
              }, 4000);
            }
          }, 2000);
        }
      };
      clinicScrollRaf = requestAnimationFrame(step);
    }, 4000);
  };

  const ensureScroll = () => {
    const needsScroll = queueViewport.scrollHeight > queueViewport.clientHeight + 2;
    if (needsScroll && !scrollStarted) {
      if (clinicRotationTimer) {
        clearTimeout(clinicRotationTimer);
        clinicRotationTimer = null;
      }
      scrollStarted = true;
      startAutoScroll();
      queueWrapper.dataset.scrolling = 'true';
      return true;
    }
    return needsScroll;
  };

  requestAnimationFrame(() => {
    const hasScroll = ensureScroll();
    if (!hasScroll) {
      queueWrapper.dataset.scrolling = 'false';
      scheduleNext();
      setTimeout(() => {
        if (!scrollStarted) {
          if (!ensureScroll()) {
            queueWrapper.dataset.scrolling = 'false';
          }
        }
      }, 500);
    }
  });

  queueWrapper.addEventListener('wheel', () => {
    queueWrapper.dataset.scrolling = 'manual';
    if (clinicScrollRaf) {
      cancelAnimationFrame(clinicScrollRaf);
      clinicScrollRaf = null;
    }
  }, { passive: true });
}

// --- Snapshot / Message handling ---

function applyClinicSnapshot(seq, payload, { highlightOnAdd = false } = {}) {
  if (!seq && seq !== 0) return;
  const prev = clinicQueues.get(seq) || {};
  const queue = sortQueue(payload?.content || []);
  const next = {
    ...prev,
    seq,
    name: payload?.name || prev.name || `진료실 ${seq}`,
    queue,
    currentPatient: payload?.currentPatient || null,
    highlight: highlightOnAdd ? Date.now() : prev.highlight,
    screenDirection: payload?.screenDirection || prev.screenDirection || clinicPanelSide,
  };
  clinicQueues.set(seq, next);
  renderClinicList();
}

function handleClinicMessagePayload(payload) {
  try {
    const msg =
      typeof payload === 'string'
        ? JSON.parse(payload)
        : payload && typeof payload === 'object'
          ? payload
          : null;
    if (!msg) return;
    const seq = msg.seq ?? msg.clinicSeq ?? msg.id ?? msg.clinicId;
    const contentRaw = msg.content;
    const content = Array.isArray(contentRaw)
      ? contentRaw
      : Array.isArray(contentRaw?.list)
        ? contentRaw.list
        : Array.isArray(contentRaw?.queue)
          ? contentRaw.queue
          : [];
    if (!seq) return;
    applyClinicSnapshot(
      seq,
      {
        content,
        currentPatient: msg.currentPatient,
        name: msg.name || msg.clinicName || msg.sender,
        screenDirection: msg.screenDirection || msg.screen || msg.dir,
      },
      { highlightOnAdd: msg.kind === 'add' },
    );

    if (msg.kind === 'add' && (msg.currentPatient || (content && content.length))) {
      const target = msg.currentPatient || content[0];
      enqueueClinicAlert(target.name || target.id || '환자', seq, {
        clinicName: msg.name || msg.clinicName,
      });
    }
  } catch (err) {
    console.warn('[clinic] invalid ws message:', err.message);
  }
}

// --- Alert system ---

function showClinicAlert(rawName, seq, { durationMs = 10000, clinicName } = {}) {
  const name = (rawName || '').toString() || '환자';
  const clinicLabel = clinicName || getClinicNameBySeq(seq) || (seq ? `진료실 ${seq}` : '진료실');
  if (!clinicAlertEl) return Promise.resolve();

  clinicAlertEl.innerHTML = `<div class="bubble">${name}님,<br />'${clinicLabel}'로<br />들어오세요.</div>`;
  clinicAlertEl.classList.add('visible');
  const effectiveDuration = durationMs ?? 12000;

  return new Promise((resolve) => {
    if (clinicAlertTimer) clearTimeout(clinicAlertTimer);
    clinicAlertTimer = setTimeout(() => {
      clinicAlertEl.classList.remove('visible');
      resolve();
    }, effectiveDuration);
  });
}

function playClinicAlertSoundAndTts(text) {
  const playSound = () =>
    new Promise((resolve) => {
      try {
        if (!clinicAlertAudio) {
          clinicAlertAudio = new Audio('./modalAudio.wav');
        }
        clinicAlertAudio.currentTime = 0;
        const onEnd = () => {
          clinicAlertAudio.removeEventListener('ended', onEnd);
          resolve();
        };
        clinicAlertAudio.addEventListener('ended', onEnd);
        clinicAlertAudio.play().catch(() => resolve());
      } catch (_) {
        resolve();
      }
    });

  const playTts = () =>
    new Promise((resolve) => {
      try {
        if (!('speechSynthesis' in window)) return resolve();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'ko-KR';
        utter.rate = 0.90;
        utter.pitch = 1.0;
        utter.volume = 1.0;
        const onEnd = () => {
          utter.removeEventListener('end', onEnd);
          utter.removeEventListener('error', onEnd);
          resolve();
        };
        utter.addEventListener('end', onEnd);
        utter.addEventListener('error', onEnd);
        window.speechSynthesis.cancel();
        setTimeout(() => window.speechSynthesis.speak(utter), 500);
        setTimeout(() => resolve(), 15000);
      } catch (_) {
        resolve();
      }
    });

  return Promise.all([playSound(), playTts()]);
}

function enqueueClinicAlert(name, seq, { clinicName, durationMs } = {}) {
  clinicAlertQueue.push({ name, seq, clinicName, durationMs });
  processClinicAlertQueue();
}

async function processClinicAlertQueue() {
  if (clinicAlertProcessing) return;
  const alert = clinicAlertQueue.shift();
  if (!alert) return;
  clinicAlertProcessing = true;

  const label = alert.clinicName || getClinicNameBySeq(alert.seq) || (alert.seq ? `진료실 ${alert.seq}` : '진료실');
  const text = `${commaByChar(alert.name)},님, ${clinicLabelForTts(label)}로 들어오세요.`;
  const duration = alert.durationMs ?? Math.max(10000, Math.min(15000, text.length * 220));

  const shouldMute = videoEl && !videoEl.paused && !videoEl.muted;
  if (shouldMute) {
    state.videoMutedByAlert = true;
    videoEl.muted = true;
  }

  await Promise.all([
    showClinicAlert(alert.name, alert.seq, { durationMs: duration, clinicName: alert.clinicName }),
    playClinicAlertSoundAndTts(text),
  ]);

  if (shouldMute && state.videoMutedByAlert && videoEl) {
    videoEl.muted = false;
    state.videoMutedByAlert = false;
  }

  clinicAlertProcessing = false;
  if (clinicAlertQueue.length) processClinicAlertQueue();
}

// --- REST API fetch ---

async function fetchClinicList() {
  if (!state.clinicEnabled || !state.clinicApiOrigin || !state.clinicMemberSeq) {
    resetClinicUi();
    return;
  }
  try {
    const url = new URL('/dapi/clinic/list', state.clinicApiOrigin);
    url.searchParams.set('memberId', state.clinicMemberSeq);
    if (state.clinicDeviceSerial) url.searchParams.set('serial', state.clinicDeviceSerial);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.clinics) ? data.clinics : [];
    clinicQueues = new Map();
    const seqList = [];
    const firstSeq = list.find((item) => item.seq ?? item.clinicSeq ?? item.id);
    if (firstSeq) clinicSeqHint = firstSeq.seq ?? firstSeq.clinicSeq ?? firstSeq.id;
    list.forEach((item, idx) => {
      const seq = item.seq ?? item.clinicSeq ?? item.id ?? idx + 1;
      if (seq) seqList.push(seq);
      applyClinicSnapshot(
        seq,
        {
          content: item.patients || item.content || [],
          currentPatient: item.currentPatient || null,
          name: item.name || item.clinicName || item.doctorName || `진료실 ${seq}`,
          screenDirection: item.screenDirection || item.direction || clinicPanelSide,
        },
        { highlightOnAdd: false },
      );
    });
    clinicSeqList = seqList;
    if (seqList.length) clinicSeqHint = seqList[0];
    renderClinicList();
  } catch (err) {
    console.warn('[clinic] list fetch failed:', err.message);
  }
}

// --- WebSocket ---

function stopClinicSocketInternal() {
  if (clinicWsUnsubscribe) {
    clinicWsUnsubscribe();
    clinicWsUnsubscribe = null;
  }
  if (window.clinicWS?.stop) {
    window.clinicWS.stop();
  }
}

function startClinicSocketInternal() {
  if (!state.clinicEnabled || !state.clinicWsOrigin || !state.clinicMemberSeq || !window.clinicWS?.start) return;
  stopClinicSocketInternal();
  clinicWsUnsubscribe = window.clinicWS.onMessage((payload) => {
    if (payload?.type === 'data') {
      handleClinicMessagePayload(payload.data ?? payload.raw);
    }
  });
  window.clinicWS.start({
    memberSeq: state.clinicMemberSeq,
    clinicWsOrigin: state.clinicWsOrigin,
    clinicSeqList: clinicSeqList && clinicSeqList.length ? clinicSeqList : clinicSeqHint ? [clinicSeqHint] : [],
  });
}

// --- Public API ---

export function setupClinicRealtime(config) {
  const shouldEnable =
    config.waitingInfo === 'Y' &&
    !!config.memberSeq &&
    !!config.clinicApiOrigin &&
    !!config.clinicWsOrigin;
  const configKey = `${config.memberSeq || ''}|${config.clinicApiOrigin || ''}|${config.clinicWsOrigin || ''}`;

  if (!window.clinicWS?.start) {
    console.warn('[clinic] clinicWS bridge missing. Check preload exposure.');
  }

  state.clinicMemberSeq = config.memberSeq || null;
  state.clinicDeviceSerial = config.deviceSerial || '';
  state.clinicApiOrigin = config.clinicApiOrigin || '';
  state.clinicWsOrigin = config.clinicWsOrigin || '';

  if (!shouldEnable) {
    state.clinicEnabled = false;
    clinicConfigKey = '';
    stopClinicSocketInternal();
    resetClinicUi();
    return;
  }

  if (state.clinicEnabled && clinicConfigKey === configKey) {
    return;
  }

  state.clinicEnabled = true;
  clinicConfigKey = configKey;
  clinicPanelSide = (config.screenDirection || 'L').toUpperCase() === 'R' ? 'R' : 'L';
  applyClinicPanelSide();
  resetClinicUi();
  fetchClinicList().finally(() => {
    startClinicSocketInternal();
  });
}

export function stopClinicSocket() {
  stopClinicSocketInternal();
}

export function restartClinicRealtime() {
  if (!state.clinicEnabled) return;
  stopClinicSocketInternal();
  fetchClinicList().finally(() => {
    startClinicSocketInternal();
  });
}

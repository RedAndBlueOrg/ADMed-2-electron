const videoEl = document.getElementById('video');
const imageEl = document.getElementById('image');
const listEl = document.getElementById('playlist');
const noticeBar = document.getElementById('notice-bar');
const noticeText = document.getElementById('notice-text');
const noticeSpan = noticeText?.querySelector('.moving-text-span');
const statusOverlay = document.getElementById('status-overlay');
const errorOverlay = document.getElementById('error-overlay');
const landingOverlay = document.getElementById('landing-overlay');
const landingFrame = document.getElementById('landing-iframe');
const landingMessage = document.getElementById('landing-message');
const moveHandle = document.querySelector('.move-handle');
const playerEl = document.getElementById('player');
const weatherPanel = document.getElementById('weather-panel');
const weatherTitle = document.getElementById('weather-title');
const weatherMeta = document.getElementById('weather-meta');
const weatherContent = document.getElementById('weather-content');
const waitingPanel = document.getElementById('waiting-panel');
const clinicListEl = document.getElementById('clinic-list');
const clinicAlertEl = document.getElementById('clinic-alert');
const downloadOverlay = document.getElementById('download-overlay');
const downloadProgressFill = document.getElementById('download-progress-fill');
const downloadProgressText = document.getElementById('download-progress-text');
const downloadProgressBar = document.getElementById('download-progress-bar');

let playlist = [];
let currentIndex = 0;
let imageTimer = null;
let hlsInstance = null;
let waitingInfo = null;
let noticeList = [];
let noticeIndex = 0;
let startPosition = '100%';
let endPosition = '-100%';
let animationDuration = 18;
let moveHandleTimer = null;
let playlistLoading = false;
let apiError = false;
let weatherReady = false;
let weatherTimer = null;
let cachedWeatherConfig = null;
let overlayLocked = true; // 오버레이 사라짐 제어
let retryTimer = null;
let onlineCheckTimer = null;
let errorState = false;
let onlineCheckStarted = false;
let lastWeatherFetch = null; // 마지막 성공 fetch 시각
let recovering = false;
let lastWeatherInfo = null;
let weatherClockTimer = null;
let weatherClockTimeout = null;
let overlayTimer = null;
let clinicMemberSeq = null;
let clinicDeviceSerial = '';
let clinicApiOrigin = '';
let clinicWsOrigin = '';
let clinicEnabled = false;
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
let videoMutedByAlert = false;
let clinicSeqList = [];
let landingUrl = 'https://www.admed.kr';
let landingLoaded = false;
let scaleTimer = null;
let downloadHideTimer = null;
let downloadProgressUnsub = null;

function applyLayout(nextWaitingInfo) {
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
      noticeH = 10;
      panelW = 10;
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
      noticeBar.style.display = noticeList.length ? 'flex' : 'none';
    }
  }
}

// 초기 로고 오버레이 노출
if (statusOverlay) {
  statusOverlay.style.display = 'flex';
}

function applyScale() {
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));
}

applyScale();
window.addEventListener(
  'resize',
  () => {
    if (scaleTimer) clearTimeout(scaleTimer);
    scaleTimer = setTimeout(applyScale, 50);
  },
  { passive: true }
);

function showLandingOverlay(show) {
  if (!landingOverlay) return;
  landingOverlay.style.display = show ? 'flex' : 'none';
  if (show && landingFrame && landingUrl) {
    if (!landingLoaded || landingFrame.src === 'about:blank') {
      landingFrame.src = landingUrl;
      landingLoaded = true;
    }
  }
}

function log(message) {
  console.log(message);
  if (!overlayLocked && statusOverlay) {
    statusOverlay.style.display = 'none';
  }
}

function updateDownloadOverlay({ total = 0, finished = 0, active = false } = {}) {
  if (!downloadOverlay) return;
  if (downloadHideTimer) {
    clearTimeout(downloadHideTimer);
    downloadHideTimer = null;
  }

  const totalCount = Number(total) || 0;
  const doneCount = Math.min(Number(finished) || 0, totalCount);
  const isActive = Boolean(active) && totalCount > 0;
  const ratio = totalCount ? Math.min(1, doneCount / totalCount) : 0;
  const percent = Math.round(ratio * 100);

  if (downloadProgressText) {
    downloadProgressText.textContent = `시나리오 컨텐츠를 동기화중입니다. (${doneCount}/${totalCount || 0})`;
  }
  if (downloadProgressFill) {
    downloadProgressFill.style.width = `${percent}%`;
  }
  if (downloadProgressBar) {
    downloadProgressBar.setAttribute('aria-valuenow', String(percent));
  }

  if (!isActive && totalCount === 0) {
    downloadOverlay.classList.remove('visible');
    return;
  }

  downloadOverlay.classList.add('visible');

  if (!isActive && totalCount > 0) {
    downloadHideTimer = setTimeout(() => {
      if (downloadOverlay) downloadOverlay.classList.remove('visible');
    }, 900);
  }
}

function setupDownloadProgressListener() {
  if (!window.mediaAPI?.onDownloadProgress) return;
  downloadProgressUnsub = window.mediaAPI.onDownloadProgress((payload) => {
    updateDownloadOverlay(payload || {});
  });
  updateDownloadOverlay({ total: 0, finished: 0, active: false });
}

function renderPlaylist() {
  if (!listEl) return;
  listEl.innerHTML = '';
  playlist.forEach((item, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx + 1}. ${item.title || item.id || item.url}`;
    if (idx === currentIndex) li.classList.add('active');
    listEl.appendChild(li);
  });
}

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

function resetClinicUi(message) {
  clinicQueues = new Map();
  if (clinicListEl) clinicListEl.innerHTML = '';
}

function getClinicNameBySeq(seq) {
  if (!clinicQueues.size) return null;
  const found = clinicQueues.get(seq);
  return found?.name || null;
}

function applyClinicPanelSide() {
  const side = clinicPanelSide === 'R' ? 'R' : 'L';
  if (waitingPanel) waitingPanel.style.order = side === 'R' ? 2 : 0;
  if (playerEl) playerEl.style.order = 1;
  if (weatherPanel) weatherPanel.style.order = side === 'R' ? 1 : 2;
  const stage = document.getElementById('stage');
  if (stage) stage.style.justifyContent = 'flex-start';
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
    placeholder.textContent = clinicEnabled
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
      // 폰트 로딩 등으로 높이가 변할 수 있어 500ms 후 재확인
      setTimeout(() => {
        if (!scrollStarted) {
          if (!ensureScroll()) {
            queueWrapper.dataset.scrolling = 'false';
          }
        }
      }, 500);
    }
  });

  // 재렌더/데이터 변경 시 스크롤 재시작
  queueWrapper.addEventListener('wheel', () => {
    queueWrapper.dataset.scrolling = 'manual';
    if (clinicScrollRaf) {
      cancelAnimationFrame(clinicScrollRaf);
      clinicScrollRaf = null;
    }
  }, { passive: true });
}

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
    { highlightOnAdd: msg.kind === 'add' }
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

async function fetchClinicList() {
  if (!clinicEnabled || !clinicApiOrigin || !clinicMemberSeq) {
    resetClinicUi(clinicEnabled ? '대기 현황 비활성화됨' : '대기 현황 비활성화됨');
    return;
  }
  try {
    const url = new URL('/dapi/clinic/list', clinicApiOrigin);
    url.searchParams.set('memberId', clinicMemberSeq);
    if (clinicDeviceSerial) url.searchParams.set('serial', clinicDeviceSerial);
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
        { highlightOnAdd: false }
      );
      // 테스트용 자동 호출 오버레이 표시
      // if (!clinicTestAlertShown && Array.isArray(item.patients) && item.patients.length) {
      //   const firstPatient = item.patients[0];
      //   showClinicAlert(firstPatient.name || firstPatient.id || '환자', seq, { durationMs: null });
      //   clinicTestAlertShown = true;
      // }
    });
    clinicSeqList = seqList;
    if (seqList.length) clinicSeqHint = seqList[0];
    if (window.clinicWS?.start) {
      window.clinicWS.start({
        memberSeq: clinicMemberSeq,
        clinicWsOrigin,
        clinicSeqList: seqList,
      });
    }
    renderClinicList();
  } catch (err) {
    console.warn('[clinic] list fetch failed:', err.message);
  }
}

function stopClinicSocket() {
  if (clinicWsUnsubscribe) {
    clinicWsUnsubscribe();
    clinicWsUnsubscribe = null;
  }
  if (window.clinicWS?.stop) {
    window.clinicWS.stop();
  }
}

function startClinicSocket() {
  if (!clinicEnabled || !clinicWsOrigin || !clinicMemberSeq || !window.clinicWS?.start) return;
  stopClinicSocket();
  clinicWsUnsubscribe = window.clinicWS.onMessage((payload) => {
    if (payload?.type === 'data') {
      handleClinicMessagePayload(payload.data ?? payload.raw);
    } else if (payload?.type === 'status') {
      // status logs removed for production
    }
  });
  window.clinicWS.start({
    memberSeq: clinicMemberSeq,
    clinicWsOrigin,
    clinicSeqList: clinicSeqList && clinicSeqList.length ? clinicSeqList : clinicSeqHint ? [clinicSeqHint] : [],
  });
}

function setupClinicRealtime(config) {
  const shouldEnable =
    config.waitingInfo === 'Y' &&
    !!config.memberSeq &&
    !!config.clinicApiOrigin &&
    !!config.clinicWsOrigin;
  const configKey = `${config.memberSeq || ''}|${config.clinicApiOrigin || ''}|${config.clinicWsOrigin || ''}`;

  if (!window.clinicWS?.start) {
    console.warn('[clinic] clinicWS bridge missing. Check preload exposure.');
  }

  clinicMemberSeq = config.memberSeq || null;
  clinicDeviceSerial = config.deviceSerial || '';
  clinicApiOrigin = config.clinicApiOrigin || '';
  clinicWsOrigin = config.clinicWsOrigin || '';

  if (!shouldEnable) {
    clinicEnabled = false;
    clinicConfigKey = '';
    stopClinicSocket();
    resetClinicUi(
      config.waitingInfo === 'Y'
        ? '연결 불가: CLINIC_API_ORIGIN/CLINIC_WS_ORIGIN 설정을 확인하세요.'
        : '대기 현황 비활성화됨'
    );
    return;
  }

  if (clinicEnabled && clinicConfigKey === configKey) {
    return;
  }

  clinicEnabled = true;
  clinicConfigKey = configKey;
  clinicPanelSide = (config.screenDirection || 'L').toUpperCase() === 'R' ? 'R' : 'L';
  applyClinicPanelSide();
  resetClinicUi('대기열 불러오는 중...');
  fetchClinicList().finally(() => {
    startClinicSocket();
  });
}

function restartClinicRealtime() {
  if (!clinicEnabled) return;
  stopClinicSocket();
  fetchClinicList().finally(() => {
    startClinicSocket();
  });
}


let clinicAlertTimer = null;
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
    videoMutedByAlert = true;
    videoEl.muted = true;
  }

  await Promise.all([
    showClinicAlert(alert.name, alert.seq, { durationMs: duration, clinicName: alert.clinicName }),
    playClinicAlertSoundAndTts(text),
  ]);

  if (shouldMute && videoMutedByAlert && videoEl) {
    videoEl.muted = false;
    videoMutedByAlert = false;
  }

  clinicAlertProcessing = false;
  if (clinicAlertQueue.length) processClinicAlertQueue();
}
function clearImageTimer() {
  if (imageTimer) {
    clearTimeout(imageTimer);
    imageTimer = null;
  }
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
  // "진료실 2" / "2번 진료실" / "진료실2" 모두 대응
  const match = label.match(/(\d+)/);
  if (!match) return label;

  const num = match[1];
  const kor = numberToKorean(num);

  // 👉 핵심: "이번"이 아니라 "이 번"
  return label
    .replace(`${num}번`, `${kor} 번`)
    .replace(num, kor);
}

function showError(message) {
  if (!errorOverlay) return;
  const msgEl = errorOverlay.querySelector('.error-message');
  if (msgEl) msgEl.textContent = message || '네트워크 오류가 발생했습니다. 잠시 후 다시 시도합니다.';
  errorOverlay.classList.add('visible');
  if (statusOverlay) statusOverlay.style.display = 'none'; // 로고 오버레이 감춤
  overlayLocked = false;
  errorState = true;
  startOnlineCheck();
}

function hideError() {
  if (!errorOverlay) return;
  errorOverlay.classList.remove('visible');
  errorState = false;
  stopOnlineCheck();
}

function startOnlineCheck() {
  if (onlineCheckTimer) return;
  onlineCheckStarted = true;
  // network monitor started
  onlineCheckTimer = setInterval(() => {
    // network recheck interval tick
    if (navigator.onLine) {
      // online detected -> attempt recovery
      attemptRecovery();
    }
  }, 5000);
}

function stopOnlineCheck() {
  if (onlineCheckTimer) {
    clearInterval(onlineCheckTimer);
    onlineCheckTimer = null;
    // stop network monitor
  }
}

async function playNext() {
  const next = currentIndex + 1;
  if (next < playlist.length) {
    playIndex(next);
  } else {
    await loadPlaylist({ fromCycle: true });
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

function playIndex(idx) {
  const item = playlist[idx];
  if (!item) return;

  resetMedia(item.type);

  if (!item.localFile && !item.streamUrl) {
    log(`Playback unavailable: ${item.url || 'unknown'} (download failed?)`);
    return;
  }

  currentIndex = idx;
  renderPlaylist();

  const title = item.title || item.id || item.url;

  if (item.type === 'image') {
    imageEl.style.display = 'block';
    imageEl.src = item.localFile || item.streamUrl;

    const durationMs = (item.durationSeconds || 5) * 1000;
    imageTimer = setTimeout(() => { playNext().catch(() => {}); }, durationMs);
    log(`Image display start (${(durationMs / 1000).toFixed(1)}s): ${title}`);
    return;
  }

  // Video/HLS
  videoEl.style.display = 'block';
  videoEl.style.objectFit = 'contain';
  imageEl.style.objectFit = 'contain';
  videoEl.volume = 1;
  videoEl.muted = !!videoMutedByAlert;

  if (item.type === 'hls') {
    if (window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls();
      hlsInstance.loadSource(item.streamUrl);
      hlsInstance.attachMedia(videoEl);
      videoEl.autoplay = true;
      hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
        log(`HLS manifest loaded: ${title}`);
        videoEl.play().catch((err) => log(`Playback error (HLS): ${err.message}`));
      });
      hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
        const code = data?.response?.code;
        const url = data?.networkDetails?.responseURL || item.streamUrl;
        log(`HLS error [${data.type}/${data.details}] code=${code ?? '?'} url=${url} ${data.reason || ''}`);
        if (data.fatal) {
          log('HLS fatal error, skipping to next content');
          destroyHls();
          playNext();
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = item.streamUrl;
      videoEl.play().catch((err) => log(`Playback error (HLS native): ${err.message}`));
    } else {
      log('HLS playback not supported.');
      playNext();
    }
    log(`HLS streaming start: ${title}`);
    return;
  }

  // Standard video
  videoEl.autoplay = true;
  videoEl.muted = !!videoMutedByAlert;
  videoEl.src = item.localFile || item.streamUrl;
  videoEl.play().catch((err) => log(`Playback error: ${err.message}`));
  log(`Video playback start: ${title}`);
}

async function loadPlaylist({ fromCycle = false, fromRecovery = false } = {}) {
  if (playlistLoading) return;
  playlistLoading = true;
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
      overlayLocked = false;
      if (statusOverlay) statusOverlay.style.display = 'none';
    } else {
      overlayLocked = true;
      if (statusOverlay) {
        statusOverlay.style.display = 'flex'; // show logo overlay
      }
    }
    // brief delay while logo shows
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await window.mediaAPI.preparePlaylist();

    if (Array.isArray(response)) {
      playlist = response;
      noticeList = [];
      noticeIndex = 0;
    } else {
      playlist = response.playlist || [];
      nextMemberSeq = response.memberSeq ?? null;
      nextDeviceSerial = response.deviceSerial ?? '';
      nextClinicApiOrigin = response.clinicApiOrigin || '';
      nextClinicWsOrigin = response.clinicWsOrigin || '';
      nextLandingUrl = response.landingUrl || '';
      const nextWaitingInfo =
        typeof response.waitingInfo !== 'undefined' && response.waitingInfo !== null
          ? response.waitingInfo
          : waitingInfo;
      waitingInfo = nextWaitingInfo;
      noticeList = response.noticeList || [];
      noticeIndex = 0;
    }

    if (nextLandingUrl) {
      landingUrl = nextLandingUrl;
      landingLoaded = false;
      if (landingFrame) landingFrame.src = 'about:blank';
    }

    if (!nextDeviceSerial) {
      overlayLocked = false;
      if (statusOverlay) statusOverlay.style.display = 'none';
      if (landingMessage) {
        landingMessage.textContent =
          '기기 시리얼이 설정되지 않았습니다. 컨텍스트 메뉴(우클릭) → 관리자 설정에서 시리얼을 입력해 주세요.';
      }
      showLandingOverlay(true);
      playlist = [];
      noticeList = [];
      renderPlaylist();
      applyLayout('N');
      resetClinicUi('기기 시리얼 설정 후 콘텐츠가 표시됩니다.');
      stopClinicSocket();
      return;
    }

    showLandingOverlay(false);
    applyLayout(waitingInfo);
    updateWeatherPanel();
    setupClinicRealtime({
      waitingInfo,
      memberSeq: nextMemberSeq,
      deviceSerial: nextDeviceSerial,
      clinicApiOrigin: nextClinicApiOrigin,
      clinicWsOrigin: nextClinicWsOrigin,
    });

    if (waitingInfo !== 'N') {
      if (noticeList.length) renderNotice(true);
    } else if (noticeBar) {
      noticeBar.style.display = 'none';
    }

    currentIndex = 0;
    renderPlaylist();

    const firstPlayable = playlist.findIndex((item) => item.localFile || item.streamUrl);
    if (firstPlayable >= 0) {
      if (overlayLocked) {
        if (overlayTimer) clearTimeout(overlayTimer);
        overlayTimer = setTimeout(() => {
          overlayLocked = false;
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
    overlayLocked = false;
    if (statusOverlay) statusOverlay.style.display = 'none'; // hide logo
    log(`Playlist load failed: ${err.message}`);
    showError('Failed to load media due to configuration or network issue. Retrying shortly.');
    retryTimer = setTimeout(() => {
      attemptRecovery();
    }, 5000);
    startOnlineCheck();
  } finally {
    playlistLoading = false;
    // if playback started, hide logo after 3s
    if (statusOverlay && playlist.length && overlayLocked) {
      setTimeout(() => {
        overlayLocked = false;
        statusOverlay.style.display = 'none';
      }, 1000);
    }
  }
}

window.addEventListener('online', () => {
  if (errorState) {
    // window.online detected, attempting recovery
    attemptRecovery();
  } else {
    hideError();
    loadPlaylist({ fromCycle: true }).catch(() => {});
  }
  restartClinicRealtime();
});

window.addEventListener('offline', () => {
  // window.offline detected
  startOnlineCheck();
  if (clinicEnabled) {
    stopClinicSocket();
  }
});

function attemptRecovery() {
  if (recovering) return;
  recovering = true;
  hideError();
  loadPlaylist({ fromCycle: true, fromRecovery: true })
    .catch(() => {})
    .finally(() => {
      recovering = false;
    });
}

  videoEl.addEventListener('ended', () => { playNext().catch(() => {}); });
videoEl.addEventListener('waiting', () => log('Buffering...'));
videoEl.addEventListener('stalled', () => log('Stream stalled'));
videoEl.addEventListener('error', () => {
  const err = videoEl.error;
  if (err) log(`Video error: ${err.message || err.code}`);
});

// 클릭/더블클릭/키입력으로 조작 방지
videoEl.addEventListener('click', (e) => e.preventDefault());
videoEl.addEventListener('dblclick', (e) => e.preventDefault());
videoEl.addEventListener('keydown', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => {
  const isMoveHandle = moveHandle && moveHandle.contains(e.target);
  e.preventDefault();
  if (isMoveHandle) {
    e.stopPropagation(); // 이동 버튼에서는 기본/커스텀 메뉴 모두 차단
    return;
  }
  if (window.mediaAPI?.showContextMenu) window.mediaAPI.showContextMenu();
}, { capture: true });

window.addEventListener('DOMContentLoaded', () => {
  setupDownloadProgressListener();
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

window.addEventListener('beforeunload', () => {
  if (typeof downloadProgressUnsub === 'function') {
    downloadProgressUnsub();
    downloadProgressUnsub = null;
  }
});

function renderNotice(shouldShow) {
  if (!noticeBar || !noticeText || !noticeSpan) return;
  if (!shouldShow || !noticeList.length) {
    noticeBar.style.display = shouldShow ? 'flex' : 'none';
    return;
  }

  const sorted = [...noticeList].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const item = sorted[noticeIndex % sorted.length];
  const text = item.content || '';
  noticeSpan.textContent = text;

  requestAnimationFrame(() => {
    const barWidth = noticeBar.clientWidth || window.innerWidth || 1920;
    const textWidth = noticeSpan.offsetWidth || text.length * 20;
    const totalDistance = barWidth + textWidth; // 오른쪽 밖 -> 왼쪽 밖
    const speed = 140; // px/sec
    let duration = totalDistance / speed;
    duration = Math.min(40, Math.max(8, duration));
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
      noticeIndex = (noticeIndex + 1) % sorted.length;
      renderNotice(true);
    };
  });
}

async function loadNotices() {
  try {
    const res = await window.mediaAPI.fetchNotices();
    waitingInfo = res.waitingInfo || waitingInfo;
    noticeList = res.noticeList || [];
    noticeIndex = 0;
    applyLayout(waitingInfo);
    setupClinicRealtime({
      waitingInfo,
      memberSeq: clinicMemberSeq,
      deviceSerial: clinicDeviceSerial,
      clinicApiOrigin,
      clinicWsOrigin,
    });
    if (waitingInfo !== 'N' && noticeList.length) {
      renderNotice(true);
    }
  } catch (err) {
    log(`Notice load error: ${err.message}`);
  } finally {
    // keep render loop even if notice fetch fails
  }
}
function isFullscreenLike() {
  if (document.fullscreenElement) return true;
  const sw = window.screen?.width || 0;
  const sh = window.screen?.height || 0;
  return window.innerWidth >= sw && window.innerHeight >= sh - 1;
}

function setupMoveHandle() {
  if (!moveHandle || !playerEl) return;
  // 기존 showHandle는 그대로 두되, 전체화면이면 return
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

  let dragging = false;
  moveHandle.style.cursor = 'grab';

  // 좌클릭 드래그 시에는 항상 보이게 유지 + grabbing 커서 표시
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

  // 여기서 전체화면 감지 시 display 토글
  const updateHandleVisibility = () => {
    if (isFullscreenLike()) {
      moveHandle.classList.remove('visible');
      moveHandle.classList.remove('dragging');
      moveHandle.style.display = 'none';   // ← 여기서 숨김
      moveHandle.style.removeProperty('cursor');
      document.body.style.removeProperty('cursor');
    } else {
      moveHandle.style.display = 'flex';    // ← 전체화면이 아니면 다시 보이게
    }
  };
  document.addEventListener('fullscreenchange', updateHandleVisibility);
  window.addEventListener('resize', updateHandleVisibility);
  updateHandleVisibility();
}

function updateWeatherPanel() {
  if (!weatherPanel) return;
  const show = waitingInfo === 'B';
  weatherPanel.style.display = show ? 'flex' : 'none';
  if (show) {
    if (weatherMeta) weatherMeta.textContent = '정보 준비중';
    if (weatherTitle) weatherTitle.textContent = '-';
    if (weatherContent) weatherContent.textContent = '날씨 정보를 불러오는 중입니다...';
    if (lastWeatherInfo) {
      renderWeather(lastWeatherInfo);
    }
    if (!weatherReady || shouldFetchWeatherNow()) {
      startWeather();
    }
  } else {
    if (weatherTimer) clearInterval(weatherTimer);
    weatherReady = false;
  }
}

function startWeather() {
  if (!shouldFetchWeatherNow()) return;
  useConfigWeather();

  if (!navigator.geolocation) {
    if (weatherContent) weatherContent.textContent = '위치 정보를 설정하거나 허용해 주세요.';
    return;
  }

  const onSuccess = (pos) => {
    fetchWeather(pos.coords.latitude, pos.coords.longitude);
    if (weatherTimer) clearInterval(weatherTimer);
  };
  const onError = (err) => {
    useConfigWeather(`위치 접근 불가: ${err.message}`);
    fallbackIpLocation();
  };
  navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy: true, timeout: 5000 });
}

function shouldFetchWeatherNow() {
  if (!weatherReady) return true;
  if (!lastWeatherFetch) return true;
  const now = new Date();
  const last = new Date(lastWeatherFetch);
  // 다른 시(hour)로 넘어갔을 때만 재조회
  if (now.getHours() !== last.getHours() || now.getDate() !== last.getDate()) {
    return true;
  }
  return false;
}

function startWeatherClock() {
  if (weatherClockTimer) clearInterval(weatherClockTimer);
  if (weatherClockTimeout) clearTimeout(weatherClockTimeout);

  const tick = () => {
    const now = new Date();
    if (weatherTitle) {
      const dateStr = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
      weatherTitle.textContent = dateStr;
    }
    if (weatherMeta) {
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      weatherMeta.textContent = `${hh}:${mm}`;
    }
  };

  const scheduleNext = () => {
    const now = new Date();
    const msIntoMinute = now.getSeconds() * 1000 + now.getMilliseconds();
    const delay = Math.max(500, 60000 - msIntoMinute + 5); // 살짝 앞당겨 오차 최소화
    weatherClockTimeout = setTimeout(() => {
      tick();
      scheduleNext();
    }, delay);
  };

  tick(); // 즉시 갱신
  scheduleNext(); // 다음 분 경계 정렬
}

function fetchWeather(lat, lon) {
  if (!lat || !lon) return;
  const url = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst';
  const serviceKey = 'F%2FDjBcEeX6B09LKxUiggUcj%2Bf5lh0UrK3%2BcnLVy04p7YzVif6OYu7nAKv4M5KTbn%2BttZ6a0XfLRWAuONt4hlfQ%3D%3D';

  const { nx, ny } = mapToGrid(lat, lon);
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  let dateYYYYMMDD = `${now.getFullYear()}${month}${day}`;
  let baseHour = now.getHours();
  if (now.getMinutes() < 31) {
    baseHour -= 1;
    if (baseHour < 0) {
      // 이전 날짜 23시 예보 사용
      const prev = new Date(now.getTime() - 3600 * 1000);
      baseHour = prev.getHours();
      const pMonth = `${prev.getMonth() + 1}`.padStart(2, '0');
      const pDay = `${prev.getDate()}`.padStart(2, '0');
      dateYYYYMMDD = `${prev.getFullYear()}${pMonth}${pDay}`;
    }
  }
  const baseMin = now.getMinutes() < 31 ? '30' : '00';
  const baseHH = `${baseHour}`.padStart(2, '0');
  const queryUrl = `${url}?serviceKey=${serviceKey}&pageNo=1&numOfRows=60&dataType=json&base_date=${dateYYYYMMDD}&base_time=${baseHH}${baseMin}&nx=${nx}&ny=${ny}`;

  fetch(queryUrl)
    .then(async (res) => {
      if (!res.ok) {
        const msg = `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('API 응답을 해석할 수 없습니다');
      }
      const items = data?.response?.body?.items?.item || [];
      if (!items.length) {
        if (weatherContent) weatherContent.textContent = '날씨 정보를 불러오지 못했습니다.';
        return;
      }

      const sorted = items
        .map((it) => ({ ...it, fcstTimeStr: String(it.fcstTime).padStart(4, '0') }))
        .sort((a, b) => a.fcstTimeStr.localeCompare(b.fcstTimeStr));

      const currentTimeStr = `${now.getHours()}`.padStart(2, '0') + '00';
      const candidateTime =
        sorted.find((it) => it.fcstTimeStr >= currentTimeStr)?.fcstTimeStr ||
        sorted[sorted.length - 1].fcstTimeStr;

      const info = { T1H: null, REH: null, WSD: null, SKY: null, PTY: null };
      for (const it of sorted) {
        if (it.fcstTimeStr !== candidateTime) continue;
        if (Object.prototype.hasOwnProperty.call(info, it.category)) {
          info[it.category] = it.fcstValue;
        }
      }
      renderWeather(info);
      lastWeatherFetch = Date.now();
      weatherReady = true;
    })
    .catch((err) => {
      if (weatherContent) weatherContent.textContent = `날씨 불러오기 실패: ${err.message}`;
    });
}

function useConfigWeather(fallbackMsg) {
  if (weatherContent && fallbackMsg) weatherContent.textContent = fallbackMsg;
  if (cachedWeatherConfig) {
    const { lat, lon } = cachedWeatherConfig;
    if (lat && lon) {
      fetchWeather(lat, lon);
      return;
    }
  }
  window.mediaAPI
    .getWeatherConfig()
    .then((cfg) => {
      cachedWeatherConfig = cfg;
      if (cfg?.lat && cfg?.lon) {
        fetchWeather(cfg.lat, cfg.lon);
      } else if (weatherContent) {
        weatherContent.textContent = fallbackMsg || '위치 정보를 설정하거나 허용해 주세요.';
      }
    })
    .catch(() => {
      if (weatherContent) weatherContent.textContent = fallbackMsg || '위치 정보를 설정하거나 허용해 주세요.';
    });
}

function fallbackIpLocation() {
  fetch('https://ipapi.co/json/')
    .then((res) => res.json())
    .then((data) => {
      if (data && data.latitude && data.longitude) {
        fetchWeather(data.latitude, data.longitude);
      }
    })
    .catch(() => {});
}

function mapToGrid(lat, lon) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 210 / GRID;
  const YO = 675 / GRID;
  const DEGRAD = Math.PI / 180.0;

  let re = RE / GRID;
  let slat1 = SLAT1 * DEGRAD;
  let slat2 = SLAT2 * DEGRAD;
  let olon = OLON * DEGRAD;
  let olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const x = Math.floor(ra * Math.sin(theta) + XO + 1.5);
  const y = Math.floor(ro - ra * Math.cos(theta) + YO + 1.5);
  return { nx: x, ny: y };
}

function renderWeather(info) {
  if (!weatherContent) return;
  const temp = info.T1H !== null ? `${info.T1H}℃` : '-';
  const hum = info.REH !== null ? `${info.REH}%` : '-';
  const wind = info.WSD !== null ? `${info.WSD} m/s` : '-';
  const pty = info.PTY;
  const sky = info.SKY;
  let icon = '☀️';
  if (pty === '1' || pty === '5') {
    icon = '🌧️';
  } else if (pty === '3' || pty === '7') {
    icon = '❄️';
  } else if (sky === '3') {
    icon = '🌥️';
  } else if (sky === '4') {
    icon = '☁️';
  }

  weatherContent.innerHTML = `
    <div class="weather-icon">${icon}</div>
    <div class="weather-metrics">
      <div>기온: ${temp}</div>
      <div>습도: ${hum}</div>
      <div>풍속: ${wind}</div>
    </div>
  `;
  const now = new Date();
  if (weatherTitle) {
    const dateStr = now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
    weatherTitle.textContent = dateStr;
  }
  if (weatherMeta) {
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    weatherMeta.textContent = `${hh}:${mm}`;
  }
  lastWeatherInfo = info;
}

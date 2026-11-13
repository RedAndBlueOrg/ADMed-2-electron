'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const state = require('./state');

// 응답 없이 연결만 물린 경우(방화벽 DROP 등) undici 기본 headersTimeout(300초)까지 매달려
// 그동안 렌더러의 no-playable 자동 복구가 작동하지 못한다 → 10초로 끊고 상위 catch 에 맡긴다.
const FETCH_TIMEOUT_MS = 10000;

function getScenarioApiUrl() {
  const base = process.env.SCENARIO_API_URL || '';
  const deviceSerial = state.configIni.deviceSerial || '';
  if (!base) return '';
  if (!deviceSerial) return base;
  try {
    const u = new URL(base);
    u.searchParams.set('id', deviceSerial);
    return u.toString();
  } catch {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}id=${encodeURIComponent(deviceSerial)}`;
  }
}

function buildFileUrl(baseUrl, img, type) {
  if (!baseUrl) throw new Error('templateBaseUrl is not configured');
  const url = new URL(baseUrl);
  url.searchParams.set('img', img);
  const typeLower = (type || '').toLowerCase();
  const normalizedType = typeLower || 'jpg';
  url.searchParams.set('type', normalizedType);
  return url.toString();
}

async function fetchScenarioPlaylist() {
  const scenarioUrl = getScenarioApiUrl();
  const templateBaseUrl = process.env.TEMPLATE_BASE_URL || '';
  if (!scenarioUrl || !templateBaseUrl) {
    throw new Error(
      'scenario API URL (.env SCENARIO_API_URL + config.ini device_serial) and templateBaseUrl (.env TEMPLATE_BASE_URL) are required.'
    );
  }

  const res = await fetch(scenarioUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Scenario API request failed: ${res.status}`);
  const data = await res.json();
  // templates·mSeq 둘 다 없는 200 응답(점검 페이지 등)은 실패로 본다 → 저장된 시나리오로 폴백.
  // (templates 없이 mSeq 만 오는 대기현황 전용 기기 응답은 정상으로 둔다)
  if (!data || typeof data !== 'object' || (!Array.isArray(data.templates) && data.mSeq == null)) {
    throw new Error('Scenario API response is not a scenario');
  }
  return mapScenarioData(data, templateBaseUrl);
}

function mapScenarioData(data, templateBaseUrl) {
  const templates = Array.isArray(data.templates) ? data.templates : [];

  const mapped = templates
    .map((tpl, idx) => {
      const typeRaw = (tpl.type || '').toLowerCase();
      const sort = tpl.sort ?? idx;
      const time = Number(tpl.time) || undefined;
      const title = tpl.templateStorage?.title || tpl.img || `item-${idx}`;
      const img = tpl.img;
      if (!img || !typeRaw) return null;

      let mappedType = 'video';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(typeRaw)) mappedType = 'image';
      else if (typeRaw === 'm3u8') mappedType = 'hls-zip';
      else if (['mp4', 'mov'].includes(typeRaw)) mappedType = 'video';

      const url = buildFileUrl(templateBaseUrl, img, typeRaw);
      return {
        id: tpl.img || `item-${idx}`,
        title,
        type: mappedType,
        url,
        durationSeconds: mappedType === 'image' ? time : undefined,
        sort,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  return { playlist: mapped, waitingInfo: data.waitingInfo, memberSeq: data.mSeq?.seq ?? null, scenarioRaw: data };
}

async function getScenario() {
  return fetchScenarioPlaylist();
}

// --- 오프라인 폴백: 마지막으로 성공한 시나리오 응답(원본) + 공지 목록을 파일로 보관 ---
// 서버 점검·회선 단절 시 이 파일로 재생목록을 복원한다(캐시된 미디어만 재생).
let lastSavedJson = '';

function scenarioCachePath() {
  return path.join(app.getPath('userData'), 'scenario-cache.json');
}

function readScenarioCacheFile() {
  const saved = JSON.parse(fs.readFileSync(scenarioCachePath(), 'utf-8'));
  return saved?.deviceSerial === (state.configIni.deviceSerial || '') ? saved : null; // 다른 기기 것이면 무시
}

// 재생할 항목이 0개인 응답은 저장하지 않는다 — 점검 직전의 빈 응답이 저장본을 지우면
// 정작 서버가 내려간 동안 보여줄 것이 없어진다(cleanupCache 의 빈 keepPaths 가드와 같은 해석).
// noticeList 가 null(공지 조회 실패)이면 저장본의 공지를 유지한다.
function saveScenarioCache(scenario, noticeList) {
  if (!scenario.playlist.length) return;
  try {
    let notices = noticeList;
    if (notices === null) {
      try { notices = readScenarioCacheFile()?.noticeList || []; } catch { notices = []; }
    }
    const json = JSON.stringify({ deviceSerial: state.configIni.deviceSerial || '', scenario: scenario.scenarioRaw, noticeList: notices });
    if (json === lastSavedJson) return; // 사이클마다 같은 내용을 다시 쓰지 않는다
    const file = scenarioCachePath();
    fs.writeFileSync(`${file}.tmp`, json);
    // tmp 에 쓰다 끊기면 기존 파일이 남는다. rename 직후 전원 차단으로 파일이 깨져도 load 가 null 로 처리.
    fs.renameSync(`${file}.tmp`, file);
    lastSavedJson = json;
  } catch (err) {
    console.warn('scenario cache save failed:', err.message);
  }
}

// 저장된 시나리오를 getScenario() 와 같은 모양으로 복원. 없거나 다른 기기 것이면 null.
function loadScenarioCache() {
  try {
    const saved = readScenarioCacheFile();
    if (!Array.isArray(saved?.scenario?.templates)) return null;
    const scenario = mapScenarioData(saved.scenario, process.env.TEMPLATE_BASE_URL || '');
    return { ...scenario, noticeList: Array.isArray(saved.noticeList) ? saved.noticeList : [] };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('scenario cache load failed:', err.message);
    return null;
  }
}

function buildNoticeUrlFromScenario(apiUrl, memberId) {
  if (!apiUrl || !memberId) return null;
  try {
    const u = new URL(apiUrl);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}/dapi/clinic/notice/list?memberId=${memberId}`;
  } catch (_err) {
    return null;
  }
}

// 실패 시 null (진짜 0건인 [] 와 구분 — 저장본의 공지를 지우지 않기 위해). 호출자는 `?? []`.
async function fetchNoticeList(baseUrl, memberId) {
  if (!baseUrl || !memberId) return [];
  const url = buildNoticeUrlFromScenario(baseUrl, memberId);
  if (!url) return [];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Notice API request failed: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((n, idx) => ({
        id: n.id || `notice-${idx}`,
        content: n.content || '',
        sort: n.sort ?? idx,
      }))
      .filter((n) => n.content)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  } catch (err) {
    console.warn('Notice fetch failed:', err.message);
    return null;
  }
}

async function fetchNoticesFast() {
  try {
    const scenario = await getScenario();
    const noticeList = (await fetchNoticeList(getScenarioApiUrl(), scenario.memberSeq)) ?? [];
    return { noticeList, waitingInfo: scenario.waitingInfo };
  } catch (err) {
    console.warn('notice fetch failed:', err.message);
    return { noticeList: [], waitingInfo: null, error: err.message };
  }
}

module.exports = {
  getScenarioApiUrl,
  buildFileUrl,
  fetchScenarioPlaylist,
  getScenario,
  saveScenarioCache,
  loadScenarioCache,
  buildNoticeUrlFromScenario,
  fetchNoticeList,
  fetchNoticesFast,
};

'use strict';

const state = require('./state');

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
  const normalizedType = ['jpg', 'jpeg', 'png'].includes(typeLower) ? 'jpg' : typeLower || 'jpg';
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

  const res = await fetch(scenarioUrl);
  if (!res.ok) throw new Error(`Scenario API request failed: ${res.status}`);
  const data = await res.json();
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

function buildNoticeUrlFromScenario(apiUrl, memberId) {
  if (!apiUrl || !memberId) return null;
  try {
    const u = new URL(apiUrl);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}/dapi/clinic/notice/list?memberId=${memberId}`;
  } catch (_err) {
    return null;
  }
}

async function fetchNoticeList(baseUrl, memberId) {
  if (!baseUrl || !memberId) return [];
  const url = buildNoticeUrlFromScenario(baseUrl, memberId);
  if (!url) return [];
  try {
    const res = await fetch(url);
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
    return [];
  }
}

async function fetchNoticesFast() {
  try {
    const scenario = await getScenario();
    const noticeList = await fetchNoticeList(getScenarioApiUrl(), scenario.memberSeq);
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
  buildNoticeUrlFromScenario,
  fetchNoticeList,
  fetchNoticesFast,
};

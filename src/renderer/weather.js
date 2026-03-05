import { weatherPanel, weatherTitle, weatherMeta, weatherContent } from './dom.js';
import state from './state.js';

let cachedWeatherConfig = null;
let weatherReady = false;
let weatherTimer = null;
let lastWeatherFetch = null;
let lastWeatherInfo = null;
let weatherClockTimer = null;
let weatherClockTimeout = null;

// Seed config from preload (runs at module evaluation)
try {
  if (window.weatherConfig && typeof window.weatherConfig.get === 'function') {
    const cfg = window.weatherConfig.get();
    cachedWeatherConfig = {
      lat: cfg?.lat || null,
      lon: cfg?.lon || null,
      url: cfg?.weatherServiceUrl || null,
      key: cfg?.weatherServiceKey || null,
    };
  }
} catch (err) {
  console.warn('[weather] preload config seed failed:', err.message);
}

function shouldFetchWeatherNow() {
  if (!weatherReady) return true;
  if (!lastWeatherFetch) return true;
  const now = new Date();
  const last = new Date(lastWeatherFetch);
  if (now.getHours() !== last.getHours() || now.getDate() !== last.getDate()) {
    return true;
  }
  return false;
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

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

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

function fetchWeather(lat, lon) {
  if (!lat || !lon) return;
  const url =
    (cachedWeatherConfig && cachedWeatherConfig.url) ||
    'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst';
  const serviceKey = cachedWeatherConfig && cachedWeatherConfig.key;
  if (!serviceKey) {
    console.warn('[weather] WEATHER_SERVICE_KEY is missing');
    if (weatherContent) weatherContent.textContent = '날씨 정보를 불러올 수 없습니다.';
    return;
  }
  const { nx, ny } = mapToGrid(lat, lon);
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  let dateYYYYMMDD = `${now.getFullYear()}${month}${day}`;
  let baseHour = now.getHours();
  if (now.getMinutes() < 31) {
    baseHour -= 1;
    if (baseHour < 0) {
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
        throw new Error(`HTTP ${res.status}`);
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
      cachedWeatherConfig = {
        lat: cfg?.lat || null,
        lon: cfg?.lon || null,
        url: cfg?.weatherServiceUrl || null,
        key: cfg?.weatherServiceKey || null,
      };
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

export function updateWeatherPanel() {
  if (!weatherPanel) return;
  const show = state.waitingInfo === 'B';
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

export function startWeatherClock() {
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
    const delay = Math.max(500, 60000 - msIntoMinute + 5);
    weatherClockTimeout = setTimeout(() => {
      tick();
      scheduleNext();
    }, delay);
  };

  tick();
  scheduleNext();
}

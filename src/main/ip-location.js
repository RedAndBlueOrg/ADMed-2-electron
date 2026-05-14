'use strict';

const https = require('https');

const PROVIDERS = [
  {
    host: 'ipinfo.io',
    path: '/json',
    pick: (d) => {
      if (!d || typeof d.loc !== 'string') return null;
      const [lat, lon] = d.loc.split(',').map(Number);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, label: [d.city, d.region].filter(Boolean).join(' ') } : null;
    },
  },
  {
    host: 'ipwho.is',
    path: '/',
    pick: (d) => {
      if (!d || d.success === false) return null;
      const lat = Number(d.latitude); const lon = Number(d.longitude);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, label: [d.city, d.region].filter(Boolean).join(' ') } : null;
    },
  },
  {
    host: 'freeipapi.com',
    path: '/api/json',
    pick: (d) => {
      if (!d) return null;
      const lat = Number(d.latitude); const lon = Number(d.longitude);
      return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, label: [d.cityName, d.regionName].filter(Boolean).join(' ') } : null;
    },
  },
];

function fetchJson({ host, path }, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { host, path, headers: { Accept: 'application/json', 'User-Agent': 'ADMed/electron' } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let buf = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => { buf += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(buf)); } catch (err) { reject(err); }
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function detectIpLocation() {
  for (const p of PROVIDERS) {
    try {
      const data = await fetchJson(p);
      const coords = p.pick(data);
      if (coords) {
        console.info(`[ip-location] via ${p.host}: ${coords.lat}, ${coords.lon} (${coords.label || '-'})`);
        return coords;
      }
      console.warn(`[ip-location] ${p.host} returned no usable coords`);
    } catch (err) {
      console.warn(`[ip-location] ${p.host} failed: ${err.message}`);
    }
  }
  return null;
}

module.exports = { detectIpLocation };

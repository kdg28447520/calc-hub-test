/**
 * 누빠 (누가빠름) — 현재 위치 역지오코딩 프록시 (SK TMAP)
 *
 * GPS 버튼으로 잡은 좌표를 "안양시 동안구 시민대로 230" 같은 도로명 주소로 바꿔 준다.
 * 브라우저에는 appKey가 없고, 여기서 환경변수로만 붙인다.
 *
 * TMAP 한도 방어
 *   - 1시간 인메모리 캐시: 좌표를 소수점 4자리(약 11m)로 정규화해 같은 자리면 다시 부르지 않는다.
 *     도로명 주소는 거의 바뀌지 않으므로 TTL 을 길게 둔다. 최대 200건 LRU.
 *   - IP당 분당 10건 제한(_guard.js).
 *   - 응답 헤더 X-Nuba-Cache: HIT | MISS
 *
 * 필요한 환경변수:
 *   TMAP_APP_KEY : SK Open API 앱키 (openapi.sk.com)
 *
 * 사용: /api/reverse?lat=37.39267&lng=126.95633
 * 응답: { "label": "내 위치 (안양시 동안구 시민대로 230)", "address": "안양시 동안구 시민대로 230" }
 *       주소를 못 찾으면 { "label": "내 위치" }
 */
const https = require('https');
const guard = require('./_guard');

const APP_KEY = process.env.TMAP_APP_KEY || process.env.TMAP_KEY || process.env.SK_APP_KEY;

const CACHE_TTL_MS = 60 * 60 * 1000;   // 1시간
const CACHE_MAX_ENTRIES = 200;
const UPSTREAM_TIMEOUT_MS = 6000;

function cacheStore() {
  if (!globalThis.__NUBA_REVERSE_CACHE__ || !(globalThis.__NUBA_REVERSE_CACHE__ instanceof Map)) {
    globalThis.__NUBA_REVERSE_CACHE__ = new Map();
  }
  return globalThis.__NUBA_REVERSE_CACHE__;
}

function cacheKey(lat, lng) {
  return `${Number(lat.toFixed(4))},${Number(lng.toFixed(4))}`;
}

function cacheGet(key) {
  const store = cacheStore();
  const entry = store.get(key);
  if (!entry) return null;
  if (!(entry.expires > Date.now())) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  store.set(key, entry);
  return entry;
}

function cachePut(key, payload) {
  const store = cacheStore();
  store.delete(key);
  store.set(key, { payload, storedAt: Date.now(), expires: Date.now() + CACHE_TTL_MS });
  while (store.size > CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v));
  return Number.isFinite(n) ? n : NaN;
}

function shortAddress(info) {
  if (!info) return '';
  const gu = String(info.gu_gun || '');
  const dong = String(info.eup_myun || info.adminDong || info.legalDong || '');
  const road = String(info.roadName || '');
  const bIdx = String(info.buildingIndex || '');
  if (road) return [gu, `${road}${bIdx ? ' ' + bIdx : ''}`].filter(Boolean).join(' ').trim();
  return [gu, dong].filter(Boolean).join(' ').trim();
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 앱인토스(토스 미니앱) 웹뷰처럼 다른 오리진에서도 호출할 수 있도록 CORS 를 허용한다.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Nuba-Cache, X-Nuba-Cache-Age, X-Nuba-Guard, Retry-After');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const q = req.query || {};
  const lat = num(q.lat);
  const lng = num(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat, lng 좌표가 필요합니다.', label: '내 위치' });
    return;
  }

  if (!APP_KEY) {
    res.status(200).json({ label: '내 위치', address: '' });
    return;
  }

  /* 반복 호출 방어 — IP당 분당 10건 */
  if (!guard.allow(req, res, 'reverse')) return;

  const key = cacheKey(lat, lng);
  const hit = cacheGet(key);
  if (hit) {
    res.setHeader('X-Nuba-Cache', 'HIT');
    res.setHeader('X-Nuba-Cache-Age', String(Math.max(0, Math.round((Date.now() - hit.storedAt) / 1000))));
    res.status(200).json(hit.payload);
    return;
  }
  res.setHeader('X-Nuba-Cache', 'MISS');

  const path = `/tmap/geo/reversegeocoding?version=1&lat=${lat}&lon=${lng}&coordType=WGS84GEO&addressType=A10`;

  const upstream = https.request({
    hostname: 'apis.openapi.sk.com',
    path,
    method: 'GET',
    headers: { appKey: APP_KEY, Accept: 'application/json' }
  }, (r) => {
    let data = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { data += c; });
    r.on('end', () => {
      if (r.statusCode !== 200) {
        res.status(200).json({ label: '내 위치', address: '' });
        return;
      }
      let addr = '';
      try {
        const j = JSON.parse(data);
        addr = shortAddress(j && j.addressInfo);
      } catch (e) { addr = ''; }
      const payload = addr
        ? { label: `내 위치 (${addr})`, address: addr }
        : { label: '내 위치', address: '' };
      cachePut(key, payload);            // 성공 응답(주소 유무 모두)만 저장
      res.status(200).json(payload);
    });
  });

  upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    upstream.destroy(new Error('timeout'));
  });

  upstream.on('error', () => {
    res.status(200).json({ label: '내 위치', address: '' });
  });

  upstream.end();
};

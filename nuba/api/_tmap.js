/**
 * 누빠 (누가빠름) — SK TMAP 길찾기 프록시
 *
 * 브라우저에는 appKey를 내려보내지 않는다. 이 서버리스 함수가 대신 호출한다.
 * 허용 좌표 4개만 받아서 TMAP 길찾기 경로로 그대로 넘긴다(다른 경로로는 못 씀).
 *
 * 5분 인메모리 캐시:
 *   같은 좌표(소수점 4자리 정규화) 요청이 5분(300초) 안에 다시 오면
 *   TMAP를 다시 부르지 않고 캐시된 200 응답(JSON 문자열)을 그대로 돌려준다.
 *   - HTTP 200 + 정상 형식(features 배열)만 캐싱한다. 429·4xx·5xx·타임아웃은 절대 캐싱하지 않는다.
 *   - Vercel 서버리스 인스턴스가 웜 상태일 때만 유효한 캐시다(인스턴스가 새로 뜨면 비어 있음).
 *   - 최대 300건, 넘치면 가장 오래 안 쓴 것부터 버린다(LRU).
 *   - 응답 헤더 X-Nuba-Cache: HIT | MISS 로 적중 여부를 확인할 수 있다.
 *
 * 카운터(_stats.js):
 *   요청이 올 때마다(캐시 HIT·MISS 모두) 기본 경로(평촌 아크로타워→강남역)인지 아닌지를
 *   default_route / custom_route 로 센다. 응답 헤더 X-Nuba-Route 로도 알려 준다.
 *
 * 필요한 환경변수:
 *   TMAP_APP_KEY : SK Open API 앱키 (openapi.sk.com)
 */
const https = require('https');
const stats = require('./_stats');

const APP_KEY = process.env.TMAP_APP_KEY || process.env.TMAP_KEY || process.env.SK_APP_KEY;

/* ---------- 5분 인메모리 캐시 (웜 인스턴스 공용) ---------- */
const CACHE_TTL_MS = 300 * 1000;      // 5분
const CACHE_MAX_ENTRIES = 300;        // 최대 300건

function cacheStore() {
  if (!globalThis.__NUBA_TMAP_CACHE__ || !(globalThis.__NUBA_TMAP_CACHE__ instanceof Map)) {
    globalThis.__NUBA_TMAP_CACHE__ = new Map();
  }
  return globalThis.__NUBA_TMAP_CACHE__;
}

// 좌표를 소수점 4자리(약 11m)로 정규화한 키 — 같은 출발/도착이면 같은 키
function cacheKey(startX, startY, endX, endY) {
  const f = (n) => Number(n.toFixed(4));
  return [f(startX), f(startY), f(endX), f(endY)].join(',');
}

function cacheGet(key) {
  const store = cacheStore();
  const entry = store.get(key);
  if (!entry) return null;
  if (!(entry.expires > Date.now())) {
    store.delete(key);
    return null;
  }
  // LRU: 방금 쓴 항목을 맨 뒤로 옮긴다.
  store.delete(key);
  store.set(key, entry);
  return entry;
}

function cachePut(key, status, body) {
  if (status !== 200 || typeof body !== 'string' || body.length === 0) return;
  let ok = false;
  try {
    const parsed = JSON.parse(body);
    ok = !!parsed && Array.isArray(parsed.features) && parsed.features.length > 0;
  } catch (e) {
    ok = false;
  }
  if (!ok) return;   // 정상 경로 응답만 캐싱(에러·429·한도초과 방지)
  const store = cacheStore();
  store.delete(key);
  store.set(key, { status: 200, body, storedAt: Date.now(), expires: Date.now() + CACHE_TTL_MS });
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

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 앱인토스(토스 미니앱) 웹뷰처럼 다른 오리진에서도 호출할 수 있도록 CORS 를 허용한다.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Nuba-Cache, X-Nuba-Cache-Age, X-Nuba-Route');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }
  if (!APP_KEY) {
    res.status(503).json({ error: 'TMAP_APP_KEY 환경변수가 설정되지 않았습니다.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  body = body || {};

  const startX = num(body.startX), startY = num(body.startY);
  const endX = num(body.endX), endY = num(body.endY);
  if (![startX, startY, endX, endY].every(Number.isFinite)) {
    res.status(400).json({ error: 'startX, startY, endX, endY 좌표가 필요합니다.' });
    return;
  }

  const key = cacheKey(startX, startY, endX, endY);

  /* 카운터 — 캐시 HIT·MISS 어느 쪽이든 요청 1건으로 센다 */
  const hit = cacheGet(key);
  const isDefault = stats.recordRoute({
    api: 'tmap',
    startX: startX, startY: startY, endX: endX, endY: endY,
    cache: hit ? 'hit' : 'miss'
  });
  res.setHeader('X-Nuba-Route', isDefault ? 'default_route' : 'custom_route');

  /* 캐시 적중 — 업스트림 호출 없이 즉시 반환 */
  if (hit) {
    res.setHeader('X-Nuba-Cache', 'HIT');
    res.setHeader('X-Nuba-Cache-Age', String(Math.max(0, Math.round((Date.now() - hit.storedAt) / 1000))));
    res.status(hit.status).send(hit.body);
    return;
  }
  res.setHeader('X-Nuba-Cache', 'MISS');

  const payload = JSON.stringify({
    startX: String(startX), startY: String(startY),
    endX: String(endX), endY: String(endY),
    reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
    searchOption: '0', trafficInfo: 'Y'
  });

  const upstream = https.request({
    hostname: 'apis.openapi.sk.com',
    path: '/tmap/routes?version=1',
    method: 'POST',
    headers: {
      appKey: APP_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      Accept: 'application/json'
    }
  }, (r) => {
    let data = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { data += c; });
    r.on('end', () => {
      const status = r.statusCode || 502;
      cachePut(key, status, data);      // 200 정상 응답만 저장
      if (status >= 400) stats.recordError('tmap', status);
      res.status(status).send(data);
    });
  });

  upstream.on('error', () => {
    stats.recordError('tmap', 502);
    res.status(502).json({ error: 'TMAP 연결 실패' });
  });

  upstream.write(payload);
  upstream.end();
};

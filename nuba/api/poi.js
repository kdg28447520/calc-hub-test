/**
 * 누빠 (누가빠름) — SK TMAP 장소(POI) 자동완성 프록시
 *
 * 출발지·도착지 검색창의 실시간 자동완성이 이 함수를 거친다.
 * 브라우저에는 appKey가 없고, 여기서 환경변수로만 붙인다.
 *
 * TMAP 한도 방어
 *   1) 10분 인메모리 캐시 — 같은 검색어(앞뒤 공백·대소문자·연속 공백 정리)는 10분간
 *      다시 부르지 않는다. 자동완성은 같은 검색어가 여러 사람에게 반복되므로 여기서 줄어드는 양이 가장 크다.
 *      HTTP 200 + 정상 형식(searchPoiInfo)만 캐싱한다. 429·4xx·5xx 는 캐싱하지 않는다.
 *   2) 동시 요청 합치기 — 같은 검색어를 동시에 여러 명이 쳐도 업스트림은 한 번만 부른다.
 *   3) IP당 분당 30건 제한 + 업스트림 429 뒤 60초 쿨다운 (_guard.js)
 *   4) 출처(Origin/Referer) 잠금 — 우리 웹앱·토스 미니앱에서 온 요청만 통과(_origin.js)
 *   - 응답 헤더 X-Nuba-Cache: HIT | MISS | SHARED
 *
 * 필요한 환경변수:
 *   TMAP_APP_KEY : SK Open API 앱키 (openapi.sk.com)
 *
 * 사용: /api/poi?keyword=수원역&count=8
 */
const https = require('https');
const guard = require('./_guard');

const APP_KEY = process.env.TMAP_APP_KEY || process.env.TMAP_KEY || process.env.SK_APP_KEY;

const CACHE_TTL_MS = 600 * 1000;      // 10분 — 장소 검색 결과는 잘 바뀌지 않는다
const CACHE_MAX_ENTRIES = 500;
const UPSTREAM_TIMEOUT_MS = 9000;

function cacheStore() {
  if (!globalThis.__NUBA_POI_CACHE__ || !(globalThis.__NUBA_POI_CACHE__ instanceof Map)) {
    globalThis.__NUBA_POI_CACHE__ = new Map();
  }
  return globalThis.__NUBA_POI_CACHE__;
}

function inflightStore() {
  if (!globalThis.__NUBA_POI_INFLIGHT__ || !(globalThis.__NUBA_POI_INFLIGHT__ instanceof Map)) {
    globalThis.__NUBA_POI_INFLIGHT__ = new Map();
  }
  return globalThis.__NUBA_POI_INFLIGHT__;
}

function normKeyword(keyword) {
  return String(keyword).replace(/\s+/g, ' ').trim().toLowerCase();
}

function cacheKey(keyword, count) {
  return `${normKeyword(keyword)}|${count}`;
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
  store.set(key, entry);          // LRU
  return entry;
}

function looksValid(body) {
  try {
    const parsed = JSON.parse(body);
    const info = parsed && parsed.searchPoiInfo;
    return !!info && typeof info === 'object';
  } catch (e) {
    return false;
  }
}

function cachePut(key, status, body) {
  if (status !== 200 || typeof body !== 'string' || body.length === 0) return;
  if (!looksValid(body)) return;
  const store = cacheStore();
  store.delete(key);
  store.set(key, { status: 200, body, storedAt: Date.now(), expires: Date.now() + CACHE_TTL_MS });
  while (store.size > CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  /* 출처 잠금(Origin/Referer) + CORS + IP 레이트리밋 — _guard.allow() 안에서 처리한다 */
  if (!guard.allow(req, res, 'poi')) return;

  if (!APP_KEY) {
    res.status(503).json({ error: 'TMAP_APP_KEY 환경변수가 설정되지 않았습니다.' });
    return;
  }

  const keyword = String((req.query && req.query.keyword) || '').trim().slice(0, 60);
  if (!keyword) {
    res.status(400).json({ error: 'keyword 파라미터가 필요합니다.' });
    return;
  }
  const count = Math.min(Math.max(parseInt((req.query && req.query.count) || '8', 10) || 8, 1), 20);

  const key = cacheKey(keyword, count);

  /* 캐시 적중 — 업스트림 호출 없이 즉시 반환 */
  const hit = cacheGet(key);
  if (hit) {
    res.setHeader('X-Nuba-Cache', 'HIT');
    res.setHeader('X-Nuba-Cache-Age', String(Math.max(0, Math.round((Date.now() - hit.storedAt) / 1000))));
    res.status(hit.status).send(hit.body);
    return;
  }
  res.setHeader('X-Nuba-Cache', 'MISS');

  /* 업스트림 한도 초과 직후면 잠깐 쉰다 */
  const cool = guard.cooldownLeft('poi');
  if (cool > 0) {
    guard.sendCooldown(res, 'poi', cool);
    return;
  }

  /* 같은 검색어를 이미 다른 요청이 조회 중이면 그 결과를 함께 받는다 */
  const inflight = inflightStore();
  const pending = inflight.get(key);
  if (pending) {
    res.setHeader('X-Nuba-Cache', 'SHARED');
    pending.then((r) => { res.status(r.status).send(r.body); })
      .catch(() => { res.status(502).json({ error: 'TMAP POI 연결 실패' }); });
    return;
  }

  const path = `/tmap/pois?version=1&searchKeyword=${encodeURIComponent(keyword)}&count=${count}`;

  let settle;
  const shared = new Promise((resolve) => { settle = resolve; });
  inflight.set(key, shared);

  const finish = (status, data) => {
    inflight.delete(key);
    cachePut(key, status, data);
    if (status === 429) guard.trip('poi', 60);
    settle({ status, body: data });
    res.status(status).send(data);
  };

  const upstream = https.request({
    hostname: 'apis.openapi.sk.com',
    path,
    method: 'GET',
    headers: { appKey: APP_KEY, Accept: 'application/json' }
  }, (r) => {
    let data = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { data += c; });
    r.on('end', () => finish(r.statusCode || 502, data));
  });

  upstream.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    upstream.destroy(new Error('timeout'));
  });

  upstream.on('error', () => {
    if (!inflight.has(key)) return;
    inflight.delete(key);
    settle({ status: 502, body: JSON.stringify({ error: 'TMAP POI 연결 실패' }) });
    res.status(502).json({ error: 'TMAP POI 연결 실패' });
  });

  upstream.end();
};

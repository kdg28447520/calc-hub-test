/**
 * 누빠 (누가빠름) — 카카오모빌리티 길찾기 프록시
 *
 * 카카오 REST 키(KakaoAK)는 브라우저로 내려보내지 않는다.
 * origin/destination 좌표만 받아 카카오모빌리티 길찾기로 넘긴다.
 *
 * 5분 인메모리 캐시:
 *   같은 출발/도착(소수점 4자리 정규화) + 같은 옵션이 5분(300초) 안에 다시 오면
 *   카카오모빌리티를 다시 부르지 않고 캐시된 200 응답을 그대로 돌려준다.
 *   - HTTP 200 + 정상 형식(routes 배열)만 캐싱. 429·4xx·5xx·타임아웃은 절대 캐싱하지 않는다.
 *   - 웜 서버리스 인스턴스에서만 유효하다. 최대 300건 LRU.
 *   - 응답 헤더 X-Nuba-Cache: HIT | MISS
 *
 * 필요한 환경변수:
 *   KAKAO_REST_KEY : 카카오 developers REST API 키 (카카오모빌리티 사용 설정)
 *
 * 사용: /api/kakao?origin=126.95633,37.39267&destination=127.028,37.4981&priority=RECOMMEND&car_type=1
 *
 * 카운터(_stats.js): 요청마다(캐시 HIT·MISS 모두) 기본 경로/커스텀 경로 구분을 센다. 헤더 X-Nuba-Route.
 */
const https = require('https');
const stats = require('./_stats');
const guard = require('./_guard');

const KEY = process.env.KAKAO_REST_KEY || process.env.KAKAO_KEY || process.env.KAKAO_APP_KEY;

const COORD = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

/* ---------- 5분 인메모리 캐시 (웜 인스턴스 공용) ---------- */
const CACHE_TTL_MS = 300 * 1000;
const CACHE_MAX_ENTRIES = 300;

function cacheStore() {
  if (!globalThis.__NUBA_KAKAO_CACHE__ || !(globalThis.__NUBA_KAKAO_CACHE__ instanceof Map)) {
    globalThis.__NUBA_KAKAO_CACHE__ = new Map();
  }
  return globalThis.__NUBA_KAKAO_CACHE__;
}

function normCoord(s) {
  const parts = String(s).split(',');
  const f = (v) => Number(Number(v).toFixed(4));
  return `${f(parts[0])},${f(parts[1])}`;
}

function cacheKey(origin, destination, priority, carType) {
  return [normCoord(origin), normCoord(destination), priority, carType].join('|');
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

function cachePut(key, status, body) {
  if (status !== 200 || typeof body !== 'string' || body.length === 0) return;
  let ok = false;
  try {
    const parsed = JSON.parse(body);
    ok = !!parsed && Array.isArray(parsed.routes) && parsed.routes.length > 0;
  } catch (e) {
    ok = false;
  }
  if (!ok) return;
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
  if (!guard.allow(req, res, 'kakao')) return;

  if (!KEY) {
    res.status(503).json({ error: 'KAKAO_REST_KEY 환경변수가 설정되지 않았습니다.' });
    return;
  }

  const q = req.query || {};
  const origin = String(q.origin || '').trim();
  const destination = String(q.destination || '').trim();

  if (!COORD.test(origin) || !COORD.test(destination)) {
    res.status(400).json({ error: 'origin, destination 은 "경도,위도" 형식이어야 합니다.' });
    return;
  }

  const priority = ['RECOMMEND', 'TIME', 'DISTANCE'].includes(String(q.priority)) ? String(q.priority) : 'RECOMMEND';
  const carType = Math.min(Math.max(parseInt(q.car_type || '1', 10) || 1, 1), 7);

  const key = cacheKey(origin, destination, priority, carType);

  /* 카운터 — 캐시 HIT·MISS 어느 쪽이든 요청 1건으로 센다 */
  const hit = cacheGet(key);
  const o = origin.split(',');
  const d = destination.split(',');
  const isDefault = stats.recordRoute({
    api: 'kakao',
    startX: o[0], startY: o[1], endX: d[0], endY: d[1],
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

  const path = `/v1/directions?origin=${origin}&destination=${destination}` +
    `&priority=${priority}&car_type=${carType}`;

  const upstream = https.request({
    hostname: 'apis-navi.kakaomobility.com',
    path,
    method: 'GET',
    headers: { Authorization: `KakaoAK ${KEY}`, Accept: 'application/json' }
  }, (r) => {
    let data = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { data += c; });
    r.on('end', () => {
      const status = r.statusCode || 502;
      cachePut(key, status, data);      // 200 정상 응답만 저장
      if (status === 429) guard.trip('kakao', 60);
      if (status >= 400) stats.recordError('kakao', status);
      res.status(status).send(data);
    });
  });

  upstream.on('error', () => {
    stats.recordError('kakao', 502);
    res.status(502).json({ error: '카카오모빌리티 연결 실패' });
  });

  upstream.end();
};

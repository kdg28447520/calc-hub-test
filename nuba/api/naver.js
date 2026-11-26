/**
 * 누빠 (누가빠름) — 네이버 Directions 5 프록시
 *
 * 네이버 클라우드 Maps API는 비밀 키(X-NCP-APIGW-API-KEY)를 헤더로 요구하고
 * 브라우저 CORS를 허용하지 않는다. 그래서 이 서버리스 함수가 대신 호출하고
 * 브라우저에는 결과 JSON만 돌려준다. 비밀 키는 브라우저로 내려가지 않는다.
 *
 * 5분 인메모리 캐시:
 *   같은 출발/도착(소수점 4자리 정규화) + 같은 옵션이 5분(300초) 안에 다시 오면
 *   네이버 Directions 5를 다시 부르지 않고 캐시된 200 응답을 그대로 돌려준다.
 *   - HTTP 200 + 정상 형식(code:0, route)만 캐싱. 429·4xx·5xx·타임아웃은 절대 캐싱하지 않는다.
 *   - 웜 서버리스 인스턴스에서만 유효하다. 최대 300건 LRU.
 *   - 응답 헤더 X-Nuba-Cache: HIT | MISS
 *
 * 필요한 환경변수:
 *   NAVER_KEY_ID      : 네이버 클라우드 Application Client ID
 *   NAVER_KEY_SECRET  : 네이버 클라우드 Application Client Secret
 */
const https = require('https');

const KEY_ID = process.env.NAVER_KEY_ID;
const KEY_SECRET = process.env.NAVER_KEY_SECRET;

/* ---------- 5분 인메모리 캐시 (웜 인스턴스 공용) ---------- */
const CACHE_TTL_MS = 300 * 1000;
const CACHE_MAX_ENTRIES = 300;

function cacheStore() {
  if (!globalThis.__NUBA_NAVER_CACHE__ || !(globalThis.__NUBA_NAVER_CACHE__ instanceof Map)) {
    globalThis.__NUBA_NAVER_CACHE__ = new Map();
  }
  return globalThis.__NUBA_NAVER_CACHE__;
}

function normCoord(s) {
  const parts = String(s).split(',');
  const f = (v) => { const n = Number(v); return Number.isFinite(n) ? String(Number(n.toFixed(4))) : String(v); };
  return `${f(parts[0])},${f(parts[1])}`;
}

function cacheKey(start, goal, option) {
  return [normCoord(start), normCoord(goal), option].join('|');
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
    ok = !!parsed && parsed.code === 0 && !!parsed.route;
  } catch (e) {
    ok = false;
  }
  if (!ok) return;   // 네이버는 200 + code!=0(에러)도 있으므로 정상 응답만 저장
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
  // 앱인토스(토스 미니앱) 웹뷰처럼 다른 오리진에서도 호출할 수 있도록 CORS 를 허용한다.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Nuba-Cache, X-Nuba-Cache-Age');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!KEY_ID || !KEY_SECRET) {
    res.status(503).json({ code: -1, message: 'NAVER_KEY_ID / NAVER_KEY_SECRET 환경변수가 설정되지 않았습니다.' });
    return;
  }

  const start = req.query.start;
  const goal = req.query.goal;
  const option = req.query.option || 'trafast';

  if (!start || !goal) {
    res.status(400).json({ code: -1, message: 'start, goal 파라미터가 필요합니다.' });
    return;
  }

  const key = cacheKey(start, goal, String(option));

  /* 캐시 적중 — 업스트림 호출 없이 즉시 반환 */
  const hit = cacheGet(key);
  if (hit) {
    res.setHeader('X-Nuba-Cache', 'HIT');
    res.setHeader('X-Nuba-Cache-Age', String(Math.max(0, Math.round((Date.now() - hit.storedAt) / 1000))));
    res.status(hit.status).send(hit.body);
    return;
  }
  res.setHeader('X-Nuba-Cache', 'MISS');

  const path = `/map-direction/v1/driving?start=${encodeURIComponent(start)}&goal=${encodeURIComponent(goal)}&option=${encodeURIComponent(option)}`;

  const upstream = https.request({
    hostname: 'maps.apigw.ntruss.com',
    path,
    method: 'GET',
    headers: {
      'x-ncp-apigw-api-key-id': KEY_ID,
      'x-ncp-apigw-api-key': KEY_SECRET
    }
  }, (r) => {
    let body = '';
    r.on('data', (c) => { body += c; });
    r.on('end', () => {
      const status = r.statusCode || 502;
      cachePut(key, status, body);      // 200 정상 응답만 저장
      res.status(status).send(body);
    });
  });

  upstream.on('error', () => {
    res.status(502).json({ code: -1, message: '네이버 API 연결 실패' });
  });
  upstream.end();
};

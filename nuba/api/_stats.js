/**
 * 누빠 (누가빠름) — 길찾기 요청 카운터 (공통 모듈)
 *
 * 무엇을 세는가
 *   - default_route : 앱을 열면 자동으로 나가는 '기본 경로' 요청
 *                     (출발 평촌 아크로타워 126.9563,37.3927 → 도착 강남역 127.0280,37.4981)
 *   - custom_route  : 사용자가 출발/도착을 직접 바꿔서 실제로 검색한 요청
 *   → 앱을 '열어만 본 사람'과 '실제로 길찾기를 써 본 사람'을 구분하기 위한 카운터다.
 *
 * 설계 메모
 *   - 이 카운터는 서버리스 인스턴스 메모리(globalThis)에만 남는다.
 *     Vercel 은 파일마다 별도 람다를 띄우므로, 카운터가 서로 보이려면 tmap/kakao/naver/stats 가
 *     같은 함수(gateway.js)로 들어와야 한다. 그래서 세 프록시는 gateway.js 를 통해서만 실행된다.
 *   - 인스턴스가 새로 뜨(콜드 스타트)면 0부터 다시 센다. 영구 보관은 Vercel Runtime Logs 의
 *     `{"tag":"nuba_route",...}` 한 줄 로그로 남긴다(로그에서 집계).
 *   - 좌표는 기본 경로와 비교할 때만 쓰고, 저장하는 custom 예시는 소수점 2자리(약 1km)로 줄인다.
 *     IP·User-Agent·키워드 등 개인을 특정할 수 있는 값은 저장하지 않는다.
 */
'use strict';

/* 기본 경로(앱 첫 화면) 좌표 — nuba/index.html 의 DEFAULTS 와 같다 */
const DEFAULT_START = { x: 126.9563, y: 37.3927 };   // 경기 안양시 동안구 시민대로 230 (평촌 아크로타워)
const DEFAULT_END = { x: 127.0280, y: 37.4981 };     // 서울 강남구 강남대로 396 (강남역)

/* 소수점 3~4자리 반올림 오차와 POI 좌표 흔들림을 함께 흡수하는 허용치 (0.0005도 ≈ 55m) */
const MATCH_TOL_DEG = 0.0005;

/* 최근 custom 검색 예시 보관 개수 */
const RECENT_MAX = 12;

const APIS = ['tmap', 'kakao', 'naver'];

function emptyApiBucket() {
  return { total: 0, default_route: 0, custom_route: 0, cache_hit: 0, cache_miss: 0, errors: 0 };
}

function state() {
  if (!globalThis.__NUBA_ROUTE_STATS__ || typeof globalThis.__NUBA_ROUTE_STATS__ !== 'object') {
    const byApi = {};
    APIS.forEach((k) => { byApi[k] = emptyApiBucket(); });
    globalThis.__NUBA_ROUTE_STATS__ = {
      instanceId: Math.random().toString(36).slice(2, 10),
      startedAt: Date.now(),
      byApi: byApi,
      recentCustom: [],
      lastRequestAt: null,
      lastErrorAt: null
    };
  }
  return globalThis.__NUBA_ROUTE_STATS__;
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v));
  return Number.isFinite(n) ? n : NaN;
}

function near(a, b) {
  const x = num(a), y = num(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= MATCH_TOL_DEG;
}

/* 기본 경로(평촌 아크로타워 → 강남역)인지 판별 */
function isDefaultRoute(startX, startY, endX, endY) {
  return near(startX, DEFAULT_START.x) && near(startY, DEFAULT_START.y) &&
         near(endX, DEFAULT_END.x) && near(endY, DEFAULT_END.y);
}

/* 좌표를 소수점 2자리(약 1km)로 줄여 저장 — 개인 위치 특정 방지 */
function round2(n) {
  const v = num(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * 길찾기 요청 1건 기록.
 * @returns {boolean} 기본 경로이면 true
 */
function recordRoute(input) {
  const s = state();
  const api = String((input && input.api) || 'unknown');
  const cache = input && input.cache === 'hit' ? 'hit' : 'miss';
  const isDefault = isDefaultRoute(input && input.startX, input && input.startY,
                                   input && input.endX, input && input.endY);
  const bucket = s.byApi[api] || (s.byApi[api] = emptyApiBucket());

  bucket.total += 1;
  bucket[isDefault ? 'default_route' : 'custom_route'] += 1;
  bucket[cache === 'hit' ? 'cache_hit' : 'cache_miss'] += 1;
  s.lastRequestAt = Date.now();

  if (!isDefault) {
    s.recentCustom.push({
      at: new Date().toISOString(),
      api: api,
      from: [round2(input.startX), round2(input.startY)],
      to: [round2(input.endX), round2(input.endY)]
    });
    if (s.recentCustom.length > RECENT_MAX) {
      s.recentCustom.splice(0, s.recentCustom.length - RECENT_MAX);
    }
  }

  // Vercel Runtime Logs 용 한 줄 로그 (영구 기록은 이 줄로 남는다)
  try {
    console.log(JSON.stringify({
      tag: 'nuba_route',
      api: api,
      kind: isDefault ? 'default_route' : 'custom_route',
      cache: cache,
      ts: Date.now()
    }));
  } catch (e) { /* 로그 실패가 응답을 막지 않게 */ }

  return isDefault;
}

/** 업스트림 오류(4xx·5xx·연결 실패) 1건 기록 */
function recordError(api, status) {
  const s = state();
  const bucket = s.byApi[String(api)] || (s.byApi[String(api)] = emptyApiBucket());
  bucket.errors += 1;
  s.lastErrorAt = Date.now();
  try {
    console.log(JSON.stringify({
      tag: 'nuba_route',
      api: String(api),
      kind: 'error',
      status: Number(status) || null,
      ts: Date.now()
    }));
  } catch (e) { /* noop */ }
}

/** 현재 웜 인스턴스의 카운터 스냅샷 (키·비밀값 없음) */
function snapshot() {
  const s = state();
  let total = 0, def = 0, custom = 0, hit = 0, miss = 0;
  APIS.forEach((k) => {
    const b = s.byApi[k] || emptyApiBucket();
    total += b.total; def += b.default_route; custom += b.custom_route;
    hit += b.cache_hit; miss += b.cache_miss;
  });
  const tmap = s.byApi.tmap || emptyApiBucket();
  return {
    ok: true,
    service: '누빠(누가빠름) 길찾기 요청 카운터',
    measured_at: new Date().toISOString(),
    scope: 'warm 인스턴스 메모리 — 인스턴스가 새로 뜨면(콜드 스타트) 0부터 다시 셉니다. 영구 집계는 Vercel Runtime Logs 의 tag=nuba_route 줄로 합니다.',
    instance: {
      id: s.instanceId,
      started_at: new Date(s.startedAt).toISOString(),
      uptime_sec: Math.round((Date.now() - s.startedAt) / 1000),
      last_request_at: s.lastRequestAt ? new Date(s.lastRequestAt).toISOString() : null,
      last_error_at: s.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : null
    },
    route: {
      total: total,
      default_route: def,
      custom_route: custom,
      custom_ratio_pct: pct(custom, total),
      default_ratio_pct: pct(def, total)
    },
    cache: {
      hit: hit,
      miss: miss,
      hit_rate_pct: pct(hit, hit + miss)
    },
    by_api: s.byApi,
    note: '페이지 1회 열기/검색 1회 = 티맵·카카오·네이버 각 1건(3건). 실제 검색 횟수는 by_api.tmap.total 을 보면 됩니다.',
    default_route_rule: {
      start: [DEFAULT_START.x, DEFAULT_START.y],
      end: [DEFAULT_END.x, DEFAULT_END.y],
      tolerance_deg: MATCH_TOL_DEG
    },
    recent_custom_routes: s.recentCustom
  };
}

module.exports = {
  DEFAULT_START: DEFAULT_START,
  DEFAULT_END: DEFAULT_END,
  MATCH_TOL_DEG: MATCH_TOL_DEG,
  isDefaultRoute: isDefaultRoute,
  recordRoute: recordRoute,
  recordError: recordError,
  snapshot: snapshot
};

/**
 * 누빠 (누가빠름) — 토스 앱 열기 CTA 클릭 카운터 (공통 모듈)
 *
 * 무엇을 세는가
 *   일반 웹(nuba 웹앱)에서 '토스 앱에서 무제한으로 비교하기' 버튼을 누른 횟수.
 *     - top_banner : 첫 화면 검색 박스 위 상단 CTA 배너(#tossBanner)
 *     - limit_card : 웹 무료 비교(2회)를 다 쓴 뒤 결과 영역에 뜨는 제한 카드의 CTA
 *     - other      : 위치 값이 없거나 알 수 없는 경우(프론트 버전 차이 등)
 *   → 당근·스레드 광고로 들어온 사람이 실제로 토스 미니앱으로 넘어가는 비율(전환)을
 *     보기 위한 카운터다. 광고비를 올릴지 판단하는 근거로 쓴다.
 *
 * 설계 메모
 *   - 길찾기 카운터(_stats.js)와 같은 이유로 인스턴스 메모리(globalThis)에만 남긴다.
 *     gateway.js 가 같은 함수로 들어와야 /api/stats 에서 이 카운터가 보인다.
 *   - 콜드 스타트하면 0부터 다시 센다. 영구 집계는 Vercel Runtime Logs 의
 *     `{"tag":"nuba_cta_click",...}` 한 줄 로그로 한다.
 *   - 앱인토스(토스 미니앱) 안에서는 CTA 자체가 없으므로 이 카운터에는 잡히지 않는다.
 *     (프론트에서도 IS_TOSS_MINI 이면 전송하지 않는 이중 차단)
 *
 * 개인정보
 *   위치 이름(문자열 3종)과 시각만 센다. IP·User-Agent·검색어·도착지·광고 유입 경로는
 *   저장하지도 로그로 남기지도 않는다.
 */
'use strict';

const POSITIONS = ['top_banner', 'limit_card', 'other'];

/* 최근 클릭 보관 개수 */
const RECENT_MAX = 20;

function emptyByPosition() {
  const out = {};
  POSITIONS.forEach((p) => { out[p] = 0; });
  return out;
}

function state() {
  if (!globalThis.__NUBA_CTA__ || typeof globalThis.__NUBA_CTA__ !== 'object') {
    globalThis.__NUBA_CTA__ = {
      instanceId: Math.random().toString(36).slice(2, 10),
      startedAt: Date.now(),
      total: 0,
      by_position: emptyByPosition(),
      recent: [],
      lastClickAt: null,
      firstClickAt: null
    };
  }
  return globalThis.__NUBA_CTA__;
}

/**
 * 위치 값을 정리한다. 허용 목록 밖(빈 값·오타·임의 문자열)은 'other' 로 묶어
 * 로그·응답에 임의 문자열이 그대로 실리지 않게 한다.
 */
function normalizePosition(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase().slice(0, 32);
  return POSITIONS.indexOf(v) !== -1 ? v : 'other';
}

/** 요청에서 위치를 꺼낸다 — 쿼리(?pos=) 우선, 없으면 본문(pos) */
function positionFromRequest(req) {
  const q = (req && req.query) || {};
  if (q.pos != null) return normalizePosition(Array.isArray(q.pos) ? q.pos[0] : q.pos);

  let body = req && req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (body && typeof body === 'object' && body.pos != null) {
    return normalizePosition(Array.isArray(body.pos) ? body.pos[0] : body.pos);
  }
  return 'other';
}

/**
 * 클릭 1건 기록.
 * @returns {{pos:string, total:number}}
 */
function record(pos) {
  const s = state();
  const where = normalizePosition(pos);
  const now = Date.now();

  s.total += 1;
  s.by_position[where] = (s.by_position[where] || 0) + 1;
  s.lastClickAt = now;
  if (!s.firstClickAt) s.firstClickAt = now;

  s.recent.push({ at: new Date(now).toISOString(), pos: where });
  if (s.recent.length > RECENT_MAX) {
    s.recent.splice(0, s.recent.length - RECENT_MAX);
  }

  /* Vercel Runtime Logs 용 한 줄 로그 (영구 기록은 이 줄로 남는다) */
  try {
    console.log(JSON.stringify({
      tag: 'nuba_cta_click',
      pos: where,
      total: s.total,
      ts: now
    }));
  } catch (e) { /* 로그 실패가 응답을 막지 않게 */ }

  return { pos: where, total: s.total };
}

/** 현재 웜 인스턴스의 CTA 클릭 스냅샷 (/api/stats 의 toss_cta_clicks) */
function snapshot() {
  const s = state();
  const by = Object.assign(emptyByPosition(), s.by_position);
  const share = (n) => (s.total ? Math.round((n / s.total) * 1000) / 10 : 0);
  return {
    total: s.total,
    by_position: by,
    share_pct: {
      top_banner: share(by.top_banner),
      limit_card: share(by.limit_card),
      other: share(by.other)
    },
    first_click_at: s.firstClickAt ? new Date(s.firstClickAt).toISOString() : null,
    last_click_at: s.lastClickAt ? new Date(s.lastClickAt).toISOString() : null,
    recent_clicks: s.recent.slice(-10),
    instance: {
      id: s.instanceId,
      started_at: new Date(s.startedAt).toISOString()
    },
    scope: 'warm 인스턴스 메모리 — 인스턴스가 새로 뜨면(콜드 스타트) 0부터 다시 셉니다. 영구 집계는 Vercel Runtime Logs 의 tag=nuba_cta_click 줄로 합니다.',
    note: '일반 웹에서 토스 앱 열기 CTA 를 누른 횟수입니다. 앱인토스(토스 미니앱) 안에서는 CTA 가 없어 잡히지 않습니다. IP·UA·검색어는 저장하지 않습니다.'
  };
}

/* ---------------- 요청 처리 (gateway 의 ep=cta) ---------------- */

/**
 * POST /api/cta?pos=top_banner|limit_card 핸들러.
 *   프론트는 본문 없이 쿼리로만 위치를 넘긴다(text/plain 본문은 파서에 따라 비어 있을 수 있음).
 *   방어는 길찾기 프록시와 같다 — 출처 잠금(_origin.js) 뒤 IP당 분당 30건 제한(_guard.js).
 */
function handle(req, res) {
  const guard = require('./_guard');

  /* 출처 잠금 + 레이트리밋 (+ OPTIONS 프리플라이트는 여기서 204 로 끝난다) */
  if (!guard.allow(req, res, 'cta')) return;

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ ok: false, error: 'POST 만 지원합니다.' });
    return;
  }

  const result = record(positionFromRequest(req));
  res.setHeader('X-Nuba-Cta', 'counted');
  res.status(200).json({ ok: true, pos: result.pos, total: result.total });
}

module.exports = {
  POSITIONS,
  normalizePosition,
  positionFromRequest,
  record,
  snapshot,
  handle
};

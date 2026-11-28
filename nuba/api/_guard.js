/**
 * 누빠 (누가빠름) — 프록시 공통 방어 모듈
 *
 * 무엇을 하나
 *   1) IP당 1분 요청 수 제한 (슬라이딩 윈도우, 웜 인스턴스 메모리)
 *      - 한 사람이 새로고침·연타·스크립트로 TMAP 한도를 태우는 것을 막는다.
 *      - 정상 사용은 검색 1회 = 티맵·카카오·네이버 각 1건이므로 분당 30건이면 충분히 넉넉하다.
 *   2) 업스트림 429(한도 초과) 뒤 60초 쿨다운 상태를 기억했다가 그동안 업스트림 호출을 건너뛴다.
 *      (이미 한도가 끝난 상태에서 계속 호출해도 실패만 쌓이므로 남은 호출을 아낀다)
 *
 * 개인정보
 *   IP는 제한 계산에만 쓰고 저장·로그·응답에 남기지 않는다. 좌표·검색어와도 결합하지 않는다.
 *
 * 한계
 *   Vercel 서버리스는 인스턴스마다 메모리가 따로다. 그래서 이 제한은 '한 인스턴스 기준'이며,
 *   절대적인 방화벽이 아니라 한도 폭주를 크게 줄이는 안전장치다.
 *
 * 출처 잠금(2026-11-28 추가)
 *   allow() 맨 앞에서 _origin.js 로 Origin/Referer 를 먼저 본다.
 *   허용 목록(우리 배포본 + 토스 앱인토스 미니앱) 밖이면 403 으로 끝내고 레이트리밋까지 가지 않는다.
 *   CORS 헤더도 이 단계에서 붙는다(* 대신 허용된 Origin 만 되돌려 준다).
 */
'use strict';

const origin = require('./_origin');

const WINDOW_MS = 60 * 1000;

/* 분당 허용 건수 — 정상 사용(검색 1회에 각 1건)은 절대 걸리지 않을 만큼 넉넉하게 */
const LIMITS = {
  tmap: 30,
  kakao: 30,
  naver: 30,
  poi: 30,
  reverse: 10
};

/* 메모리 보호 — 추적 IP 수 상한 */
const MAX_KEYS = 4000;

function rateStore() {
  if (!globalThis.__NUBA_RATE__ || !(globalThis.__NUBA_RATE__ instanceof Map)) {
    globalThis.__NUBA_RATE__ = new Map();
  }
  return globalThis.__NUBA_RATE__;
}

function breakerStore() {
  if (!globalThis.__NUBA_BREAKER__ || !(globalThis.__NUBA_BREAKER__ instanceof Map)) {
    globalThis.__NUBA_BREAKER__ = new Map();
  }
  return globalThis.__NUBA_BREAKER__;
}

/**
 * 호출자 IP.
 *   Vercel 엣지가 붙여 주는 x-real-ip 를 먼저 믿는다(클라이언트가 위조해 보내도 엣지가 채운다).
 *   없으면 x-forwarded-for 의 마지막 값(프록시가 덧붙인 값), 그다음 첫 값을 쓴다.
 *   값을 찾지 못하면 'unknown' 하나로 묶어 공용 버킷으로 센다.
 */
function clientIp(req) {
  const h = (req && req.headers) || {};

  const real = h['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim().slice(0, 64);

  const xff = h['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff.join(',') : xff;
  if (typeof raw === 'string' && raw.trim()) {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }

  const cf = h['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim().slice(0, 64);

  return 'unknown';
}

/**
 * 요청 1건을 세고 허용 여부를 돌려준다.
 * @returns {{ok:boolean, limit:number, counted:number, retryAfter:number}}
 */
function checkRate(req, kind) {
  const limit = LIMITS[kind] || 30;
  const store = rateStore();
  const key = `${kind}|${clientIp(req)}`;
  const now = Date.now();

  let hits = store.get(key);
  if (!Array.isArray(hits)) hits = [];

  /* 60초 지난 기록은 버린다 */
  let drop = 0;
  while (drop < hits.length && now - hits[drop] > WINDOW_MS) drop += 1;
  if (drop) hits = hits.slice(drop);

  if (hits.length >= limit) {
    store.set(key, hits);
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - hits[0])) / 1000));
    return { ok: false, limit, counted: hits.length, retryAfter };
  }

  hits.push(now);
  store.set(key, hits);

  /* 너무 많은 IP를 기억하지 않도록 오래된 키부터 정리 */
  if (store.size > MAX_KEYS) {
    const overflow = store.size - MAX_KEYS;
    const it = store.keys();
    for (let i = 0; i < overflow; i += 1) {
      const k = it.next();
      if (k.done) break;
      store.delete(k.value);
    }
  }

  return { ok: true, limit, counted: hits.length, retryAfter: 0 };
}

/**
 * 제한에 걸렸을 때의 응답. 프론트는 error 문구를 카드에 그대로 보여 준다.
 */
function sendRateLimited(res, verdict) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Nuba-Guard', 'rate-limited');
  res.setHeader('Retry-After', String(verdict && verdict.retryAfter ? verdict.retryAfter : 30));
  res.status(429).json({
    error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    retry_after: verdict && verdict.retryAfter ? verdict.retryAfter : 30
  });
}

/**
 * 핸들러 맨 앞에서 호출. 허용이면 true, 거부·제한이면 응답까지 끝내고 false.
 *   1) 출처(Origin/Referer) 잠금 — 403 / 프리플라이트 204 도 여기서 끝난다
 *   2) IP 레이트리밋 — 429
 */
function allow(req, res, kind) {
  const gate = origin.check(req, res);
  if (!gate.ok) return false;

  const verdict = checkRate(req, kind);
  if (!verdict.ok) {
    sendRateLimited(res, verdict);
    return false;
  }
  return true;
}

/* ---------- 업스트림 한도 초과(429) 쿨다운 ---------- */

/** 업스트림이 429를 주면 60초 동안 그 API 를 건너뛰게 표시한다. */
function trip(kind, seconds) {
  breakerStore().set(kind, Date.now() + Math.max(10, seconds || 60) * 1000);
}

/** 쿨다운 중이면 남은 초를 돌려준다(아니면 0). */
function cooldownLeft(kind) {
  const until = breakerStore().get(kind);
  if (!until) return 0;
  const left = until - Date.now();
  if (left <= 0) {
    breakerStore().delete(kind);
    return 0;
  }
  return Math.ceil(left / 1000);
}

/** 쿨다운 중 응답(업스트림을 부르지 않고 바로 돌려준다). */
function sendCooldown(res, kind, left) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Nuba-Guard', 'upstream-cooldown');
  res.setHeader('Retry-After', String(left));
  res.status(429).json({
    error: '지금 길찾기 요청이 몰려 잠시 쉽니다. 곧 다시 시도해 주세요.',
    retry_after: left
  });
}

module.exports = {
  WINDOW_MS,
  LIMITS,
  origin,
  clientIp,
  checkRate,
  sendRateLimited,
  allow,
  trip,
  cooldownLeft,
  sendCooldown
};

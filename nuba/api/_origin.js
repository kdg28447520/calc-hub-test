/**
 * 누빠 (누가빠름) — 프록시 출처(Origin/Referer) 잠금
 *
 * 왜 필요한가
 *   /api/tmap · /api/kakao · /api/naver · /api/poi · /api/reverse 는 서버에서만 열쇠(앱키)를
 *   붙여 주는 공개 프록시다. 주소를 아는 외부 사이트·스크립트가 그대로 호출하면 우리 무료 한도를
 *   나눠 쓰게 된다. 그래서 '우리 페이지'에서 나온 요청만 통과시킨다.
 *
 * 무엇을 허용하는가 (허용 목록)
 *   1) 우리 배포본
 *      - nuba-kdg2844-8355s-projects.vercel.app  (공개 웹 주소)
 *      - nuba-zeta.vercel.app                     (같은 프로젝트의 짧은 도메인)
 *      - nuba-*.vercel.app · nuba-*-kdg2844-8355s-projects.vercel.app (프리뷰 배포)
 *      - kdg28447520.github.io                    (GitHub Pages 사본 — API_BASE 절대주소로 호출)
 *      - localhost · 127.0.0.1 · [::1]            (로컬 개발)
 *   2) 토스 앱인토스 미니앱 웹뷰 — tossmini.com · toss.im 도메인 전체
 *      앱인토스 공식 문서(developers-apps-in-toss.toss.im/documentation/integration/server-api)의
 *      CORS 허용 Origin 안내를 그대로 따른다. SDK 판올림·롤백에 따라 오리진이 바뀌므로 도메인
 *      단위로 넓게 잡는다(이 도메인은 토스만 만들 수 있으므로 넓게 잡아도 위험은 없다).
 *        - https://{appName}.apps.tossmini.com          실제 서비스 (SDK 3.1.0+ / 1~2.x)
 *        - https://{appName}.private-apps.tossmini.com  콘솔 QR 테스트
 *        - https://{appName}.web.tossmini.com           실제 서비스 (SDK 3.0.0 ~ 3.1.0 미만)
 *        - https://{appName}.private-web.tossmini.com   콘솔 QR 테스트 (SDK 3.0.x)
 *      ★ 이 목록이 비면 토스 미니앱(하루 수천~팔천 명)이 통째로 멈춘다. 좁히지 말 것.
 *
 * 판정 순서
 *   1) Origin 헤더가 있으면(브라우저의 교차 출처 요청) 그 호스트만 본다. 'null' 은 거부.
 *   2) Origin 이 없고 Sec-Fetch-Site: same-origin 이면 같은 배포본에서 온 요청으로 본다.
 *      (같은 오리진 GET 은 브라우저가 Origin 을 붙이지 않는다. Referer 가 지워진 환경의 안전망.)
 *   3) Origin 이 없으면 Referer 호스트를 본다.
 *   4) 둘 다 없으면 토스 웹뷰 User-Agent 만 예외로 통과시킨다(마지막 안전망).
 *      → curl·파이썬 같은 스크립트는 기본 UA 라 여기서 403.
 *
 * 남기는 것
 *   - 응답 헤더 X-Nuba-Origin: allow | blocked
 *   - Runtime Log console.log `{"tag":"nuba_origin",...}` — 호스트·UA 종류·경로만.
 *     IP·좌표·검색어·전체 UA 는 남기지 않는다(경로의 쿼리스트링도 잘라 낸다).
 *
 * 모드
 *   MODE = 'shadow'  : 판정만 하고 절대 막지 않는다. 로그로 실제 출처를 확인하는 관찰용.
 *   MODE = 'enforce' : 허용 목록 밖이면 403.
 */

'use strict';

/* 관찰(shadow) → 적용(enforce) 전환 스위치.
 *   2026-11-28 09:38~09:45 관찰 모드로 실제 트래픽을 확인한 결과, 토스 미니앱은
 *   Origin: https://nuba.apps.tossmini.com 으로 호출하고 있었고 31건 모두 허용 판정이었다.
 *   그래서 enforce 로 전환했다.
 *   급할 때는 Vercel 환경변수 NUBA_ORIGIN_MODE=shadow 로 재배포 없이 잠금을 잠시 풀 수 있다. */
const MODE = process.env.NUBA_ORIGIN_MODE || 'enforce';
const SHADOW = MODE !== 'enforce';

/* 정확히 이 호스트면 허용 */
const EXACT_HOSTS = [
  'nuba-kdg2844-8355s-projects.vercel.app',
  'nuba-zeta.vercel.app',
  'kdg28447520.github.io'
];

/* 도메인 단위 허용 — 호스트가 이 도메인이거나 그 하위 도메인 */
const DOMAIN_SUFFIXES = [
  'tossmini.com',   /* 앱인토스 미니앱 웹뷰 */
  'toss.im'         /* 앱인토스 콘솔·토스 계열 페이지 */
];

/* 정규식 허용 — 프리뷰 배포와 로컬 개발 */
const HOST_PATTERNS = [
  /^nuba(?:-[a-z0-9-]+)?-kdg2844-8355s-projects\.vercel\.app$/,
  /^nuba-[a-z0-9-]+\.vercel\.app$/,
  /^localhost$/,
  /^127\.0\.0\.1$/,
  /^\[::1\]$/
];

/* 오리진·리퍼러가 모두 없을 때만 쓰는 마지막 안전망 — 토스 앱 웹뷰 */
const TOSS_UA = /toss|apps-in-toss|ait\./i;

const EXPOSE = 'X-Nuba-Cache, X-Nuba-Cache-Age, X-Nuba-Route, X-Nuba-Guard, X-Nuba-Origin, Retry-After';

function str(v) {
  if (Array.isArray(v)) return v.length ? String(v[0]) : '';
  return typeof v === 'string' ? v : '';
}

function hostAllowed(host) {
  if (!host) return false;
  const h = String(host).toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (EXACT_HOSTS.indexOf(h) !== -1) return true;
  for (let i = 0; i < DOMAIN_SUFFIXES.length; i += 1) {
    const d = DOMAIN_SUFFIXES[i];
    if (h === d || h.endsWith('.' + d)) return true;
  }
  for (let i = 0; i < HOST_PATTERNS.length; i += 1) {
    if (HOST_PATTERNS[i].test(h)) return true;
  }
  return false;
}

/** 'https://a.b/c' → { scheme, host } / 실패하면 null */
function parseUrl(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return { scheme: u.protocol, host: u.hostname.toLowerCase(), port: u.port || '' };
  } catch (e) {
    return null;
  }
}

/** 우리가 신뢰하는 출처인가 — 로컬 개발만 http 를 허용한다 */
function trusted(parsed) {
  if (!parsed) return false;
  if (!hostAllowed(parsed.host)) return false;
  if (parsed.scheme === 'https:') return true;
  return parsed.host === 'localhost' || parsed.host === '127.0.0.1' || parsed.host === '[::1]';
}

function uaKind(ua) {
  const s = str(ua);
  if (!s) return 'none';
  if (/toss|apps-in-toss/i.test(s)) return 'toss';
  if (/Mozilla\/|Chrome\/|Safari\/|Firefox\//i.test(s)) return 'browser';
  if (/curl|wget|python|node|java|go-http|okhttp|axios|libwww/i.test(s)) return 'cli';
  return 'other';
}

function pathOf(req) {
  const url = str(req && req.url).split('?')[0];
  return url.slice(0, 120) || '/';
}

/* ---------------- 판정 ---------------- */

/**
 * @returns {{allowed:boolean, shadow:boolean, via:string, seen:string, echo:string}}
 *   allowed : 실제로 통과시킬지 (shadow 모드에서도 '판정'은 진짜 값)
 *   echo    : Access-Control-Allow-Origin 으로 되돌려 줄 값(Origin 헤더 원문)
 */
function evaluate(req) {
  const h = (req && req.headers) || {};
  const originRaw = str(h.origin).trim();
  const refererRaw = str(h.referer).trim();
  const secFetchSite = str(h['sec-fetch-site']).trim().toLowerCase();
  const hostHeader = str(h.host).split(':')[0].trim().toLowerCase();

  /* 1) Origin — 브라우저의 교차 출처 요청은 반드시 이 헤더를 붙인다 */
  if (originRaw) {
    if (originRaw === 'null') return { allowed: false, via: 'origin-null', seen: 'null', echo: '' };
    const o = parseUrl(originRaw);
    if (!o) return { allowed: false, via: 'origin-unparsable', seen: originRaw.slice(0, 60), echo: '' };
    if (trusted(o)) return { allowed: true, via: 'origin', seen: o.host, echo: originRaw };
    return { allowed: false, via: 'origin', seen: o.host, echo: '' };
  }

  /* 2) 같은 오리진 GET 은 Origin 이 없다 — Sec-Fetch-Site 로 우리 배포본인지 확인 */
  if (secFetchSite === 'same-origin' && hostAllowed(hostHeader)) {
    return { allowed: true, via: 'same-origin', seen: hostHeader, echo: '' };
  }

  /* 3) Referer */
  if (refererRaw) {
    const r = parseUrl(refererRaw);
    if (trusted(r)) return { allowed: true, via: 'referer', seen: r.host, echo: '' };
    return { allowed: false, via: 'referer', seen: r ? r.host : 'unparsable', echo: '' };
  }

  /* 4) 마지막 안전망 — 토스 앱 웹뷰 UA */
  if (TOSS_UA.test(str(h['user-agent']))) {
    return { allowed: true, via: 'ua-fallback', seen: 'toss-ua', echo: '' };
  }

  return { allowed: false, via: 'none', seen: '', echo: '' };
}

/* ---------------- 로그·카운터 ---------------- */

function tally() {
  if (!globalThis.__NUBA_ORIGIN__ || typeof globalThis.__NUBA_ORIGIN__ !== 'object') {
    globalThis.__NUBA_ORIGIN__ = { allow: 0, blocked: 0, by_via: {}, by_host: {}, startedAt: Date.now() };
  }
  return globalThis.__NUBA_ORIGIN__;
}

function record(info, host) {
  const t = tally();
  if (info.allowed) t.allow += 1; else t.blocked += 1;
  t.by_via[info.via] = (t.by_via[info.via] || 0) + 1;
  const key = host || info.via;
  if (Object.keys(t.by_host).length < 40) t.by_host[key] = (t.by_host[key] || 0) + 1;
}

function snapshot() {
  const t = tally();
  return {
    mode: MODE,
    allow: t.allow,
    blocked: t.blocked,
    by_via: Object.assign({}, t.by_via),
    by_host: Object.assign({}, t.by_host)
  };
}

function log(req, info, host) {
  /* 적용 모드에서는 막은 요청만 남긴다(정상 트래픽 로그로 로그를 채우지 않는다) */
  if (!SHADOW && info.allowed) return;
  try {
    console.log(JSON.stringify({
      tag: 'nuba_origin',
      mode: MODE,
      verdict: info.allowed ? 'allow' : 'blocked',
      via: info.via,
      host: String(host || '').slice(0, 80),
      ua: uaKind((req && req.headers || {}).user-agent),
      path: pathOf(req)
    }));
  } catch (e) { /* 로그 실패가 응답을 막지 않는다 */ }
}

/* ---------------- 응답 ---------------- */

/** 모든 응답에 CORS 를 붙인다. 허용된 교차 출처에는 그 Origin 만 되돌려 준다(* 금지).
 *  관찰(shadow) 중에는 지금과 똑같이 * 를 내보낸다 — 관찰 단계에서 어떤 클라이언트도 깨지지 않게. */
function applyCors(req, res, info) {
  res.setHeader('Vary', 'Origin');
  if (SHADOW) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (info && info.echo) {
    res.setHeader('Access-Control-Allow-Origin', info.echo);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', EXPOSE);
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Nuba-Origin', info && info.allowed ? 'allow' : 'blocked');
}

function deny(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Nuba-Origin', 'blocked');
  res.setHeader('X-Nuba-Guard', 'origin-blocked');
  res.status(403).json({
    error: '허용되지 않은 출처에서 온 요청입니다.',
    detail: '이 API는 누빠 웹앱과 토스 앱인토스 미니앱에서만 호출할 수 있습니다.'
  });
}

/**
 * 핸들러 맨 앞에서 호출한다.
 *   1) 판정·로그·카운터
 *   2) CORS 헤더 부착
 *   3) 거부면 403 응답까지 끝내고 false
 *   4) 프리플라이트(OPTIONS)면 204 로 끝내고 false
 * @returns {{ok:boolean, info:object}}
 */
function check(req, res) {
  const info = evaluate(req);
  const host = info.seen || '';
  record(info, host);
  log(req, info, host);
  applyCors(req, res, info);

  if (!info.allowed && !SHADOW) {
    deny(res);
    return { ok: false, info: info };
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return { ok: false, info: info };
  }
  return { ok: true, info: info };
}

module.exports = {
  MODE,
  SHADOW,
  EXACT_HOSTS,
  DOMAIN_SUFFIXES,
  HOST_PATTERNS,
  hostAllowed,
  uaKind,
  evaluate,
  check,
  applyCors,
  deny,
  snapshot
};

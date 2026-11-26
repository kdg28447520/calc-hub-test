/**
 * 누빠 (누가빠름) — 길찾기 프록시 단일 진입점 (gateway)
 *
 * 왜 한 파일로 묶었나
 *   Vercel 은 api/*.js 파일마다 서버리스 람다를 따로 띄운다. 람다는 서로 메모리를 공유하지 않으므로
 *   tmap.js / kakao.js / naver.js / stats.js 를 따로 두면 카운터를 한 곳에서 볼 수 없다.
 *   그래서 세 프록시와 카운터 조회를 이 함수 하나로 모아 같은 인스턴스 메모리를 쓰게 했다.
 *
 * 라우팅 (nuba/vercel.json 의 rewrites)
 *   POST /api/tmap    → /api/gateway?ep=tmap
 *   GET  /api/kakao   → /api/gateway?ep=kakao
 *   GET  /api/naver   → /api/gateway?ep=naver
 *   GET  /api/stats   → /api/gateway?ep=stats   (라우트 카운터 조회)
 *
 * ep 쿼리가 없어도(리라이트 설정이 바뀌는 경우) URL 경로나 파라미터 모양으로 한 번 더 판별한다.
 */
'use strict';

const stats = require('./_stats');

const HANDLERS = {
  tmap: require('./_tmap'),
  kakao: require('./_kakao'),
  naver: require('./_naver')
};

const KNOWN = ['tmap', 'kakao', 'naver', 'stats'];

function detectEndpoint(req) {
  const q = (req && req.query) || {};

  if (typeof q.ep === 'string' && KNOWN.indexOf(q.ep) !== -1) {
    return { ep: q.ep, via: 'rewrite(ep)' };
  }

  const url = String((req && req.url) || '');
  const m = url.match(/\/api\/(tmap|kakao|naver|stats)(?:[/?#]|$)/);
  if (m) return { ep: m[1], via: 'url' };

  let body = req && req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  body = body && typeof body === 'object' ? body : {};

  if (body.startX != null && body.endX != null) return { ep: 'tmap', via: 'body' };
  if (q.origin && q.destination) return { ep: 'kakao', via: 'query' };
  if (q.start && q.goal) return { ep: 'naver', via: 'query' };

  return null;
}

function sendStats(req, res, via) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ ok: false, error: 'GET 만 지원합니다.' });
    return;
  }

  const body = stats.snapshot();
  body.dispatch = { endpoint: 'stats', via: via };
  /* 라우팅 진단용 — 호출자 자신의 요청 정보만 담는다(값이 아니라 파라미터 이름만) */
  body.request = {
    method: req.method,
    url: String(req.url || ''),
    query_keys: Object.keys((req && req.query) || {})
  };
  res.status(200).send(JSON.stringify(body, null, 2));
}

module.exports = (req, res) => {
  const hit = detectEndpoint(req);

  if (!hit) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(404).json({
      ok: false,
      error: '알 수 없는 엔드포인트입니다.',
      endpoints: ['POST /api/tmap', 'GET /api/kakao', 'GET /api/naver', 'GET /api/stats']
    });
    return;
  }

  if (hit.ep === 'stats') {
    sendStats(req, res, hit.via);
    return;
  }

  const handler = HANDLERS[hit.ep];
  if (typeof handler !== 'function') {
    res.status(500).json({ ok: false, error: `${hit.ep} 핸들러를 찾을 수 없습니다.` });
    return;
  }
  return handler(req, res);
};

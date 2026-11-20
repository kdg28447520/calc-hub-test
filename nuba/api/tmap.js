/**
 * 누빠 (누가빠름) — SK TMAP 길찾기 프록시
 *
 * 브라우저에는 appKey를 내려보내지 않는다. 이 서버리스 함수가 대신 호출한다.
 * 허용 좌표 4개만 받아서 TMAP 길찾기 경로로 그대로 넘긴다(다른 경로로는 못 씀).
 *
 * 필요한 환경변수:
 *   TMAP_APP_KEY : SK Open API 앱키 (openapi.sk.com)
 */
const https = require('https');

const APP_KEY = process.env.TMAP_APP_KEY || process.env.TMAP_KEY || process.env.SK_APP_KEY;

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
    r.on('end', () => { res.status(r.statusCode || 502).send(data); });
  });

  upstream.on('error', () => {
    res.status(502).json({ error: 'TMAP 연결 실패' });
  });

  upstream.write(payload);
  upstream.end();
};

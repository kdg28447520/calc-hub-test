/**
 * 누빠 (누가빠름) — SK TMAP 장소(POI) 자동완성 프록시
 *
 * 출발지·도착지 검색창의 실시간 자동완성이 이 함수를 거친다.
 * 브라우저에는 appKey가 없고, 여기서 환경변수로만 붙인다.
 *
 * 필요한 환경변수:
 *   TMAP_APP_KEY : SK Open API 앱키 (openapi.sk.com)
 *
 * 사용: /api/poi?keyword=수원역&count=8
 */
const https = require('https');

const APP_KEY = process.env.TMAP_APP_KEY || process.env.TMAP_KEY || process.env.SK_APP_KEY;

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

  const path = `/tmap/pois?version=1&searchKeyword=${encodeURIComponent(keyword)}&count=${count}`;

  const upstream = https.request({
    hostname: 'apis.openapi.sk.com',
    path,
    method: 'GET',
    headers: { appKey: APP_KEY, Accept: 'application/json' }
  }, (r) => {
    let data = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { data += c; });
    r.on('end', () => { res.status(r.statusCode || 502).send(data); });
  });

  upstream.on('error', () => {
    res.status(502).json({ error: 'TMAP POI 연결 실패' });
  });

  upstream.end();
};

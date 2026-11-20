/**
 * 누빠 (누가빠름) — 네이버 Directions 5 프록시
 *
 * 네이버 클라우드 Maps API는 비밀 키(X-NCP-APIGW-API-KEY)를 헤더로 요구하고
 * 브라우저 CORS를 허용하지 않는다. 그래서 이 서버리스 함수가 대신 호출하고
 * 브라우저에는 결과 JSON만 돌려준다. 비밀 키는 브라우저로 내려가지 않는다.
 *
 * 필요한 환경변수:
 *   NAVER_KEY_ID      : 네이버 클라우드 Application Client ID
 *   NAVER_KEY_SECRET  : 네이버 클라우드 Application Client Secret
 */
const https = require('https');

const KEY_ID = process.env.NAVER_KEY_ID;
const KEY_SECRET = process.env.NAVER_KEY_SECRET;

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

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
      res.status(r.statusCode || 502).send(body);
    });
  });

  upstream.on('error', () => {
    res.status(502).json({ code: -1, message: '네이버 API 연결 실패' });
  });
  upstream.end();
};

/**
 * 누빠 (누가빠름) — 카카오모빌리티 길찾기 프록시
 *
 * 카카오 REST 키(KakaoAK)는 브라우저로 내려보내지 않는다.
 * origin/destination 좌표만 받아 카카오모빌리티 길찾기로 넘긴다.
 *
 * 필요한 환경변수:
 *   KAKAO_REST_KEY : 카카오 developers REST API 키 (카카오모빌리티 사용 설정)
 *
 * 사용: /api/kakao?origin=126.95633,37.39267&destination=127.028,37.4981&priority=RECOMMEND&car_type=1
 */
const https = require('https');

const KEY = process.env.KAKAO_REST_KEY || process.env.KAKAO_KEY || process.env.KAKAO_APP_KEY;

const COORD = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

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
    r.on('end', () => { res.status(r.statusCode || 502).send(data); });
  });

  upstream.on('error', () => {
    res.status(502).json({ error: '카카오모빌리티 연결 실패' });
  });

  upstream.end();
};

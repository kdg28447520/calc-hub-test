/**
 * 누빠 (누가빠름) — 현재 위치 역지오코딩 프록시 (SK TMAP)
 *
 * GPS 버튼으로 잡은 좌표를 "안양시 동안구 시민대로 230" 같은 도로명 주소로 바꿔 준다.
 * 브라우저에는 appKey가 없고, 여기서 환경변수로만 붙인다.
 *
 * 필요한 환경변수:
 *   TMAP_APP_KEY : SK Open API 앱키 (openapi.sk.com)
 *
 * 사용: /api/reverse?lat=37.39267&lng=126.95633
 * 응답: { "label": "내 위치 (안양시 동안구 시민대로 230)", "address": "안양시 동안구 시민대로 230" }
 *       주소를 못 찾으면 { "label": "내 위치" }
 */
const https = require('https');

const APP_KEY = process.env.TMAP_APP_KEY || process.env.TMAP_KEY || process.env.SK_APP_KEY;

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v));
  return Number.isFinite(n) ? n : NaN;
}

function shortAddress(info) {
  if (!info) return '';
  const gu = String(info.gu_gun || '');
  const dong = String(info.eup_myun || info.adminDong || info.legalDong || '');
  const road = String(info.roadName || '');
  const bIdx = String(info.buildingIndex || '');
  if (road) return [gu, `${road}${bIdx ? ' ' + bIdx : ''}`].filter(Boolean).join(' ').trim();
  return [gu, dong].filter(Boolean).join(' ').trim();
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

  const q = req.query || {};
  const lat = num(q.lat);
  const lng = num(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat, lng 좌표가 필요합니다.', label: '내 위치' });
    return;
  }

  if (!APP_KEY) {
    res.status(200).json({ label: '내 위치', address: '' });
    return;
  }

  const path = `/tmap/geo/reversegeocoding?version=1&lat=${lat}&lon=${lng}&coordType=WGS84GEO&addressType=A10`;

  const upstream = https.request({
    hostname: 'apis.openapi.sk.com',
    path,
    method: 'GET',
    headers: { appKey: APP_KEY, Accept: 'application/json' }
  }, (r) => {
    let data = '';
    r.setEncoding('utf8');
    r.on('data', (c) => { data += c; });
    r.on('end', () => {
      if (r.statusCode !== 200) {
        res.status(200).json({ label: '내 위치', address: '' });
        return;
      }
      let addr = '';
      try {
        const j = JSON.parse(data);
        addr = shortAddress(j && j.addressInfo);
      } catch (e) { addr = ''; }
      res.status(200).json(addr
        ? { label: `내 위치 (${addr})`, address: addr }
        : { label: '내 위치', address: '' });
    });
  });

  upstream.on('error', () => {
    res.status(200).json({ label: '내 위치', address: '' });
  });

  upstream.end();
};

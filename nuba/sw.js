const CACHE_NAME = 'nuba-v1';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  // 실시간 API·지도 타일·프록시는 항상 네트워크 (캐시 금지)
  if (url.includes('/api/') || url.includes('arcgisonline.com') || url.includes('openapi.sk.com') || url.includes('kakaomobility.com')) return;
  // 앱 문서는 네트워크 우선 (배포 최신본 우선), 오프라인일 때만 캐시
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(e.request)));
});

# 누빠 (누가빠름) — 실시간 3사 내비 비교

티맵 · 카카오내비 · 네이버지도에 **동시에 실시간으로 물어보고** 소요시간·거리·통행료를 한 화면에서 비교하는 웹앱입니다.
가장 빠른 내비를 자동으로 골라 주고, 버튼 한 번으로 해당 내비 앱으로 넘깁니다.

- 공개 주소: **https://nuba-kdg2844-8355s-projects.vercel.app/**
- 소스(배포 위치): GitHub `kdg28447520/calc-hub-test` → `nuba/` 폴더 (이 폴더에 푸시하면 Vercel이 자동 재배포)

## 구조 — 모든 API 호출이 서버 프록시를 거칩니다

브라우저(HTML/JS)에는 **API 키가 한 개도 없습니다.** 3사 모두 Vercel 서버리스 함수가 대신 호출하고,
키는 Vercel 프로젝트 `nuba`의 환경변수에만 있습니다.

| 내비 | 브라우저가 부르는 주소 | 서버가 부르는 곳 | 필요한 환경변수 |
| --- | --- | --- | --- |
| 티맵 (SK TMAP) | `POST /api/tmap` | `apis.openapi.sk.com/tmap/routes` | `TMAP_APP_KEY` |
| 장소 자동완성 (SK POI) | `GET /api/poi?keyword=` | `apis.openapi.sk.com/tmap/pois` | `TMAP_APP_KEY` |
| 카카오내비 (카카오모빌리티) | `GET /api/kakao?origin=&destination=` | `apis-navi.kakaomobility.com/v1/directions` | `KAKAO_REST_KEY` |
| 네이버지도 (NCP Directions 5) | `GET /api/naver?start=&goal=` | `maps.apigw.ntruss.com/map-direction/v1/driving` | `NAVER_KEY_ID`, `NAVER_KEY_SECRET` |
| GPS 버튼 역지오코딩 | `GET /api/reverse?lat=&lng=` | `apis.openapi.sk.com/tmap/geo/reversegeocoding` | `TMAP_APP_KEY` |

프록시는 각 서비스의 해당 경로만 호출하고, 좌표·옵션 파라미터만 받습니다.

## 파일

- `index.html` — 앱 전체(화면 + 프록시 호출 + 지도 렌더링). 지도에는 3사 경로가 브랜드 색(티맵 빨강 `#ef4444` · 네이버 초록 `#16a34a` · 카카오 노랑 `#f59e0b`)으로 동시에 그려지고, 선택한 노선만 흰 외곽선 + 굵은 선으로 앞에 강조됩니다.
- `api/tmap.js` — SK TMAP 길찾기 프록시 (`TMAP_APP_KEY`)
- `api/poi.js` — SK TMAP POI 자동완성 프록시 (`TMAP_APP_KEY`)
- `api/kakao.js` — 카카오모빌리티 길찾기 프록시 (`KAKAO_REST_KEY`)
- `api/naver.js` — 네이버 Directions 5 프록시 (`NAVER_KEY_ID`, `NAVER_KEY_SECRET`)
- `api/reverse.js` — 현재 위치 역지오코딩 프록시 (`TMAP_APP_KEY`) — GPS 버튼을 누르면 출발지가 `내 위치 (안양시 동안구 시민대로 230)` 처럼 표시되고, 주소를 못 찾으면 `내 위치`로 둡니다.
- `manifest.json`, `sw.js`, `icons/` — PWA 설치용
- `og.png` — 카톡·문자 공유 카드 이미지(1200×630, 실제 화면 캡처 기반)

### 애드센스 심사용 문서·SEO

| 파일 | 내용 |
| --- | --- |
| `guide.html` | 이용 가이드 — 3사 소요시간이 다른 이유, API 요청 옵션 표, 차이 읽는 법, 시간대별 팁, 통행료, 사용법 |
| `faq.html` | 자주 묻는 질문 16개 (`FAQPage` 구조화 데이터) |
| `about.html` | 서비스 소개 — 만든 이유, 동작 구조(서버 프록시), 데이터 출처·상표 고지, 운영 원칙 |
| `contact.html` | 문의 — `kdg2844@gmail.com`, 오류 신고 시 담을 정보 |
| `privacy.html` | 개인정보처리방침 — 위치·즐겨찾기(localStorage)·AdSense 쿠키·제3자 이전 |
| `terms.html` | 이용약관 — 참고 정보의 한계, 면책, 금지 행위 |
| `assets/site.css` | 위 문서 공용 스타일(앱과 같은 화이트/슬레이트 + `#1E7B4F` 톤) |
| `robots.txt` | 전체 허용 + Sitemap + Mediapartners-Google 허용 |
| `sitemap.xml` | 루트 + 문서 6장 |
| `ads.txt` | `google.com, pub-4533404826925371, DIRECT, f08c47fec0942fa0` |

`index.html` 하단(`#site-info`)에도 소개·3사 차이 요약·사용법·FAQ 요약·푸터가 실제 HTML 텍스트로 들어갑니다.
앱 화면은 `.app-viewport`(100dvh) 안에서 기존과 똑같이 동작하고, 그 아래로 문서 영역이 이어집니다.

### 애드센스

- 게시자 ID `ca-pub-4533404826925371` (dasijak.co.kr · gongmaemul.co.kr · petmap.kr 과 같은 계정).
- `index.html`에 `google-adsense-account` 메타와 `adsbygoogle.js` 로더가 들어 있습니다. 문서 페이지에는 메타만 있습니다.
- 광고 슬롯은 아직 넣지 않았습니다. 자동 광고를 켤 경우 지도·비교 카드 위에 뜨지 않도록 AdSense의 ‘페이지별 광고 제외’를 쓰세요.
- **도메인을 연결하면** canonical·og:url·sitemap·robots의 주소를 한 번에 바꿔야 합니다:
  `grep -rl 'nuba-kdg2844-8355s-projects.vercel.app' . | xargs sed -i 's/nuba-kdg2844-8355s-projects.vercel.app/새도메인/g'`

## 개인 즐겨찾기 (내 기기에만)

- 퀵 칩 위 **`★ 즐겨찾기 추가`** → 지금 입력된 도착지(없으면 출발지)를 이름(`집`, `회사`, `단골` 등)과 함께 저장합니다.
- 저장 위치는 브라우저 `localStorage`의 `nuba_saved_places_v1` 하나뿐입니다. 서버로 보내지 않고 로그인도 없으며, 다른 사용자와 공유되지 않습니다. 최대 12개.
- 저장한 칩: **누르면 도착지**로 설정하고 3사 실시간 비교를 바로 시작, **0.5초 이상 길게 누르면 출발지**로 설정, 우측 **`×`**로 삭제.

## 운영 메모

- 환경변수를 바꾸면 **새 배포가 필요**합니다(Vercel 규칙). 값을 바꾼 뒤에는 Redeploy 하세요.
- `/api/*`는 인증이 없는 공개 프록시입니다. 주소를 아는 사람이 호출하면 동곤 님 계정의 무료 한도를 나눠 쓰게 됩니다.
- 실패는 값을 지어내지 않고 `호출 실패` + 사유(HTTP 코드 / 프록시·업체 메시지)로 표시합니다.
- 정적 사본(GitHub Pages `kdg28447520.github.io/calc-hub-test/nuba/`)에는 서버가 없어 3사 모두 "프록시 없는 주소"로 표시됩니다. 공유는 Vercel 주소로 하세요.

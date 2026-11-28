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

### 세 프록시는 `api/gateway.js` 한 함수로 들어갑니다

Vercel 은 `api/*.js` 파일마다 람다를 따로 띄워 메모리를 공유하지 않습니다. 그래서 요청 카운터를 한 곳에서 보려면
세 프록시와 카운터 조회가 **같은 인스턴스**에서 돌아야 합니다. `vercel.json` 의 rewrites 가 아래처럼 묶습니다.

| 브라우저가 부르는 주소 | 실제 실행 |
| --- | --- |
| `POST /api/tmap` | `/api/gateway?ep=tmap` |
| `GET /api/kakao` | `/api/gateway?ep=kakao` |
| `GET /api/naver` | `/api/gateway?ep=naver` |
| `GET /api/stats` | `/api/gateway?ep=stats` |

`api/poi.js`·`api/reverse.js` 는 그대로 각자 함수입니다(카운터 대상 아님).

## 요청 카운터 — 기본 경로 vs 실제 검색

앱을 **열어만 본 사람**과 **실제로 길찾기를 검색한 사람**을 구분하기 위한 카운터입니다.

- `default_route` — 앱 첫 화면의 기본 경로 요청: 출발 평촌 아크로타워(`126.9563, 37.3927`) → 도착 강남역(`127.0280, 37.4981`), 허용치 0.0005도(약 55m).
- `custom_route` — 출발/도착을 바꿔 검색한 요청. 최근 12건은 소수점 2자리(약 1km) 좌표 예시만 남깁니다(IP·키워드 저장 없음).
- 캐시 HIT·MISS 모두 요청 1건으로 세고, 응답 헤더 `X-Nuba-Route: default_route|custom_route` 로도 알려 줍니다.
- 조회: **`GET /api/stats`** — 웜 인스턴스 기준 `route`, `by_api`, `cache`, `recent_custom_routes` JSON. 키·비밀값은 담지 않습니다.
- 카운터는 인스턴스 메모리라 콜드 스타트 시 0부터 다시 셉니다. 영구 집계는 Vercel Runtime Logs 의 `{"tag":"nuba_route",...}` 한 줄 로그로 합니다.

## 파일

- `index.html` — 앱 전체(화면 + 프록시 호출 + 지도 렌더링). 지도에는 3사 경로가 브랜드 색(티맵 빨강 `#ef4444` · 네이버 초록 `#16a34a` · 카카오 노랑 `#f59e0b`)으로 동시에 그려지고, 선택한 노선만 흰 외곽선 + 굵은 선으로 앞에 강조됩니다.
- `api/gateway.js` — 세 길찾기 프록시 + `/api/stats` 의 단일 진입점(카운터 공유용)
- `api/_stats.js` — 기본 경로/커스텀 경로·캐시 카운터 공통 모듈 (라우트로 노출되는 파일 아님)
- `api/_tmap.js` — SK TMAP 길찾기 프록시 (`TMAP_APP_KEY`) — gateway 가 호출
- `api/_kakao.js` — 카카오모빌리티 길찾기 프록시 (`KAKAO_REST_KEY`) — gateway 가 호출
- `api/_naver.js` — 네이버 Directions 5 프록시 (`NAVER_KEY_ID`, `NAVER_KEY_SECRET`) — gateway 가 호출
- `vercel.json` — `/api/tmap`·`/api/kakao`·`/api/naver`·`/api/stats` → `api/gateway.js` 리라이트
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

## 웹 무료 비교 하루 2회 → 토스 앱 유도 (일반 웹만)

당근·스레드에서 웹으로 들어온 사람이 웹에서만 머무르지 않고 **앱인토스「누빠」(`https://minion.toss.im/BjrRrzxA`)** 로 이어지게 하는 장치입니다.

- 일반 웹 브라우저에서 사용자가 **직접 누른 조회**(검색 버튼·Enter·프리셋·즐겨찾기 칩)를 `localStorage` 의 `nuba_daily_search_YYYY-MM-DD` 에 센다. 하루 **2회**까지 정상 결과(3사 비교·지도·최속 안내 모두 동일).
- **첫 화면의 기본 경로 자동 조회는 세지 않는다.** 광고 심사자가 1회 열었을 때 바로 정상 서비스가 보이도록 한 장치다.
- 3회째부터는 **3사 API 를 부르지 않고** 결과 영역을 카드로 바꿔 "오늘 웹 무료 비교(2회)를 모두 사용했어요" + 토스 앱 CTA 를 보여 준다(서버 한도 절약 겸함). 무료 횟수를 다 쓴 사람이 새로고침해도 API 는 불리지 않는다.
- 지난 날짜 키는 처음 불러올 때 정리한다. `localStorage` 가 막힌 브라우저는 메모리 카운트로 같은 규칙을 지킨다.
- 검색 박스 위에는 토스 블루(`#3182F6`) 풀폭 **CTA 버튼**(터치 영역 40px)과 "오늘 웹 무료 비교 N회 남음" 안내를 둔다.
- **앱인토스 내부 예외(필수)**: `IS_TOSS_MINI` 가 참이면 무료 횟수·카운트·배너·남은 횟수 줄을 모두 쓰지 않는다. 판정은 ① 토스 번들의 `window.NUBA_TOSS` ② `*.tossmini.com`·`*.toss.im` 호스트 ③ UA 에 `toss`/`apps-in-toss`/`ait.` 셋 중 하나라도 걸리면 토스로 본다.
- 토스 번들(`/workspace/nuba-toss`)은 `scripts/build-web.mjs` 의 (9) 단계에서 배너 마크업·남은 횟수 줄을 아예 들어낸다(깜빡임·오노출 방지). 마크업 모양이 바뀌면 `must()` 가 번들 빌드를 실패시킨다.

## 개인 즐겨찾기 (내 기기에만)

- 퀵 칩 위 **`★ 즐겨찾기 추가`** → 지금 입력된 도착지(없으면 출발지)를 이름(`집`, `회사`, `단골` 등)과 함께 저장합니다.
- 저장 위치는 브라우저 `localStorage`의 `nuba_saved_places_v1` 하나뿐입니다. 서버로 보내지 않고 로그인도 없으며, 다른 사용자와 공유되지 않습니다. 최대 12개.
- 저장한 칩: **누르면 도착지**로 설정하고 3사 실시간 비교를 바로 시작, **0.5초 이상 길게 누르면 출발지**로 설정, 우측 **`×`**로 삭제.

## 운영 메모

### 한도 방어 3단 (캐시 · 동시요청 합치기 · 반복호출 제한)

SK Open API(TMAP) 하루 한도가 1,000건이라, 같은 요청을 다시 계산하지 않도록 네 겹으로 막습니다.

| 층 | 무엇을 | 어디서 |
|---|---|---|
| 캐시 | 같은 좌표/검색어 응답 재사용 | `_tmap`·`_kakao`·`_naver` 5분, `poi` 10분, `reverse` 1시간 (웜 인스턴스 메모리) |
| 동시 요청 합치기 | 같은 요청 2건이 동시에 오면 업스트림 1회만 호출 | `_tmap`·`poi` (응답 헤더 `X-Nuba-Cache: SHARED`) |
| 반복 호출 제한 | IP당 1분 30건(역지오코딩 10건) | `api/_guard.js` → 429 + `X-Nuba-Guard: rate-limited`, `Retry-After` |
| 한도 초과 쿨다운 | 업스트림이 429를 주면 60초간 호출 생략 | `api/_guard.js` → `X-Nuba-Guard: upstream-cooldown` |

- 제한 걸린 응답 본문: `{ "error": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", "retry_after": 초 }` — 프론트는 이 문구를 비교 카드에 그대로 표시합니다(재시도 폭주 없음: `fetchWithRetry`는 네트워크 예외만 재시도).
- IP는 제한 계산에만 쓰고 저장·로그·응답에 남기지 않습니다. Vercel 은 `x-forwarded-for` 첫 값을 씁니다.
- 브라우저도 같은 검색어를 5분간 기억합니다(`poiCache`) — 같은 사람이 자동완성을 다시 열어도 서버를 부르지 않습니다.

#### 5분 인메모리 캐시 (3사 길찾기)

`/api/tmap` · `/api/kakao` · `/api/naver` 세 프록시 모두 **같은 좌표(소수점 4자리 ≈ 11m 정규화) 요청을 5분(300초) 동안 인메모리에 캐싱**합니다.

- HTTP **200 + 정상 형식**(티맵 `features` / 카카오 `routes` / 네이버 `code:0`+`route`)만 저장합니다. `429`(한도초과)·4xx·5xx·연결 실패는 절대 캐싱하지 않습니다.
- 인스턴스당 최대 **300건 LRU**. 넘치면 가장 오래 안 쓴 항목부터 버립니다.
- Vercel 서버리스 인스턴스가 **웜 상태일 때만** 적중합니다(새 인스턴스는 빈 캐시). 같은 기기에서 같은 경로를 다시 조회하는 경우·여러 사용자가 인기 경로를 조회하는 경우에 한도를 아낍니다.
- 응답 헤더로 확인: `X-Nuba-Cache: HIT | MISS | SHARED`, `X-Nuba-Cache-Age`(적중 시 저장 후 경과 초). CORS로 노출되어 브라우저에서도 읽을 수 있습니다.
- 장소 자동완성 `/api/poi` 는 **검색어 기준 10분 캐시**(공백·대소문자 정리, 500건 LRU)를 따로 둡니다. 자동완성은 같은 검색어가 반복되어 한도 소모가 가장 큰 구간입니다.
- GPS 역지오코딩 `/api/reverse` 는 **좌표 4자리 기준 1시간 캐시**(200건 LRU)입니다. 도로명 주소는 거의 바뀌지 않습니다.
- TMAP 약관상 24시간 내 결과 캐싱은 허용되며, 5분은 그보다 훨씬 짧습니다.
- 프론트엔드 요청 방식은 그대로입니다(티맵 POST, 카카오·네이버 GET). 키는 여전히 Vercel 환경변수에만 있습니다.

- 환경변수를 바꾸면 **새 배포가 필요**합니다(Vercel 규칙). 값을 바꾼 뒤에는 Redeploy 하세요.
- `/api/*`는 인증이 없는 공개 프록시입니다. 주소를 아는 사람이 호출하면 동곤 님 계정의 무료 한도를 나눠 쓰게 됩니다. 위 3단 방어는 그 소모를 줄이는 장치이지 인증은 아닙니다.
- 메인 화면에는 **"토스 앱에서 누빠 열기"** 배너(`#tossBanner`, `https://minion.toss.im/BjrRrzxA`, 새 창)가 검색 박스 위에 있습니다. 앱인토스 미니앱 안에서 열리면 배너는 자동으로 숨습니다.
- 실패는 값을 지어내지 않고 `호출 실패` + 사유(HTTP 코드 / 프록시·업체 메시지)로 표시합니다.
- 정적 사본(GitHub Pages `kdg28447520.github.io/calc-hub-test/nuba/`)에는 서버가 없어 3사 모두 "프록시 없는 주소"로 표시됩니다. 공유는 Vercel 주소로 하세요.

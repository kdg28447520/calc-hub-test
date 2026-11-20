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

- `index.html` — 앱 전체(화면 + 프록시 호출 + 지도 렌더링)
- `api/tmap.js` — SK TMAP 길찾기 프록시 (`TMAP_APP_KEY`)
- `api/poi.js` — SK TMAP POI 자동완성 프록시 (`TMAP_APP_KEY`)
- `api/kakao.js` — 카카오모빌리티 길찾기 프록시 (`KAKAO_REST_KEY`)
- `api/naver.js` — 네이버 Directions 5 프록시 (`NAVER_KEY_ID`, `NAVER_KEY_SECRET`)
- `api/reverse.js` — 현재 위치 역지오코딩 프록시 (`TMAP_APP_KEY`) — GPS 버튼을 누르면 출발지가 `내 위치 (안양시 동안구 시민대로 230)` 처럼 표시되고, 주소를 못 찾으면 `내 위치`로 둡니다.
- `manifest.json`, `sw.js`, `icons/` — PWA 설치용
- `og.png` — 카톡·문자 공유 카드 이미지(1200×630, 실제 화면 캡처 기반)

## 운영 메모

- 환경변수를 바꾸면 **새 배포가 필요**합니다(Vercel 규칙). 값을 바꾼 뒤에는 Redeploy 하세요.
- `/api/*`는 인증이 없는 공개 프록시입니다. 주소를 아는 사람이 호출하면 동곤 님 계정의 무료 한도를 나눠 쓰게 됩니다.
- 실패는 값을 지어내지 않고 `호출 실패` + 사유(HTTP 코드 / 프록시·업체 메시지)로 표시합니다.
- 정적 사본(GitHub Pages `kdg28447520.github.io/calc-hub-test/nuba/`)에는 서버가 없어 3사 모두 "프록시 없는 주소"로 표시됩니다. 공유는 Vercel 주소로 하세요.

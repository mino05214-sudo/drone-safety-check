# 📝 변경 이력서 (CHANGELOG)

모든 주요 변경 사항과 배포 버전 기록입니다.

---

## [v1.6.1] - 2026-10-19 (STEP 3.28)
### 🧹 임시 Egress 진단 코드 안전 제거 및 전수 회귀 테스트
* **Date**: 2026-10-19
* **STEP**: STEP 3.28
* **Task**: VWorld 경로별 연결 조사를 위해 임시 추가했던 Egress 진단 코드 안전 제거 및 회귀 무결성 검증
* **AI / Role**: Antigravity Assistant (Pair Programming)
* **Diagnosis Summary**:
  - *확인된 사실*: Render 배포 환경에서 VWorld 루트 및 `/req/address`는 `ECONNRESET`, `/req/search` 및 `/req/wfs`는 `502 Bad Gateway` 응답을 반환함 (대조군 `example.com`은 200 OK).
  - *추정 원인*: VWorld 측 WAF(방화벽) 또는 클라우드 호스팅 IP 대역 차단 가능성 등으로 추정(단정하지 않고 분석).
* **Implementation**:
  - `server.js`에서 임시 진단 엔드포인트 `GET /api/egress-diagnostics` 및 Rate Limit 라우트 검사 제거.
  - 진단 헬퍼 함수 7개(`getEgressDiagTargets`, `sanitizeDiagMessage`, `probeHttpsTarget`, `executeEgressDiagnosticsOnce`, `runEgressDiagnosticsIfEnabled` 등 ~280줄) 전면 제거.
  - `ENABLE_EGRESS_DIAGNOSTICS` 환경변수 처리 및 서버 기동 시 백그라운드 프로브 호출 제거.
  - 기존 핵심 프록시 엔드포인트(`/api/search`, `/api/reverse`, `/api/wfs`) 및 정적 파일 서빙 100% 무결성 유지.
* **Verification**:
  - `node --check server.js`: 문법 에러 0건 PASS.
  - `git diff --check`: 공백/포맷 에러 0건 PASS.
  - Kakao 응답 매핑 단위 테스트 (`scratch/test_kakao_integration.mjs`): 20/20 PASS.
  - HTTP 서버 통합 테스트 (`scratch/test_server_http.mjs`): 13/13 PASS.
  - 보안/API키 비노출 검증 (`scratch/test_mock_kakao_proxy.mjs`): PASS.
  - Leaflet + OpenStreetMap 메인 지도 유지 및 스마트폰 위치 오차 미해결 과제 보존.

---

## [v1.6.0] - 2026-10-19 (STEP 3.24 ~ 3.26)
### 🔍 Kakao Local REST API 전환 및 Render 배포 완료, 위치 오차 미해결 기록
* **Date**: 2026-10-19
* **STEP**: STEP 3.24 ~ 3.26
* **Task**: VWorld 클라우드 아웃바운드 차단 해결을 위한 Kakao Local API 프록시 전환 및 Render 배포, 실서버 검증 및 위치 오차 기록
* **AI / Role**: Antigravity Assistant (Pair Programming)
* **Finding**: Render 등 클라우드 호스팅 환경에서 VWorld의 Search 및 WFS/Address 엔드포인트가 실제 진단 시 `ECONNRESET` 및 `502 Bad Gateway` 응답을 반환함을 확인(원인은 WAF/게이트웨이 차단 등으로 추정).
* **Implementation**:
  * `server.js`의 `/api/search` 및 `/api/reverse`를 Kakao Local REST API 프록시(`keyword.json`, `address.json`, `coord2address.json`)로 전면 교체.
  * 기존 `index.html`이 기대하는 VWorld 규격(`title`, `point.x`, `point.y`, `address.road`, `address.parcel`, `address.bldnm`)으로 서버에서 자동 변환.
  * 공역 WFS 프록시(`/api/wfs`, `VWORLD_API_KEY`) 및 정적 140개 공역 GeoJSON 데이터 보존.
  * `process.env.KAKAO_REST_API_KEY` 환경변수 주입 체계 구축.
* **Verification**:
  * **실제 Render 프로덕션 라이브 테스트**: 장소 검색(`HTTP 200`, 581ms), 도로명 검색(`HTTP 200`), 지번 검색(`HTTP 200`), 좌표 역지오코딩(`HTTP 200`, 240ms) 전 항목 성공 확인.
  * **스마트폰 실기기 검증**: 스마트폰 모바일 브라우저에서 검색 결과 선택 시 지도상 마커 정상 표출 확인.
  * **모의/단위 테스트**: 매핑 단위 테스트(20/20 PASS), 서버 HTTP 엔드포인트 통합 테스트(13/13 PASS), API 키 비노출 보안 검증 PASS.
* **Unresolved Issue (미해결 항목)**: 스마트폰 실기기 환경에서 관찰된 위치 오차 현상을 미해결 과제로 기록 (원인 미확정, 후속 정밀 조사 예정).
* **Airspace Distinction (공역 구분)**: 정적 140개 공역 '로드 및 UI 표시'와 국토부 AIP 대비 '공역 데이터 최신성 및 판정 정확성 검증'을 명확히 구분 관리.
* **Commit**: `f4395d1`

---

## [v1.5.0] - 2026-10-08 (STEP 3.8)
### 🛠️ 주소 검색 category 규격 복구 및 역지오코딩 파싱 정상화
* **Date**: 2026-10-08
* **STEP**: STEP 3.8
* **Task**: VWorld Search API 2.0 주소 검색 에러 해결 및 지도 역지오코딩 복구
* **AI / Role**: Antigravity Assistant (Pair Programming)
* **Finding**: `type=address` 호출 시 필수 파라미터인 `category`(`ROAD`/`PARCEL`)가 누락되어 VWorld에서 `PARAM_REQUIRED` 에러가 발생했으며, `reverseGeocodeCoords`가 실제 응답과 다른 필드를 참조하여 항상 null을 반환함.
* **Implementation**: `server.js`에서 category 유효성 검증 및 VWorld 전달 구현, `index.html`에서 1차 place ➔ 2차 ROAD ➔ 3차 PARCEL 순차 검색 체인 구축, `reverseGeocodeCoords` 응답 파싱 수정(`result[0].text`).
* **Verification**: 도로명(세종대로 209, 국원대로 548), 지번(태평로1가 31), 역지오코딩 단위 테스트 및 PC/모바일 브라우저 전수 회귀 PASS.
* **Commit**: `ac06dd7`

---

## [v1.4.0] - 2026-10-08 (STEP 3.7.3)
### 🗺️ 핵심 140개 공역 체계 정제 및 역지오코딩 프록시 구현
* **Date**: 2026-10-08
* **STEP**: STEP 3.7.3
* **Task**: 공역 데이터 무결성 검증 도구 구축 및 임시공역 분리, 역지오코딩 엔드포인트 추가
* **AI / Role**: Antigravity Assistant (Pair Programming)
* **Finding**: 임시공역(TEMPORARY 11개)의 잦은 변동성으로 인한 오안내 위험 확인 및 원전 비행금지구역 10개소 정식 편입 필요성 도출.
* **Implementation**: `airspace.geojson`을 140개 핵심 공역으로 정제, 임시공역은 드론원스톱 공식 확인 카드로 분리, `scripts/verify_vworld_airspace.mjs` 검증 도구 추가, `server.js`에 `/api/reverse` 프록시 및 내부 폴더 접근 차단 보안 강화.
* **Verification**: 140개 공역 무결성 테스트 ALL PASS, 6대 Core 판정 시나리오 전수 PASS.
* **Commit**: `82ab717`

---

## [v1.3.0] - 2026-10-06 (STEP 3.6)
### 🎨 초보자 중심 인허가 UX 단순화 및 정적 5대 안전수칙 교체
* **Date**: 2026-10-06
* **STEP**: STEP 3.6
* **Task**: 복잡한 AI 안내를 직관적인 초보자 안전 가이드와 5대 안전수칙으로 교체
* **AI / Role**: Antigravity Assistant (Pair Programming)
* **Implementation**: 비행 조건별 인허가 뷰 간소화, 관할 항공청 연락처 자동 연동 로직 보강, 모바일 터치 중심 레이아웃 정비.
* **Commit**: `428bac6`

---

## [v1.2.0] - 2026-10-06 (STEP 3)
### 📦 국토부 KMZ 정적 GeoJSON 141개 변환 및 Turf.js 안전판정 연결
* **Date**: 2026-10-06
* **STEP**: STEP 3
* **Task**: 국토부 원본 공역 KMZ를 표준 GeoJSON으로 변환하고 클라이언트 사이드 Turf.js 로컬 판정 엔진 탑재
* **AI / Role**: Antigravity Assistant (Pair Programming)
* **Implementation**: `scripts/convert_kmz_to_geojson.mjs`로 141개 공역 파싱, Turf.js 기반 Point-in-Polygon 초고속 안전 판정 연동.
* **Commit**: `26c7111`

---

## [v1.1.0] - 2026-09-29 (STEP 3-24)
### 🚀 GitHub + Render 배포 준비 및 환경 정리
* **Date**: 2026-09-29
* **STEP**: STEP 3-24
* **Task**: Render 클라우드 배포 대응 프록시/CORS 헤더 강화 및 환경변수 템플릿(`.env.example`) 작성
* **Commit**: `7e50b3c`

---

## [v1.0.0] - 2026-09-29 (STEP 3-23)
### 📦 Antigravity 독립 실행 환경 구축
* **Date**: 2026-09-29
* **STEP**: STEP 3-23
* **Task**: Windows용 원클릭 실행기(`start.bat`, `stop.bat`) 및 `package.json` 무의존성 스크립트 작성

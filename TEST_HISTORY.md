# 🧪 테스트 및 품질 검증 이력서 (TEST_HISTORY)

본 문서는 프로젝트의 기능 무결성, 보안, 배포 적합성을 검증한 테스트 실행 결과 기록입니다.

---

## 📅 [STEP 3.28] 임시 Egress 진단 코드 안전 제거 및 전수 회귀 테스트 (2026-10-19)

### 1. 테스트 목적
* VWorld 경로별 연결 진단을 위해 `server.js`에 임시 추가했던 Egress 진단 기능(`GET /api/egress-diagnostics`, `ENABLE_EGRESS_DIAGNOSTICS`, 관련 헬퍼 함수 7개)을 완전 제거한 후, 기존 애플리케이션 기능이 100% 정상 유지되는지 전수 검증.
* Leaflet + OpenStreetMap 메인 지도 유지 및 스마트폰 위치 오차 미해결 과제 보존 확인.
* VWorld 연결 에러의 확인된 사실(502 Bad Gateway, ECONNRESET)과 추정 원인(WAF/클라우드 차단 등)을 명확히 구분하여 기록.

### 2. 테스트 환경
* **로컬 환경**: Windows 11, Node.js v24.16.0
* **작업 브랜치 / HEAD**: `main` / `f4395d1` (로컬 변경 보존)

### 3. 세부 테스트 실행 결과

| 구분 | 검증 항목 | 실행 명령 / 대상 | 결과 | 세부 내용 |
| :---: | :--- | :--- | :---: | :--- |
| **Syntax** | **코드 문법 검사** | `node --check server.js` | **PASS** | 문법 에러 0건, 정상 구문 분석 |
| **Whitespace** | **공백/포맷 검사** | `git diff --check` | **PASS** | 불필요한 공백 또는 포맷 오류 0건 |
| **Unit** | **Kakao 응답 매핑 & UI 호환** | `node scratch/test_kakao_integration.mjs` | **PASS (20/20)** | 장소 키워드 매핑 7개 필드 일치, 도로명/지번 필터링 및 역지오코딩 폴백 검증 |
| **Server E2E** | **HTTP 엔드포인트 무결성** | `node scratch/test_server_http.mjs` | **PASS (13/13)** | 파라미터 유효성 검증(400), 정적 파일 서빙, WFS 프록시 보존 검증 |
| **Security** | **민감 정보 비노출 검증** | `node scratch/test_mock_kakao_proxy.mjs` | **PASS** | 응답 JSON, 클라이언트 반환값, 로그에 API 키 비노출 확인 |

---

## 📅 [STEP 3.25 ~ 3.26] Kakao Local API 전환 및 Render 운영 배포 라이브 검증 (2026-10-19)

### 1. 테스트 목적
* Render 클라우드 환경에서 VWorld 엔드포인트의 502 Bad Gateway / ECONNRESET 응답 문제(WAF/게이트웨이 차단 등으로 추정)를 해결하기 위해 구현한 Kakao Local REST API 프록시(`server.js`)의 기능 무결성, 보안, 배포 적합성을 전수 검증.
* **실제 배포 환경 라이브 테스트**와 **로컬 모의(Mock) 테스트**를 명확히 구분하여 기록.
* 스마트폰 실기기 테스트 중 관찰된 위치 오차를 **미해결 항목(Unresolved)**으로 공식 기록.
* 정적 140개 공역 로드/표시와 공역 데이터 최신성·판정 정확성 검증을 구분.

### 2. 테스트 환경
* **운영 배포 서버**: Render Web Service (`https://drone-safety-check.onrender.com`)
* **로컬 환경**: Windows 11, Node.js v24.16.0
* **실기기 환경**: 스마트폰 모바일 브라우저 (Chrome Mobile)
* **커밋 해시**: `f4395d1` (`feat: migrate search and reverse geocoding to kakao local api`)

---

### 3. 세부 테스트 실행 결과

#### 3.1 실제 Render 프로덕션 라이브 테스트 (Real Live Tests)

| 구분 | 검증 항목 | 요청 경로 / 파라미터 | 결과 | 세부 응답 데이터 및 실측 내용 |
| :---: | :--- | :--- | :---: | :--- |
| **Real Live** | **장소명(키워드) 검색** | `GET /api/search?query=충주시청&type=place` | **PASS (HTTP 200)** | 소요 시간 581ms. 15건 실데이터 수신(`title`, `point.x`, `point.y`, `road`, `parcel`, `bldnm` 정상 매핑) |
| **Real Live** | **도로명 주소 검색** | `GET /api/search?query=으뜸로 21&type=address&category=ROAD` | **PASS (HTTP 200)** | 충주시청 으뜸로 21 정상 매핑 (title: '충주시청', road: '충북 충주시 으뜸로 21') |
| **Real Live** | **지번 주소 검색** | `GET /api/search?query=금릉동 700&type=address&category=PARCEL` | **PASS (HTTP 200)** | 충북 충주시 금릉동 700 정상 매핑 (title: '충북 충주시 금릉동 700', 2건 수신) |
| **Real Live** | **좌표 역지오코딩** | `GET /api/reverse?lat=36.9913&lon=127.9259` | **PASS (HTTP 200)** | 소요 시간 240ms. `"충청북도 충주시 으뜸로 21 (충주시청)"`, road/parcel/building/zipCode 정상 수신 |
| **Real Live** | **정적 파일 & 공역 서빙** | `GET /` 및 `GET /data/airspace/airspace.geojson` | **PASS (HTTP 200)** | HTML 및 140개 정적 공역 GeoJSON 데이터 정상 서빙 확인 |
| **Real Live** | **스마트폰 실기기 검증** | 모바일 브라우저 실기기 접속 ➔ 검색 ➔ 마커 표출 | **PASS** | 실제 스마트폰 화면에서 장소 검색 결과 터치 시 지도상에 마커 정상 표시 확인 |

#### 3.2 로컬 단위 및 모의 테스트 (Mock / Unit Tests)

| 구분 | 검증 항목 | 대상 스크립트 | 결과 | 세부 내용 |
| :---: | :--- | :--- | :---: | :--- |
| **Mock Unit** | **Kakao 응답 매핑 & UI 호환** | `scratch/test_kakao_integration.mjs` | **PASS (20/20)** | • 장소 키워드 매핑 7개 필드 전수 일치<br>• 도로명(ROAD) 및 지번(PARCEL) 필터링/폴백 검증<br>• 산간/농촌 지번 단독 지역 역지오코딩 안전 폴백<br>• 프런트엔드 파서(OK, NOT_FOUND, ERROR) 호환 검증 |
| **Server E2E** | **HTTP 엔드포인트 무결성** | `scratch/test_server_http.mjs` | **PASS (13/13)** | • API 키 미설정 시 명확한 500 에러 및 JSON 규격 반환<br>• 검색어 누락/잘못된 type/category 입력 시 400 차단<br>• 유효하지 않은 lat/lon 좌표 입력 시 400 차단<br>• `/api/wfs` 기존 WFS 프록시 레이어 검증 유지 확인 |
| **Security** | **민감 정보 비노출 검증** | `scratch/test_mock_kakao_proxy.mjs` | **PASS** | 에러 응답 JSON, 클라이언트 반환값, 콘솔 로그에 API 키 미포함 확인 |
| **Syntax** | **코드 문법 검사** | `node --check server.js` | **PASS** | 문법 에러 0건 |
| **Whitespace** | **공백/포맷 검사** | `git diff --check` | **PASS** | 포맷 이상 없음 |

---

### 4. 미해결 항목 (Unresolved Issue)

* **스마트폰 실기기 위치 오차 현상**:
  * **관찰 내용**: 실제 스마트폰 기기 환경에서 위치 지정 및 마커 표시를 진행할 때, 의도한 위치와 화면상 표시 위치 간에 위치 오차가 관찰됨.
  * **원칙**: 원인이 규명되기 전까지는 특정 요인으로 단정하지 않음.
  * **향후 조사 대상 가설군**:
    1. 스마트폰 모바일 브라우저의 Geolocation API 좌표 수신 정확도 및 오차 반경(`accuracy`)
    2. 모바일 브라우저 주소창/가상키보드로 인한 Leaflet 뷰포트 리사이즈 및 픽셀 클릭 터치 오프셋
    3. 지도 타일 좌표계 투영 또는 마커 앵커(`iconAnchor`) 설정 오프셋
    4. 고해상도 모바일 디스플레이(DPI / devicePixelRatio) 스케일링 영향

---

### 5. 공역 데이터 검증 영역 구분

* **140개 공역 로드 및 렌더링 표시**: `data/airspace/airspace.geojson`에 정의된 140개 공역 피처가 Leaflet 지도상에 폴리곤으로 로드되어 정상 표시됨을 확인 완료.
* **공역 데이터 최신성 및 판정 정확성 검증**: 국토교통부 AIP 개정 주기(28일) 대비 정적 공역 데이터의 최신성 검증 및 Turf.js 공간판정의 정밀도 검증은 지속적인 데이터 분석 과제로 분리하여 관리함.

---

## 📅 [STEP 3.8] 주소 검색 및 역지오코딩 복구 회귀 테스트 (2026-10-08)

### 1. 테스트 목적
* VWorld Search API 2.0 규격 준수(category=ROAD/PARCEL 전달) 및 역지오코딩 파싱 수정 후, 도로명/지번/장소 검색과 지도 클릭 역지오코딩이 정상 작동하는지 전수 검증.
* 기존 공역 데이터 및 Turf 판정 로직에 회귀 결함이 없는지 확인.

### 2. 테스트 환경
* **OS**: Windows 11
* **Node.js**: v24.16.0
* **서버 포트**: 5500 (`http://localhost:5500`)
* **브라우저**: Chrome (PC 1920×911 및 모바일 에뮬레이션 375×812)
* **Commit**: `ac06dd7`

### 3. 세부 테스트 실행 결과

| 구분 | 검증 항목 | 대상 환경 | 결과 | 세부 비고 |
| :---: | :--- | :---: | :---: | :--- |
| **Server Syntax** | `node --check server.js` | Local | **PASS** | 서버 자바스크립트 문법 무결성 (에러 0건) |
| **Airspace Integrity** | `scratch/test_airspace_geojson.js` | Local | **PASS** | 140개 공역 무결성, 지오메트리 결함 0건 |
| **Turf Safety Logic** | `scratch/test_turf_decision.mjs` | Local | **PASS** | 외부, 비행금지, 비행제한, 관제권, UAS, 원전P61A 6대 판정 100% |
| **API Integration** | 주소 검색 7대 케이스 전수 검증 | Local API | **PASS** | • 한국폴리텍대학 충주캠퍼스 (place 5건)<br>• 충주시 이류면 (place 1건)<br>• 충주시 이류면 충주캠퍼스 (0건 정상 안내)<br>• 세종대로 209 (ROAD 1건)<br>• 태평로1가 31 (PARCEL 5건)<br>• 국원대로 548 (ROAD 5건)<br>• 충주캠퍼스 (place 5건) |
| **API Integration** | 역지오코딩 (37.5665, 126.9780) | Local API | **PASS** | `"서울특별시 중구 태평로1가 31"` 파싱 성공 |
| **API Security** | `/api/search` 잘못된 category/type 방어 | Local API | **PASS** | 허용되지 않은 category 입력 시 `400 Bad Request` 정상 차단 |
| **Browser Live** | 도로명('세종대로 209') 검색 ➔ 선택 ➔ 지도 이동 | Browser (PC) | **PASS** | 결과 목록 표출, 핀 이동, 주소 표시, 공역 판정 실시간 갱신 |
| **Browser Live** | 지번('태평로1가 31') 검색 ➔ 선택 ➔ 지도 이동 | Browser (PC) | **PASS** | 서울시청 표시, 비행금지구역(P73A) 실시간 감지 |
| **Browser Live** | 지도 임의 지점 클릭 ➔ 역지오코딩 연동 | Browser (PC) | **PASS** | 지도 클릭 시 실제 행정주소 추출 및 안내 정상 |
| **Mobile UI** | 모바일 뷰포트(375×812) 검색 및 하단 탭 UX | Mobile Emul | **PASS** | 긴 주소 줄바꿈, 터치 선택, 하단 네비게이션 탭 반응형 정상 |

---

## 📅 [STEP 3.7.3] 140개 핵심 공역 무결성 및 역지오코딩 단위 검증 (2026-10-08)

### 1. 테스트 목적
* 140개 핵심 공역 체계(원전 비행금지구역 10개소 편입, 임시공역 분리) 및 신규 `/api/reverse` 엔드포인트 무결성 검증.
* **Commit**: `82ab717`

### 2. 세부 결과
* **GeoJSON 유효성**: 140개 공역 파싱 정상, 좌표 범위 및 링 닫힘 무결성 PASS.
* **6 Core Airspace Test**: 판정 알고리즘 전원 PASS.
* **보안 검증**: `server.js` 정적 파일 서빙 시 `scratch/`, `scripts/`, `.git/`, `.env` 접근 403 Forbidden 차단 확인.

---

## 📅 [STEP 3-24] 배포 전 전수 회귀 테스트 (2026-09-29)

### 1. 테스트 목적
* Antigravity 독립 환경 및 GitHub/Render 클라우드 배포를 앞두고 기존 로직(드론 검색, 가중치 분류, VWorld 공역 프록시, 로컬스토리지, 보안 헤더 등) 전수 검증.
* **Commit**: `7e50b3c`

### 2. 세부 테스트 실행 결과
* `node --check server.js`: PASS
* `curl -I http://localhost:5500/`: HTTP 200 및 보안 헤더 PASS
* `scratch/test_drone_search.js`: 5개 섹션 전 항목 PASS
* `scratch/test_localstorage_scenarios.js`: 5개 시나리오 복원 PASS
* `scratch/test_vworld_5layers.js`: 프록시 정상 반환 PASS
* `scratch/verify_audit3.js`: 52개 감사 항목 PASS
* `scratch/test_concurrency_and_security.js`: Rate Limit (60회/분) 차단 PASS

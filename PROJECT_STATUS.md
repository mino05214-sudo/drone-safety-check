# 📊 PROJECT STATUS — 드론 안전 체크 (Drone Safety Check)

> **Last Updated**: 2026-10-19
> **Current Commit**: `f4395d1`
> **Deployed Commit**: `f4395d1`
> **Render Deployment**: Deploy succeeded / Live (2026-10-19)
> **Production Smoke Test**: Verified (Kakao Local Search & Reverse Geocode 200 OK, Smartphone Marker Display Verified)
> **Development Phase**: STEP 3.28 (임시 Egress 진단 코드 안전 제거 및 전수 회귀 테스트 완료)
> **Production URL**: https://drone-safety-check.onrender.com

---

## 🤖 AI START HERE

* **프로젝트 목적**: 외부 설치 프로그램 없이 스마트폰 및 PC 브라우저에서 드론 조종자가 단 한 번의 위치 지정으로 4대 핵심 공역, 기상 적합성, 비행 승인 가이드를 1초 만에 확인하는 초경량 Zero-Dependency 웹 서비스.
* **현재 개발 단계**: STEP 3.28 완료 (임시 진단 코드 안전 제거, 전수 회귀 테스트 통과, 문서 동기화 완료).
* **가장 최근 완료 작업**:
  * **STEP 3.28 (임시 진단 코드 정리)**: VWorld 연결 조사를 위해 `server.js`에 임시 추가되었던 `GET /api/egress-diagnostics`, 환경변수 `ENABLE_EGRESS_DIAGNOSTICS`, Rate Limit 라우트 검사, 진단 헬퍼 함수 7개(~280줄) 전면 안전 제거. 기존 핵심 엔드포인트(`/api/search`, `/api/reverse`, `/api/wfs`, 정적 파일 서빙) 100% 정상 작동 유지.
  * **VWorld 연결 진단 사실과 추정 원인 명확화**:
    - *확인된 사실*: Render 배포 환경에서 VWorld 루트 및 `/req/address`는 `ECONNRESET`, `/req/search` 및 `/req/wfs`는 `502 Bad Gateway` 응답 반환 (일반 HTTPS 대조군 `example.com`은 정상 200 OK).
    - *추정 원인*: VWorld 측의 WAF(방화벽) 또는 클라우드 호스팅 IP 대역 필터링 가능성 등으로 추정(단정하지 않고 기술).
  * **STEP 3.25 (Kakao Local API 전환 및 배포)**: 장소명 검색, 도로명/지번 주소 검색, 좌표 역지오코딩을 Kakao Local REST API 프록시로 전환하여 Render 배포 완료 (실서버 라이브 검증 200 OK).
  * **스마트폰 실기기 검증**: 스마트폰 모바일 브라우저에서 검색 결과 마커 표시 확인.
* **현재 가장 중요한 미해결 과제 (Unresolved)**:
  1. **스마트폰 실기기 위치 오차 현상**: 스마트폰 환경에서 위치 지정/마커 표시 시 발생하는 위치 오차 관찰됨 (원인 미확정 상태, 다각도 정밀 조사 필요).
  2. **공역 데이터 검증 영역 구분**: 정적 GeoJSON 140개 공역 '로드 및 UI 렌더링 표시'는 확인되었으나, 국토부 AIP 대비 '공역 데이터 최신성 및 공간판정 정밀도 검증'은 지속 관리 과제로 별도 진행 필요.
* **이번 세션의 Next Action**: 스마트폰 실기기 위치 오차 현상 정밀 계측 및 원인 규명.
* **AI 핵심 협업 규칙**:
  1. **실제 코드 우선**: 이전 대화나 구 문서의 설명을 맹신하지 말고 실제 코드(`server.js`, `index.html`)와 Git log를 기준으로 판단한다.
  2. **Zero-Dependency 원칙 유지**: 외부 npm 라이브러리를 추가하지 않고 Node.js 내장 모듈만을 사용한다.
  3. **비밀정보 보호**: API Key 및 `.env` 값은 어떠한 로그나 문서에도 기록하지 않는다.
  4. **파괴적 Git 명령 금지**: `reset`, `clean`, `force push`는 절대 사용하지 않는다.
  5. **원인 예단 금지**: 위치 오차 등 관찰된 현상은 원인이 규명되기 전까지 특정 요인(지도 투영, GPS, DPI 등)으로 단정하지 않는다.

---

## 📈 CURRENT STATE

| 기능 영역 (Area) | 상태 (Status) | 검증 환경 및 비고 |
| :--- | :---: | :--- |
| **지도 및 시각화 (Map & GIS)** | ✅ VERIFIED | Leaflet 1.9.4 기반 폴리곤/마커 렌더링 정상 (Local + Browser) |
| **140개 공역 로드 및 렌더링** | ✅ VERIFIED | 국토부 AIP 기반 140개 공역 로드 및 지도 레이어 표출 확인 |
| **공역 최신성 및 판정 정밀도** | 🟡 PARTIAL | 런타임 Pip 판정 동작 중이나, AIP 주기별 최신성/정밀도 지속 검증 필요 |
| **주소/장소 검색 (Address Search)** | ✅ VERIFIED | Kakao Local API 전환 — 키워드, 도로명(ROAD), 지번(PARCEL) 실서버 HTTP 200 (Render Live) |
| **좌표 역지오코딩 (Reverse Geocoding)** | ✅ VERIFIED | Kakao Local API 전환 — 지도 클릭/좌표 ➔ 행정주소 자동 추출 실서버 HTTP 200 (Render Live) |
| **실시간 기상 분석 (Weather)** | ✅ VERIFIED | Open-Meteo 연동, 풍속별 위험 등급 및 브리핑 정상 (Local + Browser) |
| **초보자 인허가 가이드 (Permit Guide)** | ✅ VERIFIED | 5대 정적 안전수칙 및 관할 항공청 자동 안내 정상 (Local + Browser) |
| **체크리스트 (Checklist)** | ✅ VERIFIED | `localStorage` 연동 및 비행 전 점검 항목 정상 (Local + Browser) |
| **모바일 반응형 레이아웃 (Mobile UI)** | ✅ VERIFIED | 브라우저 에뮬레이션(375×812) 및 스마트폰 실기기 마커 표출 확인 |
| **스마트폰 위치 정합성 (Mobile Accuracy)** | 🟡 UNRESOLVED | 스마트폰 실기기 테스트 중 위치 오차 관찰됨 (원인 미확정, 후속 조사 예정) |
| **Render 클라우드 배포 (Deployment)** | ✅ VERIFIED | Deploy succeeded / Live (2026-10-19, Commit `f4395d1`) |
| **운영 환경 기능 점검 (Smoke Test)** | ✅ VERIFIED | Render Live URL 상의 주소 검색, 역지오코딩, 정적 공역 서빙 실서버 100% 검증 |
| **Android 네이티브 패키징 (APK/TWA)** | 🔵 PLANNED | PWA / Trusted Web Activity 기반 경량 패키징 예정 |

---

## ✅ VERIFIED (검증 완료 내역)

### 1. Render 프로덕션 실서버 라이브 검증 (Real Live Tests)
* **장소(키워드) 검색**: `GET /api/search?query=충주시청&type=place` ➔ `HTTP 200 OK` (581ms, 15건 실데이터 수신)
* **도로명 검색 (`category=ROAD`)**: `GET /api/search?query=으뜸로 21&type=address&category=ROAD` ➔ `HTTP 200 OK` (충주시청 으뜸로 21 매핑)
* **지번 검색 (`category=PARCEL`)**: `GET /api/search?query=금릉동 700&type=address&category=PARCEL` ➔ `HTTP 200 OK` (충북 충주시 금릉동 700 매핑)
* **좌표 역지오코딩**: `GET /api/reverse?lat=36.9913&lon=127.9259` ➔ `HTTP 200 OK` (240ms, `"충청북도 충주시 으뜸로 21 (충주시청)"`)
* **스마트폰 실기기 검증**: 스마트폰 모바일 브라우저 접속 후 검색 결과 선택 시 지도상 마커 정상 표출 확인

### 2. 로컬 단위 및 모의 테스트 (Mock / Unit Tests)
* **매핑 및 파서 단위 테스트 (`scratch/test_kakao_integration.mjs`)**: 20/20 PASS (키워드/도로명/지번/역지오코딩 및 프런트 파서 호환성)
* **HTTP 서버 엔드포인트 통합 테스트 (`scratch/test_server_http.mjs`)**: 13/13 PASS (파라미터 검증 400 방어, 키 미설정 시 500 방어, WFS 프록시 보존)
* **보안 및 키 비노출 검증 (`scratch/test_mock_kakao_proxy.mjs`)**: PASS (응답 JSON 및 에러 로그에 민감 API 키 비노출)
* **임시 Egress 진단 코드 안전 제거 검증 (STEP 3.28)**:
  - `GET /api/egress-diagnostics`, `ENABLE_EGRESS_DIAGNOSTICS`, Rate Limit 라우트 검사, 헬퍼 함수 7개 전면 제거 완료
  - `node --check server.js` 문법 검사 통과 (0 errors)
  - `git diff --check` 공백/포맷 검사 통과 (0 errors)
  - 단위/통합/보안 회귀 테스트 전수 통과 (Kakao 검색/주소/역지오코딩 및 VWorld WFS 프록시 정상 유지)

---

## 🟡 UNRESOLVED (미해결 항목 및 지속 과제)

1. **스마트폰 실기기 위치 오차 현상 (미해결)**
   * *관찰된 현상*: 실제 스마트폰 기기에서 위치 선택 및 마커 표시를 진행할 때 의도한 위치와 화면상 표시 위치 간에 오차가 관찰됨.
   * *주의 사항*: 원인을 확인하기 전에는 특정 요인(모바일 GPS 정밀도, 브라우저 뷰포트/터치 오프셋, Leaflet 타일 투영, 고해상도 DPI 보정 등)으로 원인을 단정하지 않는다.
   * *향후 계획*: 오차 발생 조건(GPS 수신 vs 주소 검색 핀 vs 지도 클릭 핀)별 좌표와 픽셀 오프셋을 정량적으로 계측하여 원인을 규명한다.
2. **공역 데이터 검증 영역 구분 (지속 과제)**
   * *구분 원칙*: 정적 GeoJSON 140개 공역의 '정상 로드 및 Leaflet 지도상 레이어 표시'는 검증 완료되었으나, 국토교통부 AIP 최신 개정판(28일 주기) 대비 '데이터 최신성 및 공간판정 정밀도 검증'은 별개의 분석 과제로 분리하여 관리한다.

---

## ⚠️ KNOWN ISSUES

1. **Render 무료 티어 Cold Start 지연 (Low)**
   * *증상*: 15분 이상 미접속 시 인스턴스 Sleep으로 첫 요청 시 30~50초 로딩 지연 발생 가능.
2. **복합 행정구역+기관명 검색어의 색인 한계 (Low)**
   * *증상*: "충주시 이류면 충주캠퍼스"처럼 행정구역명과 기관명을 길게 합성해 입력하면 검색 결과가 0건일 수 있음.
   * *현재 대응*: "검색 결과가 없습니다" 및 2글자 이상 입력 안내 가이드 제공.

---

## 🎯 NEXT ACTION

**NEXT ACTION**:
`스마트폰 실기기 환경에서 관찰된 위치 오차 현상에 대해 위치 지정 방식별(GPS / 주소 검색 / 지도 클릭) 정밀 오차 계측 및 원인 분석 수행`

---

## 💡 IMPORTANT DECISIONS

1. **Kakao Local REST API 프록시 전환 (STEP 3.24 ~ 3.25)**
   * *결정*: 장소 검색, 도로명/지번 주소 검색, 좌표 역지오코딩 백엔드를 VWorld에서 Kakao Local REST API(`dapi.kakao.com`)로 전면 전환.
   * *이유*: Render 배포 환경에서 VWorld 엔드포인트가 `ECONNRESET` 및 `502 Bad Gateway` 응답을 반환하는 문제가 발생함에 따라(원인은 VWorld WAF/게이트웨이 차단 등으로 추정), 클라우드 환경에서도 안정적인 200ms대 응답을 보장하는 Kakao Local REST API로 전환.
2. **기존 프런트엔드(`index.html`) 계약 100% 보존**
   * *결정*: `server.js` 프록시 레벨에서 Kakao 응답을 기존 VWorld 규격(`title`, `point.x`, `point.y`, `address.road`, `address.parcel`, `address.bldnm`)으로 완벽 변환.
   * *이유*: 프런트엔드 검색 순차 체인(place ➔ ROAD ➔ PARCEL)과 UI 레이아웃의 회귀 결함 원천 차단.
3. **4대 정규 공역 + 임시공역 분리 (STEP 3.7.3)**
   * *결정*: 정적 GeoJSON에는 140개 정규 공역만 탑재하고, 임시공역(TEMPORARY)은 드론원스톱 공식 확인 카드로 분리.
4. **중앙 집중형 `setLocation()` 파이프라인**
   * *결정*: 주소 검색, 지도 클릭, GPS, 수동 좌표 입력 모두 `setLocation()` 단일 진입점을 통해 위치, 날씨, 공역, 진단을 일괄 동기화.

---

## 🗺️ DOCUMENT MAP

| 문서명 | 주요 역할 | 대상 독자 |
| :--- | :--- | :--- |
| [README.md](README.md) | 프로젝트 소개, 주요 기능 요약, 로컬 실행 및 Render 배포 가이드 | 일반 사용자, 외부 개발자 |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | **AI Handoff 기준점**, 현재 상태, 검증 목록, 미해결 과제, Next Action | AI 에이전트, 메인 개발자 |
| [PROJECT_MASTER.md](PROJECT_MASTER.md) | 시스템 아키텍처, 기술 스택 규격, 데이터 흐름, 핵심 설계 결정(Decisions) | 아키텍트, 유지보수자 |
| [CHANGELOG.md](CHANGELOG.md) | STEP 단위 변경 이력 및 커밋 로그 요약 | 전체 개발자 |
| [TEST_HISTORY.md](TEST_HISTORY.md) | 로컬/브라우저/모바일/배포 전수 검증 이력 누적 아카이브 | QA, 테스트 검증자 |

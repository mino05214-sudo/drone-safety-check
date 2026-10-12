# 📊 PROJECT STATUS — 드론 안전 체크 (Drone Safety Check)

> **Last Updated**: 2026-10-08
> **Current Commit**: `ac06dd7`
> **Deployed Commit**: `ac06dd7`
> **Render Deployment**: Deploy succeeded / Live (2026-10-08)
> **Production Smoke Test**: Needs Verification
> **Development Phase**: STEP 3.8 (Address Search & Reverse Geocode Fixes Complete)
> **Production URL**: https://drone-safety-check.onrender.com

---

## 🤖 AI START HERE

* **프로젝트 목적**: 외부 설치 프로그램 없이 스마트폰 및 PC 브라우저에서 드론 조종자가 단 한 번의 위치 지정으로 4대 핵심 공역, 기상 적합성, 비행 승인 가이드를 1초 만에 확인하는 초경량 Zero-Dependency 웹 서비스.
* **현재 개발 단계**: STEP 3.8 완료 (주소 검색 3단계 체인 및 역지오코딩 복구 완료).
* **가장 최근 완료 작업**: Commit `ac06dd7` — VWorld Search API 2.0 규격 대응(category=ROAD/PARCEL 전달), 도로명/지번/장소 순차 검색 fallback 구축, `/api/reverse` 응답 파싱 복구.
* **현재 가장 중요한 과제**: 배포 환경(Render Production) 및 실제 스마트폰 기기에서의 실기 최종 스모크 검증.
* **이번 세션의 Next Action**: 실제 스마트폰 모바일 브라우저(Chrome/Safari) 환경에서 위치 지정 및 검색 기능 실기 동작 점검.
* **AI 핵심 협업 규칙**:
  1. **실제 코드 우선**: 이전 대화나 구 문서의 설명을 맹신하지 말고 실제 코드(`server.js`, `index.html`)와 Git log를 기준으로 판단한다.
  2. **Zero-Dependency 원칙 유지**: 외부 npm 라이브러리를 추가하지 않고 Node.js 내장 모듈만을 사용한다.
  3. **비밀정보 보호**: API Key 및 `.env` 값은 어떠한 로그나 문서에도 기록하지 않는다.
  4. **파괴적 Git 명령 금지**: `reset`, `clean`, `force push`는 절대 사용하지 않는다.

---

## 📈 CURRENT STATE

| 기능 영역 (Area) | 상태 (Status) | 검증 환경 및 비고 |
| :--- | :---: | :--- |
| **지도 및 시각화 (Map & GIS)** | ✅ VERIFIED | Leaflet 1.9.4 기반 폴리곤/마커 렌더링 정상 (Local + Browser) |
| **핵심 공역 안전 판정 (Airspace)** | ✅ VERIFIED | 140개 국토부 AIP 기반 Turf.js 로컬 판정 100% 통과 (Local Unit Test) |
| **주소/장소 검색 (Address Search)** | ✅ VERIFIED | 장소 ➔ 도로명(ROAD) ➔ 지번(PARCEL) 순차 체인 통과 (Local + Browser) |
| **좌표 역지오코딩 (Reverse Geocoding)** | ✅ VERIFIED | 지도 클릭/위치 선택 시 행정주소 자동 추출 정상 (Local + Browser) |
| **실시간 기상 분석 (Weather)** | ✅ VERIFIED | Open-Meteo 연동, 풍속별 위험 등급 및 브리핑 정상 (Local + Browser) |
| **초보자 인허가 가이드 (Permit Guide)** | ✅ VERIFIED | 5대 정적 안전수칙 및 관할 항공청 자동 안내 정상 (Local + Browser) |
| **체크리스트 (Checklist)** | ✅ VERIFIED | `localStorage` 연동 및 비행 전 점검 항목 정상 (Local + Browser) |
| **모바일 반응형 레이아웃 (Mobile UI)** | 🟡 NEEDS VERIFICATION | 브라우저 에뮬레이션(375×812) 통과, 실제 기기 실기 확인 필요 |
| **실기기 GPS 연동 (Native GPS)** | 🟡 NEEDS VERIFICATION | 브라우저 Geolocation API 구현 완료, 실제 스마트폰 GPS 오차 확인 필요 |
| **Render 클라우드 배포 (Deployment)** | ✅ VERIFIED | Deploy succeeded / Live (2026-10-08, Commit `ac06dd7`) |
| **운영 환경 기능 점검 (Smoke Test)** | 🟡 NEEDS VERIFICATION | Render Live URL 상의 주소 검색, 지도, 공역 갱신 실기 검증 필요 |
| **Android 네이티브 패키징 (APK/TWA)** | 🔵 PLANNED | PWA / Trusted Web Activity 기반 경량 패키징 예정 |

---

## ✅ VERIFIED

* **Address Search** — `VERIFIED LOCAL + BROWSER` (장소명, 순수 도로명 '세종대로 209', '국원대로 548', 지번 '태평로1가 31' 전수 통과)
* **Reverse Geocoding** — `VERIFIED LOCAL + BROWSER` (`/api/reverse` ➔ VWorld `getAddress` ➔ 행정주소 추출 및 지도 클릭 연동)
* **Airspace Turf Judgment** — `VERIFIED LOCAL` (6 Core Test: 외부, 비행금지구역, 비행제한구역, 관제권, UAS, 원전P61A 100% PASS)
* **Airspace GeoJSON Integrity** — `VERIFIED LOCAL` (140개 공역 무결성, 지오메트리 결함 0건 전수 통과)
* **Mobile Responsive UI** — `VERIFIED BROWSER EMULATION` (375×812 뷰포트에서 검색바, 지도, 브리핑 카드, 하단 탭 레이아웃 정상)

---

## 🟡 NEEDS VERIFICATION

1. **실제 스마트폰(Android/iPhone) 브라우저 실기 점검**: 에뮬레이션 외에 실제 모바일 터치 및 가상 키보드 가림 현상 확인.
2. **실제 현장 GPS 수신 정확도**: 빌딩 숲 또는 음영 지역에서의 Geolocation API 정확도(`accuracy`) 반응 확인.
3. **Render Production Live Smoke Test**: 실제 배포 도메인(`https://drone-safety-check.onrender.com`) 접속 시 환경변수(`TRUST_PROXY`) 및 WFS 응답 최종 확인.

---

## ⚠️ KNOWN ISSUES

1. **복합 행정구역+기관명 검색어의 색인 한계 (Low)**
   * *증상*: "충주시 이류면 충주캠퍼스"처럼 행정구역명과 기관명을 길게 합성해 입력하면 VWorld Open API 자체의 형태소 색인 한계로 `NOT_FOUND` 반환.
   * *현재 대응*: "검색 결과가 없습니다" 및 2글자 이상 입력 안내 가이드 제공.
2. **Render 무료 티어 Cold Start 지연 (Low)**
   * *증상*: 15분 이상 미접속 시 인스턴스 Sleep으로 첫 요청 시 30~50초 로딩 지연 발생 가능.

---

## 🎯 NEXT ACTION

**NEXT ACTION**:
`스마트폰 실기기(모바일 Chrome/Safari)에서 Render Production URL 접속 후 주소 검색 및 GPS 위치 지정 실기 Smoke Test 수행`
*(완료 조건: 실제 스마트폰 화면에서 검색 결과 터치 시 지도가 정상 이동하고 비행 안전진단 카드가 갱신됨을 확인)*

---

## 🔮 NEAR-TERM

1. **Render Production 환경변수 점검**: 대시보드에 `TRUST_PROXY=true` 등록 여부 확인하여 다중 접속 시 429 차단 방지.
2. **모바일 오프라인 안내 보강**: 네트워크 단절 시 캐시된 140개 공역 기반 오프라인 안전진단 안내 문구 최적화.
3. **PWA 매니페스트 및 홈 화면 추가**: 모바일 홈 화면 바로가기 아이콘 및 웹앱 매니페스트 설정.

---

## 📋 BACKLOG

* **Android APK / TWA 배포**: Google Play Store 등록을 위한 Trusted Web Activity 래핑.
* **비행 기록 내보내기/불러오기**: `localStorage` 비행 로그의 JSON/CSV 내보내기 기능.
* **공역 데이터 자동 업데이트 파이프라인**: 국토부 AIP 개정 주기(28일)에 맞춘 GeoJSON 검증 및 갱신 자동화 스크립트 고도화.
* **드론 시뮬레이터 연동 (Idea)**: 비행 전 가상 3D 뷰어 또는 비행 궤적 시뮬레이션 연계.
*(※ Backlog가 방대해질 경우 차후 `IDEAS.md`로 분리 검토)*

---

## 🚫 DO NOT DO NOW

* **검증되지 않은 외부 npm 패키지 도입 금지**: Zero-Dependency(내장 모듈) 원칙을 훼손하지 않는다.
* **TEMPORARY 공역의 무분별한 정적 GeoJSON 편입 금지**: 임시공역은 변동성이 심하므로 공식 드론원스톱 실시간 링크 카드로 유지한다.
* **법적 효력 보증 문구 사용 금지**: 본 앱은 사전 안전 참고용이며, 공식 비행 승인은 반드시 드론원스톱을 통해야 함을 명시한다.
* **매 세션마다 프로젝트 전체 재분석 금지**: 본 `PROJECT_STATUS.md` 문서를 시작점으로 삼아 즉시 다음 작업에 착수한다.

---

## 💡 IMPORTANT DECISIONS

1. **4대 정규 공역 + 임시공역 분리 (STEP 3.7.3)**
   * *결정*: 정적 GeoJSON에는 140개 정규 공역(비행금지 14, 제한 58, 관제권 20, UAS 48)만 탑재하고, 임시공역(TEMPORARY)은 드론원스톱 공식 확인 카드로 분리.
   * *이유*: 수시로 변경되는 임시공역을 정적 파일에 고정할 경우 발생하는 오안내 위험 방지.
2. **주소 검색 3단계 지능형 순차 Fallback (STEP 3.8)**
   * *결정*: 1차 `place` ➔ 2차 `address (ROAD)` ➔ 3차 `address (PARCEL)` 순차 요청.
   * *이유*: 도로명주소 및 지번주소 검색 누락을 방지하면서 불필요한 동시 다중 API 호출을 최소화.
3. **중앙 집중형 `setLocation()` 파이프라인**
   * *결정*: 주소 검색, 지도 클릭, GPS, 수동 좌표 입력 모두 `setLocation()` 단일 진입점을 통해 위치, 날씨, 공역, 진단을 일괄 동기화.
   * *이유*: 위치 입력 방식에 따른 상태 불일치(Stale State) 및 경합 조건 원천 차단.

---

## 🗺️ DOCUMENT MAP

| 문서명 | 주요 역할 | 대상 독자 |
| :--- | :--- | :--- |
| [README.md](README.md) | 프로젝트 소개, 주요 기능 요약, 로컬 실행 및 Render 배포 가이드 | 일반 사용자, 외부 개발자 |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | **AI Handoff 기준점**, 현재 상태, 검증 목록, Next Action, 금지 사항 | AI 에이전트, 메인 개발자 |
| [PROJECT_MASTER.md](PROJECT_MASTER.md) | 시스템 아키텍처, 기술 스택 규격, 데이터 흐름, 핵심 설계 결정(Decisions) | 아키텍트, 유지보수자 |
| [CHANGELOG.md](CHANGELOG.md) | STEP 단위 변경 이력 및 커밋 로그 요약 | 전체 개발자 |
| [TEST_HISTORY.md](TEST_HISTORY.md) | 로컬/브라우저/모바일/배포 전수 검증 이력 누적 아카이브 | QA, 테스트 검증자 |

---

## 🔄 DOCUMENTATION SYNC (구 문서와의 차이점 정리)

* **5대 공역 vs 4대 런타임 공역**: 구 문서(`README.md`, `PROJECT_MASTER.md`)의 "5대 공역 실시간 조회"는 STEP 3.7.3 이후 "4대 핵심 공역 정밀 판정 + 임시공역 드론원스톱 실시간 확인 카드 분리" 체계로 진화함.
* **역지오코딩 엔드포인트**: `server.js`에 `/api/reverse`가 정식 추가되어 지도 클릭 시 행정주소를 자동 매핑함.
* **VWorld Search API category 규격**: `server.js`의 `/api/search`가 `category=ROAD/PARCEL`을 지원하도록 개편됨.

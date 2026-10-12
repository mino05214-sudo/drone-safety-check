# 🧪 테스트 및 품질 검증 이력서 (TEST_HISTORY)

본 문서는 프로젝트의 기능 무결성, 보안, 배포 적합성을 검증한 테스트 실행 결과 기록입니다.

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

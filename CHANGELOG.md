# 📝 변경 이력서 (CHANGELOG)

모든 주요 변경 사항과 배포 버전 기록입니다.

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

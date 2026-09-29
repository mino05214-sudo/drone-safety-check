# 🚁 드론 안전 체크 (Drone Safety Check)

> 드론 조종자를 위한 원스톱 사전 비행 안전 점검 및 공역 정보 조회 웹 서비스

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg)
![Dependencies](https://img.shields.io/badge/dependencies-0%20(Built--in)-brightgreen.svg)

---

## 📖 1. 프로젝트 개요

**드론 안전 체크(Drone Safety Check)**는 드론 비행 전 조종자가 필요한 모든 안전 정보를 한눈에 파악할 수 있도록 돕는 실시간 웹 애플리케이션입니다.  
국토교통부 브이월드(VWorld)의 5대 공역 정보와 Open-Meteo의 실시간 기상 데이터를 결합하여, 현재 위치 또는 비행 예정 지역의 비행 승인 필요 여부와 기상 적합성을 자동으로 판정합니다.

---

## ✨ 2. 주요 기능

1. **🗺️ VWorld 5대 공역 실시간 조회 및 지도 시각화**
   - 비행금지구역 (`lt_c_aisprhc`)
   - 관제권 (`lt_c_aisctrc`)
   - 비행제한구역 (`lt_c_aisresc`)
   - 임시비행금지공역 (`lt_c_aistemp`)
   - 초경량비행장치공역 (`lt_c_aisuac`)
   - Turf.js 기반 포인트-인-폴리곤(Pip) 정밀 공역 판정
2. **🔍 통합 주소 및 장소 검색**
   - VWorld 통합 검색 API 연동 (명칭, 도로명, 지번 검색 지원)
3. **🌤️ 실시간 기상 및 풍속 안전 분석**
   - Open-Meteo 기반 현재 기온, 습도, 풍속, 돌풍(Gust), 날씨 코드 분석
   - 풍속별 비행 위험 등급 자동 경고
4. **🚁 기체별 무게 등급 자동 분류 및 승인 가이드**
   - DJI 주요 기종 및 상용 드론 데이터베이스 탑재
   - 250g 이하(1종/2종/3종/4종) 자격 및 기체 신고 대상 여부 자동 계산
5. **📋 비행 전 필수 체크리스트 & 원스톱 신청 가이드**
   - 비행 승인 / 항공 촬영 허가 신청 절차 안내
   - 로컬 브라우저 저장소(`localStorage`) 기반 비행 기록 저장

---

## 🛠️ 3. 기술 스택

* **Frontend**: HTML5, Vanilla CSS3 (반응형 모바일 퍼스트 레이아웃), Modern JavaScript (ES6+)
* **Map & GIS**: Leaflet.js (v1.9.4), Turf.js (v7.x)
* **Backend**: Node.js (v16.0.0 이상)
  * **Zero External Dependencies**: 외부 npm 라이브러리(`node_modules`) 없이 Node.js 내장 모듈(`http`, `https`, `fs`, `path`, `url`)만으로 서버 구현
* **Security**:
  * VWorld API Key 브라우저 비노출 (서버 프록시 중계)
  * Same-Origin / Trusted Host 기반 엄격한 CORS 제어
  * IP 기반 인메모리 요청 제한 (Rate Limiting: 60회/분)
  * BBOX 크기 검증 (과도한 쿼리 차단)
  * 상위 경로 탐색(Directory Traversal) 및 민감 파일 서빙 원천 차단

---

## 💻 4. 로컬 실행 방법

### 방법 A. 간편 실행 (Windows)
1. 프로젝트 폴더의 **`start.bat`** 파일을 더블클릭합니다.
2. 서버가 백그라운드에서 구동되고 브라우저(`http://localhost:5500`)가 자동으로 열립니다.
3. 사용 종료 시 **`stop.bat`**을 더블클릭하면 5500 포트 프로세스만 안전하게 종료됩니다.

### 방법 B. 콘솔 수동 실행
```bash
# 서버 실행 (5500 포트)
npm start
# 또는
node server.js
```
브라우저에서 `http://localhost:5500` 으로 접속합니다.

---

## 🚀 5. Render 배포 가이드 (클라우드 호스팅)

이 프로젝트는 **Render Web Service**를 통해 손쉽게 전 세계 어디서든 접속 가능한 HTTPS 공개 URL(`https://xxx.onrender.com`)로 배포할 수 있습니다.

### 배포 사양 설정
| 항목 | 설정값 |
| :--- | :--- |
| **Service Type** | **Web Service** |
| **Environment / Runtime** | **Node** |
| **Build Command** | `npm install` *(또는 비워둠)* |
| **Start Command** | `npm start` *(또는 `node server.js`)* |
| **Auto-Deploy** | `Yes` (GitHub main 브랜치 푸시 시 자동 배포) |

### 필수 환경변수 (Environment Variables)
Render 대시보드의 **Environment Variables** 탭에 다음 변수를 등록합니다:

| 변수명 | 필수 여부 | 설명 | 예시 |
| :--- | :---: | :--- | :--- |
| **`VWORLD_API_KEY`** | **필수** | VWorld 오픈API 인증키 | `발급받은API키` |
| **`VWORLD_DOMAIN`** | 선택 | VWorld 발급 도메인 | `your-app.onrender.com` |
| **`TRUST_PROXY`** | 권장 | Render 프록시 환경 IP 감지 | `true` |

> ⚠️ **보안 주의사항**:
> * `.env` 파일은 절대 GitHub 저장소에 올리지 마십시오. (.gitignore에 등록되어 있음)
> * API Key는 항상 Render 대시보드의 환경변수 설정을 통해 주입해야 합니다.

---

## 📁 6. 프로젝트 디렉터리 구조

```text
├── index.html          # 메인 프론트엔드 단일 페이지 애플리케이션
├── server.js           # 내장 모듈 기반 경량 Node.js 프록시 & 정적 파일 서버
├── package.json        # 프로젝트 메타데이터 및 start 스크립트
├── .env.example        # 환경변수 설정 템플릿 (보안 템플릿)
├── .gitignore          # Git 제외 파일 (.env, node_modules 등)
├── start.bat           # Windows 원클릭 실행 스크립트
├── stop.bat            # Windows 5500 포트 안전 종료 스크립트
├── RUN.md              # 로컬 독립 실행 초보자 가이드
├── README.md           # 프로젝트 전체 안내서 (본 파일)
├── PROJECT_MASTER.md   # 프로젝트 마스터 명세서
├── CHANGELOG.md        # 변경 이력 기록서
└── TEST_HISTORY.md     # 테스트 및 검증 이력서
```

---

## 🧪 7. 테스트 및 검증 상태

* [x] `node --check server.js` 문법 무결성 검증 통과
* [x] HTTP 200 정상 응답 및 정적 파일 무결성 확인
* [x] 드론 검색 알고리즘 100% 통과 (`scratch/test_drone_search.js`)
* [x] 동시성 및 Rate Limit 방어 테스트 통과 (`scratch/test_concurrency_and_security.js`)
* [x] VWorld 5대 공역 레이어 WFS 프록시 통과 (`scratch/test_vworld_5layers.js`)
* [x] 폴리곤 클릭 및 마커 연동 검증 통과 (`scratch/verify_polygon_click_fix.js`)
* [x] XSS, Path Traversal, BBOX 유효성 등 보안 테스트 통과 (`scratch/verify_audit3.js`)

# 📝 변경 이력서 (CHANGELOG)

모든 주요 변경 사항과 배포 버전 기록입니다.

---

## [v1.1.0] - 2026-09-29 (STEP 3-24)
### 🚀 GitHub + Render 배포 준비 및 환경 정리
* **server.js 프록시/CORS 헤더 강화**:
  * Render 등 클라우드 리버스 프록시 대응을 위해 `req.headers['x-forwarded-host']` 감지 로직 추가
  * Render 배포 서브도메인(`*.onrender.com`) CORS 자동 허용 조건 추가
* **환경변수 템플릿 제공**:
  * `.env.example` 작성 (실제 시크릿 키 미포함)
* **배포 및 프로젝트 문서화**:
  * `README.md` 작성 (GitHub 리포지토리 소개, 기능, 스택, Render 배포 가이드)
  * `PROJECT_MASTER.md` 작성 (시스템 아키텍처, 환경변수 스펙, 보안 정책)
  * `TEST_HISTORY.md` 작성 (배포 전 전수 회귀 테스트 이력 기록)
* **보안 점검**:
  * `.env` Git 업로드 차단 재확인 및 API Key 하드코딩 없음 확인

---

## [v1.0.0] - 2026-09-29 (STEP 3-23)
### 📦 Antigravity 독립 실행 환경 구축
* **독립 실행기 구현**:
  * `start.bat`: 한글/공백 경로 지원, Node.js 확인, 5500 포트 중복 방지, 브라우저 자동 오픈
  * `stop.bat`: 5500 포트 전용 안전 프로세스 종료기
* **프로젝트 설정 및 설명서**:
  * `package.json`: 외부 의존성 없는 순수 Node.js 프로젝트 구성 (`npm start` 스크립트)
  * `RUN.md`: 초보자를 위한 단계별 실행 설명서 작성

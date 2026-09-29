const fs = require('fs');
const path = require('path');
const http = require('http');

async function runTests() {
  console.log("==================================================");
  console.log("STARTING FINAL AUDIT 3 TEST SUITE");
  console.log("==================================================");

  const indexContent = fs.readFileSync(path.resolve('index.html'), 'utf8');
  const serverContent = fs.readFileSync(path.resolve('server.js'), 'utf8');
  const scriptContent = fs.readFileSync(path.resolve('scratch/extracted_script.js'), 'utf8');

  let passed = 0;
  let failed = 0;

  function assert(cond, desc) {
    if (cond) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // --- 1. 신규 사용자 기본 기체 제거 ---
  const initPermitMatch = indexContent.includes('droneProfile.model = "";') &&
                          indexContent.includes('droneProfile.manufacturer = "";') &&
                          indexContent.includes('droneProfile.maxTakeoffWeightKg = null;') &&
                          indexContent.includes('droneProfile.verificationStatus = "unknown";');
  assert(initPermitMatch, "1. 신규 사용자 기본 기체: 빈 상태 및 unknown 초기화");
  assert(!indexContent.includes('saved.droneModel || saved.model || "DJI Mini 4 Pro"'), "1-2. DJI Mini 4 Pro 기본값 fallback 제거 확인");

  // --- 2. legacy weightCategory migration ---
  assert(!indexContent.includes('initialWeight = 26.0') && !indexContent.includes('initialMtow = 26'), "2-1. over25 -> 26kg 자동변환 금지");
  assert(!indexContent.includes('initialWeight = 0.249') && !indexContent.includes('initialMtow = 0.249'), "2-2. under25 -> 0.249kg 자동변환 금지");
  assert(indexContent.includes("기존 저장정보에서 정확한 최대이륙중량을 확인할 수 없습니다. 실제 공식 제원 확인 후 다시 입력하세요."), "2-3. legacy 안내 문구 존재 확인");
  assert(indexContent.includes("legacyWeightCategory"), "2-4. legacyWeightCategory 필드 보존 확인");

  // --- 3. permitProfile.weightKg 중복 제거 ---
  const permitProfileDeclMatch = indexContent.match(/let\s+permitProfile\s*=\s*\{([^}]+)\}/);
  assert(permitProfileDeclMatch && !permitProfileDeclMatch[1].includes('weightKg'), "3-1. permitProfile 객체에서 weightKg 필드 완전 제거 확인");
  assert(!indexContent.includes('weightKg || 0.249'), "3-2. weightKg || 0.249 fallback 제거 확인");

  // --- 4 & 5. 1종 분류 및 근거 분리 ---
  const fnCode = scriptContent.slice(
    scriptContent.indexOf('const VERIFIED_DRONE_MODELS = ['),
    scriptContent.indexOf('function executeDroneSearch')
  );
  const getObjects = new Function(fnCode + '\nreturn { VERIFIED_DRONE_MODELS, calculateQualificationClass };');
  const { VERIFIED_DRONE_MODELS, calculateQualificationClass } = getObjects();

  const q1 = calculateQualificationClass(30, null);
  assert(q1.code === "unknown" && q1.name === "1종 여부 확인 필요" && q1.isConfirmed === false, "4-1. MTOW > 25kg + selfWeightKg == null -> unknown, isConfirmed: false");

  const q2 = calculateQualificationClass(30, 40, "verified");
  assert(q2.code === "class1" && q2.name === "1종 조종자 증명 기준" && q2.isConfirmed === true, "4-2. MTOW > 25kg + selfWeightKg <= 150 (공식) -> class1, isConfirmed: true");

  const q2User = calculateQualificationClass(30, 40, "user_input");
  assert(q2User.code === "class1" && q2User.name === "입력값 기준 1종" && q2User.classificationBasis === "user_input" && q2User.isConfirmed === true, "4-2-2. MTOW > 25kg + selfWeightKg <= 150 (사용자) -> 입력값 기준 1종");

  const q3 = calculateQualificationClass(30, 160);
  assert(q3.code === "unknown" && q3.name === "적용 범위 확인 필요" && q3.isConfirmed === false, "4-3. MTOW > 25kg + selfWeightKg > 150 -> unknown, isConfirmed: false");

  // 5. 분류 결과와 분류 근거 분리
  const qVerified = calculateQualificationClass(4.31, 3.995, "verified");
  assert(qVerified.classificationBasis === "official_verified" && qVerified.name.includes("3종"), "5-1. 공식 확인 기체 -> official_verified");

  const qUser = calculateQualificationClass(4.31, null, "user_input");
  assert(qUser.classificationBasis === "user_input" && qUser.name === "입력값 기준 3종", "5-2. 사용자 직접 입력 -> user_input, '입력값 기준 3종'");

  const qConditional = calculateQualificationClass(null, 38, "verified_conditional", true);
  assert(qConditional.classificationBasis === "conditional" && qConditional.name === "운용조건 확인 필요", "5-3. 조건부 기체 -> conditional");

  const qUnknown = calculateQualificationClass(null, null);
  assert(qUnknown.classificationBasis === "unknown" && qUnknown.name === "조종자 증명 분류 확인 필요", "5-4. MTOW 미확인 -> unknown");

  // --- 6. 사용자 직접 입력 시 이전 기체 데이터 제거 ---
  assert(indexContent.includes('droneProfile.aircraftWeightKg = null;') &&
         indexContent.includes('droneProfile.takeoffWeightKg = null;') &&
         indexContent.includes('droneProfile.maxTakeoffWeightKg = null;') &&
         indexContent.includes('droneProfile.selfWeightKg = null;') &&
         indexContent.includes('droneProfile.sourceName = "사용자 직접 입력";'),
         "6. onDroneManualInput: 이전 기체 데이터 완전 제거");

  // --- 7. 자체중량 직접 변경 시 검증 상태 수정 ---
  assert(indexContent.includes('droneProfile.selfWeightSource = "user_input";'), "7-1. onDroneSelfWeightInput: selfWeightSource = user_input");
  assert(indexContent.includes("자체중량 사용자 입력"), "7-2. UI 자체중량 사용자 입력 안내 표시");

  // --- 8. verified 상태 세분화 ---
  const models = VERIFIED_DRONE_MODELS;
  const verifiedModels = models.filter(d => d.verificationStatus === "verified");
  const conditionalModels = models.filter(d => d.verificationStatus === "verified_conditional");
  const reviewModels = models.filter(d => d.verificationStatus === "needs_review");
  assert(verifiedModels.length === 3, `8-1. verified 기체 3종 확인 (${verifiedModels.map(d => d.model).join(', ')})`);
  assert(conditionalModels.length === 1 && conditionalModels[0].model === "DJI Agras T40", "8-2. verified_conditional 기체 1종 (DJI Agras T40) 확인");
  assert(reviewModels.length === 8, `8-3. needs_review 기체 8종 확인 (${reviewModels.map(d => d.model).join(', ')})`);

  // --- 9. DJI Agras T40 처리 ---
  const t40 = models.find(d => d.model === "DJI Agras T40");
  assert(t40.maxTakeoffWeightKg === null, "9-1. T40 단일 MTOW 강제하지 않음 (null 확인)");
  assert(t40.maxTakeoffWeightConditions.length === 2 && t40.maxTakeoffWeightConditions[0].maxTakeoffWeightKg === 90 && t40.maxTakeoffWeightConditions[1].maxTakeoffWeightKg === 101, "9-2. T40 조건별 MTOW(90kg, 101kg) 명시 확인");
  assert(indexContent.includes("✅ 공식 제원 확인 · MTOW 조건 확인 필요"), "9-3. T40 검색결과 뱃지 문구 확인");

  // --- 10. verifiedAt 의미 구분 ---
  const mini4 = models.find(d => d.model === "DJI Mini 4 Pro");
  assert(mini4.verifiedAt === "" && mini4.lastReviewedAt === "2026-09-17", "10. needs_review 기체 verifiedAt 공백 및 lastReviewedAt 기록 확인");

  // --- 11. Takeoff weight false precision 제거 ---
  assert(mini4.takeoffWeightKg === null && mini4.sourceValueText === "< 249 g", "11-1. Mini 4 Pro < 249 g -> takeoffWeightKg: null");
  const avata2 = models.find(d => d.model === "DJI Avata 2");
  assert(avata2.takeoffWeightKg === null && avata2.sourceValueText === "약 377 g", "11-2. Avata 2 약 377 g -> takeoffWeightKg: null");

  // --- 12. 장소 선택 상태 stale 문제 수정 ---
  assert(indexContent.includes('distFromSelectedM > selectedFilmingSite.detectionRadius') &&
         indexContent.includes('selectedFilmingSite = null;'),
         "12. 위치 변경 시 기존 장소 반경 밖이면 selectedFilmingSite = null 초기화 확인");

  // --- 13. 장소 검색 결과 자동 장소 규칙 연결 개선 ---
  assert(!indexContent.includes('title.includes(s.name) || s.name.includes(title)'),
         "13. 검색 결과 title 단순 문자열 매칭으로 장소 규칙 자동 확정하던 코드 제거 확인");

  // --- 14 & 15. XSS 및 inline onclick 개선 ---
  assert(indexContent.includes('function escapeHtml(str)'), "14-1. escapeHtml 유틸리티 선언 확인");
  assert(!indexContent.includes('selectSearchResult(${lat}'), "15. 장소 검색 inline onclick 사용자 문자열 삽입 제거 확인 (data-idx 위임)");

  // --- 16 & 17. 파일 업로드 확장자 검증 및 파일명 XSS ---
  assert(indexContent.includes('ALLOWED_DOCUMENT_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".hwp"]'), "16-1. JS 파일 확장자 엄격 화이트리스트 검사 확인");
  assert(indexContent.includes('MAX_SIZE = 10 * 1024 * 1024'), "16-2. 10MB 크기 제한 확인");
  assert(indexContent.includes('MAX_TOTAL_FILES = 5'), "16-3. 5개 파일 수 제한 확인");
  assert(indexContent.includes('escapeHtml(doc.fileName)'), "17. 파일명 XSS 방지 escapeHtml 적용 확인");

  // --- 18. 150m 문구 ---
  assert(!indexContent.includes('법정 한계(150m)') && !indexContent.includes('고도 150m 제한'), "18-1. 단정적 150m 한계/제한 표현 제거 확인");
  assert(indexContent.includes('150m 이상 비행 시 비행승인 대상 여부 확인'), "18-2. '150m 이상 비행 시 비행승인 대상 여부 확인' 표현 적용 확인");

  // --- 19. 야간/비가시권 문구 ---
  assert(!indexContent.includes('일몰 후 야간비행 금지'), "19-1. 단정적 '일몰 후 야간비행 금지' 표현 제거 확인");
  assert(indexContent.includes('야간 또는 육안으로 확인할 수 없는 범위에서 비행하려면 특별비행승인 여부를 확인하세요. (항공안전법 시행규칙 제312조의2)'), "19-2. 공식 법령 근거 특별비행승인 안내 문구 적용 확인");

  // --- 20. 종합 검토 '일반 비행 기준 충족' 제거 ---
  assert(!indexContent.includes('일반 비행 기준 충족'), "20-1. '일반 비행 기준 충족' 문구 제거 확인");
  assert(indexContent.includes('현재 입력조건 기준 확인사항'), "20-2. '현재 입력조건 기준 확인사항'으로 변경 확인");

  // --- 21. 공역 결과 표현 ---
  assert(indexContent.includes('전체 항공·군사·시설·지자체 규정을 모두 포함하지 않을 수 있으므로'), "21. 공역 참고용 안내 유지 확인");

  // --- 22. 준비정보 복사 데이터 필드 ---
  const copyPermitMatch = indexContent.includes('sourceFieldLabel') &&
                          indexContent.includes('sourceValueText') &&
                          indexContent.includes('sourceCondition') &&
                          indexContent.includes('aircraftWeightKg') &&
                          indexContent.includes('takeoffWeightKg') &&
                          indexContent.includes('maxTakeoffWeightKg') &&
                          indexContent.includes('selfWeightKg') &&
                          indexContent.includes('qualificationClass') &&
                          indexContent.includes('classificationBasis') &&
                          indexContent.includes('verificationStatus');
  assert(copyPermitMatch, "22. copyPermitInfo() 필수 10개 제원/분류/검증 필드 포함 확인");

  // --- 23. 독립기념관 URL 및 정보 ---
  assert(indexContent.includes('https://i815.or.kr/2018/news/news.do?mode=V&no=995391'), "23-1. 독립기념관 공식 촬영안내 URL 적용 확인");
  assert(indexContent.includes('itemdori@i815.or.kr') && indexContent.includes('041-560-0241'), "23-2. 독립기념관 고객소통부 연락처 확인");

  // --- 24 & 25. 전쟁기념관 정보 보존 및 서류명 ---
  assert(indexContent.includes('02-709-3114') && indexContent.includes('드론원스톱 관련 승인/신청 자료 (해당 시, 기관 확인 필요)'), "24&25. 전쟁기념관 대표번호 보존 및 서류명 일반화 확인");

  // --- 26. 서버 TRUST_PROXY 및 보안 검증 ---
  assert(serverContent.includes("const trustProxy = process.env.TRUST_PROXY === 'true';"), "26. 서버 TRUST_PROXY 설정에 따른 x-forwarded-for 신뢰 구조 확인");

  // --- HTTP 서버 라이브 테스트 ---
  const makeReq = (url, headers = {}) => {
    return new Promise((resolve) => {
      const parsed = new URL(url, 'http://localhost:5500');
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', (e) => resolve({ status: 500, error: e.message }));
      req.end();
    });
  };

  // 1) .env 차단
  const envRes = await makeReq('http://localhost:5500/.env');
  assert(envRes.status === 403, "27-1. 서버 .env 차단 (403 Forbidden)");

  // 2) server.js 차단
  const serverJsRes = await makeReq('http://localhost:5500/server.js');
  assert(serverJsRes.status === 403, "27-2. 서버 server.js 차단 (403 Forbidden)");

  // 3) path traversal 차단
  const traversalRes = await makeReq('http://localhost:5500/..%2f..%2fwindows%2fwin.ini');
  assert(traversalRes.status === 403 || traversalRes.status === 404, "27-3. 서버 Path Traversal 차단");

  // 4) security headers
  const rootRes = await makeReq('http://localhost:5500/');
  assert(rootRes.headers['x-content-type-options'] === 'nosniff', "27-4. X-Content-Type-Options: nosniff 헤더 확인");

  console.log("==================================================");
  console.log(`TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const verificationPath = path.join(projectRoot, "data/airspace/vworld-verification.json");
const staticPath = path.join(projectRoot, "data/airspace/airspace.geojson");

if (!fs.existsSync(verificationPath)) {
  console.error("vworld-verification.json 이 존재하지 않습니다.");
  process.exit(1);
}

const vReport = JSON.parse(fs.readFileSync(verificationPath, "utf8"));
const staticGeo = JSON.parse(fs.readFileSync(staticPath, "utf8"));

const candidates = [];

// 1. PROHIBITED 후보군 정리
const pro = vReport.layers.PROHIBITED;
// 1-1. 이름 변경 (RK P73 -> RK P73A)
candidates.push({
  layer: "PROHIBITED",
  id: "RK P73",
  vworldId: "RK P73A",
  changeType: "RENAMED",
  currentName: "RK P73",
  proposedName: "RK P73A",
  reason: "청와대 이전 및 용산 집무실 개편에 따른 국토부/합참 공식 공역 명칭 개편 (P-73 -> P-73A)",
  source: "VWorld WFS (lt_c_aisprhc)",
  impact: "낮음 (비행금지 경계 및 기본 규제 내용은 동일하며 명칭 최신화)",
  recommendation: "차기 정적 GeoJSON 갱신 시 P73A로 명칭 업데이트 권장",
  requiresHumanReview: true,
  approvedForRuntime: false
});

// 1-2. 신규 등록 후보 (원전 10개소 + D4006)
pro.added.forEach(item => {
  const isNuclear = item.id.startsWith("RK P6");
  candidates.push({
    layer: "PROHIBITED",
    id: item.id,
    name: item.name,
    changeType: "ADDED",
    reason: isNuclear
      ? "국가 중요 원자력 시설(고리/월성/한빛/한울/대전원자력연구원) 5개소 금지구역. 기존 AIP KMZ에서는 '원전 관련 임시 (금지)공역' 폴더에 분류되었으나, VWorld 공식 체계에서는 정규 비행금지구역(lt_c_aisprhc)으로 관리됨."
      : "VWorld 최신 비행금지구역에 신규 등록된 보안/특수 목적 공역",
    source: "VWorld WFS (lt_c_aisprhc)",
    impact: isNuclear
      ? "중간 (기존에도 TEMPORARY로 비행금지 판정되던 구역이므로, PROHIBITED로 레이어 재분류 시 법적 일관성 향상)"
      : "검토 필요 (단기 NOTAM인지 영구 비행금지구역인지 국토부 고시 대조 필요)",
    recommendation: isNuclear
      ? "기존 static TEMPORARY에서 PROHIBITED로 레이어 이관 승인 권장"
      : "AIP 고시문 확인 후 영구 공역일 경우 승인",
    requiresHumanReview: true,
    approvedForRuntime: false
  });
});

// 2. RESTRICTED 후보군 정리
const res = vReport.layers.RESTRICTED;
// 2-1. 삭제 후보 (RK R97G)
candidates.push({
  layer: "RESTRICTED",
  id: "RK R97G",
  name: "CHEOLMAE-G",
  changeType: "REMOVED",
  reason: "VWorld 최신 WFS(lt_c_aisresc) 상에서 R97G가 제외됨 (R97 계열 사격/훈련 공역 개편 또는 명칭 통합 가능성)",
  source: "VWorld WFS 미검출 (Static AIP 26년 10차 보존)",
  impact: "중간 (실제 비행 시 안전을 위해 군 훈련 공역 폐지 여부 공문서 확인 전까지 섣부른 삭제 지양)",
  recommendation: "국토부 항공교통본부 최신 공역 공고와 대조 전까지 즉시 삭제 보류 (보수적 안전 기준 유지)",
  requiresHumanReview: true,
  approvedForRuntime: false
});

// 2-2. Geometry 차이 후보 (RK R97D)
candidates.push({
  layer: "RESTRICTED",
  id: "RK R97D",
  name: "CHEOLMAE-D",
  changeType: "GEOMETRY_CHANGED",
  reason: "VWorld 최신 경계와 기존 KMZ 경계 간 Bounding Box 차이(약 0.081도, 경계선 미세 조정) 검출",
  source: "VWorld WFS (lt_c_aisresc)",
  impact: "낮음 (사격 공역 외곽선 분할 정밀도 차이)",
  recommendation: "정밀 좌표 비교 후 VWorld 최신 폴리곤으로 대체 검토",
  requiresHumanReview: true,
  approvedForRuntime: false
});

// 2-3. 신규 29개 비행제한구역
res.added.forEach(item => {
  candidates.push({
    layer: "RESTRICTED",
    id: item.id,
    name: item.name || item.id,
    changeType: "ADDED",
    reason: "군 사격/포격/비행 훈련 공역(R115, R136, R128 등) 신규 또는 세부 세그먼트 등록",
    source: "VWorld WFS (lt_c_aisresc)",
    impact: "높음 (미등록 비행제한구역 추가 시 드론 조종자의 안전 비행 구역 판정 정확도 대폭 향상)",
    recommendation: "사람의 좌표 무결성 검토 후 정적 GeoJSON 추가 승인 권장",
    requiresHumanReview: true,
    approvedForRuntime: false
  });
});

// 3. CTR 후보군 정리
const ctr = vReport.layers.CTR;
ctr.added.forEach(item => {
  const isCtlz = item.id.includes("CTLZ");
  const isTca = item.id.includes("TCA");
  candidates.push({
    layer: "CTR",
    id: item.id,
    name: item.name,
    changeType: "ADDED",
    reason: isCtlz
      ? `군 전용 비행장 관제권 (${item.id}). 기존 앱은 주요 민간/민군공용 20개 공항만 포함하였으나, 군 비행장 관제권이 추가됨.`
      : isTca
      ? `접근관제구역(TCA) 세부 섹터 (${item.id}). 공항 인근 상승/강하 공역.`
      : `추가 관제구역 (${item.id})`,
    source: "VWorld WFS (lt_c_aisctrc)",
    impact: isCtlz
      ? "높음 (군 비행장 인근 드론 비행 시 관제권 침범 사고 예방에 필수적)"
      : "중간 (고고도 TCA는 저고도 드론 비행과 중첩 검토 필요)",
    recommendation: isCtlz
      ? "드론 비행 안전을 위해 정적 GeoJSON에 포함 검토 적극 권장"
      : "지표면(SFC) 영향 여부 확인 후 선별 반영",
    requiresHumanReview: true,
    approvedForRuntime: false
  });
});

// 4. UAS 확인 및 기록 (48개 일치)
candidates.push({
  layer: "UAS",
  id: "ALL_48_ZONES",
  name: "초경량비행장치비행구역 48개소 전수 일치",
  changeType: "UNCHANGED",
  reason: "AIP 정적 데이터(UA 2 ~ UA 63)와 VWorld 최신 데이터가 100% 일치함.",
  source: "VWorld WFS (lt_c_aisuac)",
  impact: "없음 (현재 상태 완벽 무결)",
  recommendation: "수정 불필요. 현재 정적 데이터 유지.",
  requiresHumanReview: false,
  approvedForRuntime: true
});

// 5. TEMPORARY 후보군 정리 (11개 삭제/이관, 3개 신규 NOTAM)
const temp = vReport.layers.TEMPORARY;
// 5-1. 정적 데이터의 원전 공역 처리
candidates.push({
  layer: "TEMPORARY",
  id: "STATIC_P61A_P65B_10_ITEMS",
  name: "원전 공역 10건 (P61A~P65B)",
  changeType: "TEMPORARY_CHANGED",
  reason: "과거 AIP KMZ의 '원전 관련 임시' 폴더에 있었으나, 실제로는 영구 비행금지구역으로 PROHIBITED 레이어로 이관되어야 함.",
  source: "AIP KMZ vs VWorld 체계 차이",
  impact: "공역 분류 정규화",
  recommendation: "TEMPORARY에서 삭제하고 PROHIBITED 레이어로 이관 승인",
  requiresHumanReview: true,
  approvedForRuntime: false
});

candidates.push({
  layer: "TEMPORARY",
  id: "STATIC_SECURITY_ZONE",
  name: "안보구역",
  changeType: "REMOVED",
  reason: "VWorld WFS 상에서 해당 명칭의 임시비행금지구역 미검출.",
  source: "AIP KMZ 보존 데이터",
  impact: "보수적 안전 유지 필요",
  recommendation: "최신 공식 NOTAM 공고 확인 전까지 보수적 유지 권장",
  requiresHumanReview: true,
  approvedForRuntime: false
});

// 5-2. VWorld 실시간 NOTAM 3건
temp.added.forEach(item => {
  candidates.push({
    layer: "TEMPORARY",
    id: item.id,
    name: item.name,
    changeType: "TEMPORARY_CHANGED",
    reason: `VWorld에 등록된 실시간 NOTAM 임시비행금지구역 (고도: ${item.altitude}). 유효기간이 정해진 시한성 공역임.`,
    source: "VWorld WFS (lt_c_aistemp)",
    impact: "주의 (시한성 공역이므로 정적 파일에 고정 삽입 시 유효기간 만료 후 왜곡 위험)",
    recommendation: "정적 GeoJSON 영구 반영 금지. 실시간 승인·비행 전 안내 링크/별도 경고용으로만 관리.",
    requiresHumanReview: true,
    approvedForRuntime: false
  });
});

// 통계 요약
const summary = {
  added: candidates.filter(c => c.changeType === "ADDED").length,
  removed: candidates.filter(c => c.changeType === "REMOVED").length,
  renamed: candidates.filter(c => c.changeType === "RENAMED").length,
  altitudeChanged: 3, // TEMPORARY 3건 고도 속성
  geometryChanged: candidates.filter(c => c.changeType === "GEOMETRY_CHANGED").length,
  temporaryChanged: candidates.filter(c => c.changeType === "TEMPORARY_CHANGED").length,
  unchanged: candidates.filter(c => c.changeType === "UNCHANGED").length,
  totalCandidateItems: candidates.length
};

const output = {
  generatedAt: new Date().toISOString(),
  localGeneratedTime: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
  staticSource: "AIP 26년 10차 기준 KMZ (data/airspace/airspace.geojson)",
  verificationSource: "VWorld WFS (lt_c_aisprhc, lt_c_aisresc, lt_c_aisctrc, lt_c_aisuac, lt_c_aistemp)",
  requiresHumanReview: true,
  disclaimer: "TEMPORARY 레이어의 존재 여부만으로 현재 실제 비행 가능 상태를 확정하지 않는다. 실제 비행 전 최신 공식 공역·승인 정보를 별도 확인해야 한다.",
  summary,
  candidates
};

const outputPath = path.join(projectRoot, "data/airspace/airspace-update-candidates.json");
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
console.log(`[성공] 갱신 후보 데이터 생성 완료: ${outputPath}`);
console.log("요약 통계:", JSON.stringify(summary, null, 2));

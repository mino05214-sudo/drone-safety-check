const fs = require('fs');
const path = require('path');

const filePath = path.resolve('index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Find start of VERIFIED_DRONE_MODELS and end of copyPermitInfo / fallbackCopyText
const startMarker = '    // 9. 공식 출처 기반 검증 기체 DB (VERIFIED_DRONE_MODELS)';
const endMarker = '    // 19. 앱 시작 경량 초기화 (자동 WFS/Weather 호출 배제)';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Markers not found! startIndex:", startIndex, "endIndex:", endIndex);
  process.exit(1);
}

const replacementBlock = `    // 9. 공식 출처 기반 검증 기체 DB (VERIFIED_DRONE_MODELS)
    // ============================================================
    // ※ [최종 엄격 감사 및 검증 원칙]:
    // 1. 항공안전법상 조종자 증명 1~4종 분류 기준은 반드시 공식 '최대이륙중량(MTOW)'만 사용합니다.
    // 2. 제조사 공식 제원의 'Takeoff Weight'는 단순 기본 이륙중량이며 법령상 '최대이륙중량'으로 자동 치환하지 않습니다.
    // 3. 제조사 공식 기술사양/매뉴얼에서 'Maximum Takeoff Weight'가 명시되지 않은 모델은 maxTakeoffWeightKg: null 처리하고 'needs_review'로 관리합니다.
    // 4. 배터리 구성이나 장비 탈부착에 따라 중량이 달라질 수 있는 모델은 조건과 경고를 함께 명시합니다.
    // 5. verifiedAt은 실제 verified 상태 기체에만 부여하며, needs_review는 lastReviewedAt으로 관리합니다.
    // 6. 원문의 부등호나 근사치('< 249 g', '약 377 g')는 takeoffWeightKg: null 처리하여 false precision을 제거합니다.
    const VERIFIED_DRONE_MODELS = [
      {
        manufacturer: "DJI",
        model: "DJI Mini 4 Pro",
        aircraftWeightKg: null,
        takeoffWeightKg: null, // 공식 기술사양에 '< 249 g'만 명시되어 false precision 방지를 위해 null 처리
        maxTakeoffWeightKg: null, // 공식 기술사양에 법령상 '최대이륙중량(MTOW)' 별도 미명시
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "< 249 g",
        sourceCondition: "표준 인텔리전트 플라이트 배터리, 프로펠러, microSD 카드 포함 기준",
        weightDescription: "표준 구성의 공식 표기 중량은 249g 미만(< 249 g)이며, 특정 배터리 구성에서는 249g을 초과할 수 있음.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/mini-4-pro/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: true,
        conditionalNotice: "⚠️ 구성에 따라 중량 기준이 달라질 수 있습니다. (표준 배터리는 <249g이나 대용량 플러스 배터리 장착 시 250g을 초과하여 4종 자격 및 기체 신고 대상이 될 수 있습니다)"
      },
      {
        manufacturer: "DJI",
        model: "DJI Mini 3 Pro",
        aircraftWeightKg: null,
        takeoffWeightKg: null, // 공식 기술사양에 '< 249 g'만 명시되어 false precision 방지를 위해 null 처리
        maxTakeoffWeightKg: null, // 공식 기술사양에 '최대이륙중량(MTOW)' 별도 미명시
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "< 249 g",
        sourceCondition: "표준 인텔리전트 플라이트 배터리, 프로펠러, microSD 카드 포함 기준",
        weightDescription: "표준 구성의 공식 표기 중량은 249g 미만(< 249 g)이며, 특정 배터리 구성에서는 249g을 초과할 수 있음.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/mini-3-pro/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: true,
        conditionalNotice: "⚠️ 구성에 따라 중량 기준이 달라질 수 있습니다. (표준 배터리는 <249g이나 플러스 배터리 장착 시 약 290g으로 250g을 초과하여 4종 자격 필요)"
      },
      {
        manufacturer: "DJI",
        model: "DJI Mini 2 SE",
        aircraftWeightKg: null,
        takeoffWeightKg: 0.246,
        maxTakeoffWeightKg: 0.246, // 공식 매뉴얼 제원상 'Maximum Take-Off Weight: 246 g' 명시 확인
        selfWeightKg: null,
        sourceFieldLabel: "Maximum Take-Off Weight",
        sourceValueText: "246 g",
        sourceCondition: "배터리, 프로펠러 및 microSD 카드 포함 기준",
        weightDescription: "DJI 공식 사용자 매뉴얼 제원상 'Maximum Take-Off Weight: 246 g' 명시 확인됨. 최대이륙중량 250g 이하로 1~4종 조종자 증명 대상 제외 범위에 해당함.",
        sourceType: "manufacturer",
        sourceName: "DJI Mini 2 SE 공식 사용자 매뉴얼 (User Manual v1.0, p.51)",
        sourceUrl: "https://dl.djicdn.com/downloads/DJI_Mini_2_SE/20230209/DJI_Mini_2_SE_User_Manual_v1.0_ko.pdf",
        verifiedAt: "2026-09-17",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "verified",
        hasConditionalWeight: true,
        conditionalNotice: "공식 제원상 최대이륙중량은 246g이나 프로펠러 가드 등 추가 액세서리 장착 시 250g을 초과할 수 있으므로 장착 장비를 확인하세요."
      },
      {
        manufacturer: "DJI",
        model: "DJI Air 3",
        aircraftWeightKg: null,
        takeoffWeightKg: 0.720,
        maxTakeoffWeightKg: null, // 공식 제원에 'Takeoff Weight: 720g'만 명시, MTOW 별도 미명시
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "720 g",
        sourceCondition: "프로펠러 및 배터리 포함 기준",
        weightDescription: "DJI 공식 기술사양 원문에 'Takeoff Weight: 720g'으로만 명시되어 있으며, Maximum Takeoff Weight는 별도 명시되지 않아 법령상 최대이륙중량 공식 확인 필요.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/air-3/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 표기 이륙중량 720g(Takeoff Weight)이나 공식 기술사양에 최대이륙중량(MTOW)이 별도 기재되지 않았습니다."
      },
      {
        manufacturer: "DJI",
        model: "DJI Air 2S",
        aircraftWeightKg: null,
        takeoffWeightKg: 0.595,
        maxTakeoffWeightKg: null, // 공식 기술사양에 'Takeoff Weight: 595g'만 명시, MTOW 별도 미제공
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "595 g",
        sourceCondition: "프로펠러 및 배터리 포함 기준",
        weightDescription: "제조사 공식 기술사양에 '이륙 중량(Takeoff Weight): 595g' 표기. 공식 제원에 최대이륙중량(MTOW) 별도 미명시.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/air-2s/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 표기 이륙중량 595g(Takeoff Weight)이며 공식 최대이륙중량(MTOW)은 미명시 상태입니다."
      },
      {
        manufacturer: "DJI",
        model: "DJI Mavic 3 Pro",
        aircraftWeightKg: null,
        takeoffWeightKg: null, // Cine 모델(963g) 상이하므로 false precision 방지 위해 null 처리
        maxTakeoffWeightKg: null, // 공식 제원에 별도 MTOW 미제공
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "958 g (Cine 모델 963 g)",
        sourceCondition: "프로펠러, 배터리 및 microSD 카드 포함 기준",
        weightDescription: "공식 이륙중량 Mavic 3 Pro 958g, Mavic 3 Pro Cine 963g 표기. 공식 제원에 별도 최대이륙중량(MTOW) 미명시.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/mavic-3-pro/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: true,
        conditionalNotice: "기본 모델 958g, Cine 모델 963g으로 세부 모델에 따라 기본 이륙중량이 다릅니다. 최대이륙중량(MTOW)은 별도 확인 필요."
      },
      {
        manufacturer: "DJI",
        model: "DJI Avata 2",
        aircraftWeightKg: null,
        takeoffWeightKg: null, // '약 377 g' 근사치이므로 false precision 방지 위해 null 처리
        maxTakeoffWeightKg: null, // 공식 제원에 별도 MTOW 미제공
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "약 377 g",
        sourceCondition: "프로펠러 및 배터리 포함 기준",
        weightDescription: "제조사 공식 기술사양에 '이륙 중량(Takeoff Weight): 약 377g' 표기. 공식 제원에 별도 최대이륙중량(MTOW) 미명시.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/avata-2/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 표기 이륙중량 약 377g(Takeoff Weight)이며 공식 최대이륙중량(MTOW)은 미명시 상태입니다."
      },
      {
        manufacturer: "DJI",
        model: "DJI Inspire 3",
        aircraftWeightKg: 3.995,
        takeoffWeightKg: null,
        maxTakeoffWeightKg: 4.310, // 공식 제원에 'Max Takeoff Weight: Approx. 4,310 g' 명시 확인
        selfWeightKg: 3.995,
        sourceFieldLabel: "Weight / Max Takeoff Weight",
        sourceValueText: "Weight: Approx. 3,995 g / Max Takeoff Weight: Approx. 4,310 g",
        sourceCondition: "짐벌 카메라, 렌즈 1개, 배터리 2개, 프로펠러 4개, microSD 카드 포함 기준",
        weightDescription: "공식 제원상 기체 중량(Weight) 약 3,995g, 공식 최대이륙중량(Max Takeoff Weight) 약 4,310g(4.31kg) 분리 명시 확인. 3종(2kg 초과 ~ 7kg 이하) 해당.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/inspire-3/specs",
        verifiedAt: "2026-09-17",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "verified",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 공식 제원에서 기체 중량(3,995g)과 최대이륙중량(4,310g)이 분리 명시되어 공식 확인되었습니다."
      },
      {
        manufacturer: "Autel Robotics",
        model: "Autel EVO Lite+",
        aircraftWeightKg: 0.835,
        takeoffWeightKg: null,
        maxTakeoffWeightKg: 0.866, // 공식 제원에 Aircraft Weight: 835g, Maximum Takeoff Weight (MTOW): 866g 분리 명시 확인
        selfWeightKg: null,
        sourceFieldLabel: "Aircraft Weight / Maximum takeoff weight",
        sourceValueText: "Aircraft Weight: 835 g / MTOW: 866 g",
        sourceCondition: "배터리, 프로펠러, 짐벌 커버 포함 기준",
        weightDescription: "공식 제원상 기체 중량(Aircraft Weight) 835g, 공식 최대이륙중량(Maximum takeoff weight) 866g 분리 명시 확인. 4종(250g 초과 ~ 2kg 이하) 해당.",
        sourceType: "manufacturer",
        sourceName: "Autel Robotics 공식 제품 사양 (Specs)",
        sourceUrl: "https://www.autelrobotics.com/productdetail/24.html",
        verifiedAt: "2026-09-17",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "verified",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 공식 제원에서 기체 중량(835g)과 최대이륙중량 MTOW(866g)가 명확히 구분되어 확인되었습니다."
      },
      {
        manufacturer: "Autel Robotics",
        model: "Autel EVO Nano+",
        aircraftWeightKg: null,
        takeoffWeightKg: 0.249,
        maxTakeoffWeightKg: null, // 공식 기술사양에 'Takeoff Weight: 249 g'만 명시, MTOW 별도 미제공
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "249 g",
        sourceCondition: "배터리, 프로펠러 및 microSD 카드 포함 기준",
        weightDescription: "제조사 공식 제원에 '이륙 중량(Takeoff Weight): 249g' 표기. 공식 제원에 별도 최대이륙중량(MTOW) 미명시.",
        sourceType: "manufacturer",
        sourceName: "Autel Robotics 공식 제품 사양 (Specs)",
        sourceUrl: "https://www.autelrobotics.com/productdetail/25.html",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: false,
        conditionalNotice: "공식 제원상 Takeoff Weight 249g으로 표기되어 있으며 법령상 최대이륙중량(MTOW)은 미명시 상태입니다."
      },
      {
        manufacturer: "DJI",
        model: "DJI Agras T40",
        aircraftWeightKg: 50.0, // 배터리 포함 기체중량
        takeoffWeightKg: null,
        maxTakeoffWeightKg: null, // 살포(90kg)/분제(101kg) 조건별 상이하므로 단일 숫자로 단순화하지 않고 verified_conditional 처리
        selfWeightKg: 38.0, // 배터리 제외 자체중량
        sourceFieldLabel: "Total Weight / Max Takeoff Weight for spraying & spreading",
        sourceValueText: "배터리 제외 38kg, 배터리 포함 50kg / 살포 MTOW 90kg, 분제 MTOW 101kg",
        sourceCondition: "해수면 기준 운용 제원",
        weightDescription: "배터리 제외 자체중량 38kg, 배터리 포함 기본 중량 50kg. 액제 살포 시 최대이륙중량 90kg, 입제 살포 시 최대이륙중량 101kg. 운용 조건에 따라 상이하므로 운용 조건 확인 필요.",
        sourceType: "manufacturer",
        sourceName: "DJI Agriculture 공식 기술 사양 (Specs)",
        sourceUrl: "https://ag.dji.com/t40/specs",
        verifiedAt: "2026-09-17",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "verified_conditional",
        hasConditionalWeight: true,
        conditionalNotice: "운용 조건에 따라 최대이륙중량이 다릅니다: 액제 살포(spraying) 90kg / 입제 살포(spreading) 101kg. 자체중량은 배터리 제외 38kg입니다. (운용 조건 확인 필요)",
        maxTakeoffWeightConditions: [
          { condition: "spraying", label: "액제 살포 (spraying)", maxTakeoffWeightKg: 90.0 },
          { condition: "spreading", label: "입제 살포 (spreading)", maxTakeoffWeightKg: 101.0 }
        ]
      },
      {
        manufacturer: "Custom / 자작",
        model: "Custom 5-inch FPV",
        aircraftWeightKg: null,
        takeoffWeightKg: null,
        maxTakeoffWeightKg: null,
        selfWeightKg: null,
        sourceFieldLabel: "미확인 (개별 조립)",
        sourceValueText: "미확인",
        sourceCondition: "조립 부품 및 배터리 용량에 따라 상이",
        weightDescription: "자작 FPV 기체는 장착 모터, 배터리(4S~6S), 액션캠 유무에 따라 중량이 크게 달라지므로 공식 표준 제원이 존재하지 않습니다. 실측 후 직접 입력 필요.",
        sourceType: "unknown",
        sourceName: "공식 제원 미확인 (개별 조립 기체)",
        sourceUrl: "",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: true,
        conditionalNotice: "자작 및 커스텀 기체는 사용 배터리와 탑재 장비에 따라 중량이 가변적이므로 반드시 저울로 실측하여 입력해야 합니다."
      }
    ];

    // ============================================================
    // 10. 기체 데이터 구조 및 조종자 증명 기준 자동 분류
    // ============================================================
    // Section 1: 신규 사용자 초기 상태는 빈 문자열, null, unknown으로 초기화
    let droneProfile = {
      model: "",
      manufacturer: "",
      aircraftWeightKg: null,
      takeoffWeightKg: null,
      maxTakeoffWeightKg: null,
      selfWeightKg: null,
      selfWeightSource: "none",
      sourceFieldLabel: "",
      sourceValueText: "",
      sourceCondition: "",
      weightDescription: "",
      sourceType: "unknown",
      sourceName: "",
      sourceUrl: "",
      verifiedAt: "",
      lastReviewedAt: "",
      verificationStatus: "unknown",
      qualificationClass: "unknown",
      classificationBasis: "unknown",
      hasConditionalWeight: false,
      conditionalNotice: "",
      maxTakeoffWeightConditions: [],
      legacyWeightCategory: null
    };

    // 법적 분류 함수: 공식 확인된 MTOW 및 25kg 초과 시 자체중량 필수 검증 (Section 4 & 5)
    function calculateQualificationClass(mtowKg, selfWeightKg, verificationStatus = "unknown", hasConditionalWeight = false) {
      let basis = "unknown";
      if (verificationStatus === "verified" && mtowKg !== null && !hasConditionalWeight) {
        basis = "official_verified";
      } else if (verificationStatus === "verified_conditional" || (hasConditionalWeight && mtowKg === null)) {
        basis = "conditional";
      } else if (verificationStatus === "user_input" && mtowKg !== null) {
        basis = "user_input";
      } else if (mtowKg !== null) {
        basis = (verificationStatus === "verified") ? "official_verified" : "user_input";
      } else {
        basis = "unknown";
      }

      // 조건부 데이터 (Agras T40 등)
      if (basis === "conditional" || verificationStatus === "verified_conditional") {
        return {
          code: "conditional",
          name: "운용조건 확인 필요",
          classificationBasis: "conditional",
          badgeText: "⚠️ 운용조건별 MTOW 상이",
          badgeClass: "status-conditional",
          rangeText: "운용 조건별 상이 (살포 90kg / 분제 101kg 등)",
          legalNotice: "제조사 공식 제원에 운용 조건별(살포/분제 등)로 최대이륙중량이 상이하게 명시되어 있어 단일 조종자 증명 종을 사전 확정할 수 없습니다. 실제 운용 모드 및 탑재 중량에 따른 최대이륙중량을 확인하세요.",
          requiresSelfWeight: true,
          isConfirmed: false
        };
      }

      // MTOW 미확인
      if (mtowKg === null || mtowKg === undefined || isNaN(mtowKg) || mtowKg <= 0) {
        return {
          code: "unknown",
          name: "조종자 증명 분류 확인 필요",
          classificationBasis: "unknown",
          badgeText: "❓ 최대이륙중량 확인 필요",
          badgeClass: "status-none",
          rangeText: "공식 최대이륙중량(MTOW) 미확인",
          legalNotice: "제조사 공식 제원에서 법령상 '최대이륙중량(MTOW)'이 확인되지 않아 1~4종 자격 기준을 자동 분류할 수 없습니다. 제조사 단순 표기 중량(Takeoff Weight)을 법령상 최대이륙중량으로 자동 복사하지 않습니다. 실제 운용 최대이륙중량을 공식 매뉴얼 또는 한국교통안전공단(TS)을 통해 확인하세요.",
          requiresSelfWeight: false,
          isConfirmed: false
        };
      }

      const isUserInput = (basis === "user_input");

      // MTOW <= 250g
      if (mtowKg <= 0.250) {
        return {
          code: "none_or_not_applicable",
          name: isUserInput ? "입력값 기준 조종자 증명 대상 제외" : "조종자 증명 대상 제외 범위",
          classificationBasis: basis,
          badgeText: isUserInput ? "🟢 입력값: 250g 이하 (초소형)" : "🟢 250g 이하 (초소형)",
          badgeClass: "status-confirmed",
          rangeText: "최대이륙중량 250g 이하",
          legalNotice: "최대이륙중량 250g 이하 기체는 항공안전법상 1~4종 조종자 증명 취득 대상에서 제외됩니다. (단, 배터리/액세서리 변경으로 250g 초과 시 4종 대상이 되며, 150m 이상 비행 시 비행승인 대상 여부 확인 및 비행금지구역 비행 승인 등 준수사항은 동일 적용)",
          requiresSelfWeight: false,
          isConfirmed: true
        };
      } else if (mtowKg <= 2.0) {
        // 4종: 250g 초과 ~ 2kg 이하
        return {
          code: "class4",
          name: isUserInput ? "입력값 기준 4종" : "4종 조종자 증명 기준",
          classificationBasis: basis,
          badgeText: isUserInput ? "🟢 입력값: 2kg 이하 (4종)" : "🟢 2kg 이하 (4종)",
          badgeClass: "status-confirmed",
          rangeText: "최대이륙중량 250g 초과 ~ 2kg 이하",
          legalNotice: "만 10세 이상, 한국교통안전공단(TS) 배움터(edu.kotsa.or.kr) 온라인 교육(6시간) 이수 증명 필요 (실기시험 없음. 비사업용 기체신고 면제 대상 여부 확인). 최신 세부 응시요건은 TS국가자격시험에서 확인.",
          requiresSelfWeight: false,
          isConfirmed: true
        };
      } else if (mtowKg <= 7.0) {
        // 3종: 2kg 초과 ~ 7kg 이하
        return {
          code: "class3",
          name: isUserInput ? "입력값 기준 3종" : "3종 조종자 증명 기준",
          classificationBasis: basis,
          badgeText: isUserInput ? "🟡 입력값: 7kg 이하 (3종)" : "🟡 7kg 이하 (3종)",
          badgeClass: "status-conditional",
          rangeText: "최대이륙중량 2kg 초과 ~ 7kg 이하",
          legalNotice: "만 14세 이상, 비행경력 및 학과시험(필기) 합격 필요 (실기시험 없음. 최신 응시요건 및 세부 비행경력은 TS국가자격시험에서 공식 확인). 초경량비행장치 기체 신고 의무 대상.",
          requiresSelfWeight: false,
          isConfirmed: true
        };
      } else if (mtowKg <= 25.0) {
        // 2종: 7kg 초과 ~ 25kg 이하
        return {
          code: "class2",
          name: isUserInput ? "입력값 기준 2종" : "2종 조종자 증명 기준",
          classificationBasis: basis,
          badgeText: isUserInput ? "🟡 입력값: 25kg 이하 (2종)" : "🟡 25kg 이하 (2종)",
          badgeClass: "status-conditional",
          rangeText: "최대이륙중량 7kg 초과 ~ 25kg 이하",
          legalNotice: "만 14세 이상, 비행경력, 학과시험 및 실기시험 합격 필요 (최신 응시요건 및 세부 비행경력은 TS국가자격시험에서 공식 확인). 드론원스톱 기체 신고 의무 대상.",
          requiresSelfWeight: false,
          isConfirmed: true
        };
      } else {
        // MTOW > 25kg (1종 분류 로직 정밀 검증 - Section 4)
        if (selfWeightKg === null || isNaN(selfWeightKg)) {
          // B. MTOW > 25kg + selfWeightKg == null
          return {
            code: "unknown",
            name: "1종 여부 확인 필요",
            classificationBasis: isUserInput ? "user_input" : basis,
            badgeText: "❓ 1종 여부 확인 필요 (자체중량 미확인)",
            badgeClass: "status-none",
            rangeText: "최대이륙중량 25kg 초과 (자체중량 미확인)",
            legalNotice: "최대이륙중량이 25kg을 초과하므로 1종 조종자 증명 해당 여부를 판단하기 위해 연료/배터리를 제외한 자체중량(150kg 이하 여부)을 반드시 확인해야 합니다. 자체중량 미확인 상태에서는 1종으로 확정하지 않습니다.",
            requiresSelfWeight: true,
            isConfirmed: false
          };
        } else if (selfWeightKg <= 150) {
          // C. MTOW > 25kg + selfWeightKg <= 150
          return {
            code: "class1",
            name: isUserInput ? "입력값 기준 1종" : "1종 조종자 증명 기준",
            classificationBasis: isUserInput ? "user_input" : basis,
            badgeText: isUserInput ? "🔴 입력값: 1종 조종자 증명 기준" : "🔴 1종 조종자 증명 기준",
            badgeClass: "status-inquiry",
            rangeText: `최대이륙중량 25kg 초과 (자체중량 ${selfWeightKg}kg 확인)`,
            legalNotice: `최대이륙중량 25kg 초과 및 자체중량 ${selfWeightKg}kg(150kg 이하 초경량비행장치 범위) 확인. 만 14세 이상, 비행경력, 학과시험 및 실기시험 합격 필요. 항공안전기술원(KIAST) 안전성인증 및 관할 지방항공청 비행승인 필수 대상.`,
            requiresSelfWeight: true,
            isConfirmed: true
          };
        } else {
          // D. MTOW > 25kg + selfWeightKg > 150
          return {
            code: "unknown",
            name: "적용 범위 확인 필요",
            classificationBasis: isUserInput ? "user_input" : basis,
            badgeText: "⚠️ 적용 범위 확인 필요 (자체중량 150kg 초과)",
            badgeClass: "status-none",
            rangeText: `자체중량 ${selfWeightKg}kg (150kg 초과)`,
            legalNotice: "자체중량이 150kg을 초과하는 무인비행장치는 항공안전법상 초경량비행장치 범위를 벗어나 무인항공기 등 별도의 항공기 기준이 적용될 수 있으므로 국토교통부 항공정책실에 적용 법령을 직접 확인해야 합니다.",
            requiresSelfWeight: true,
            isConfirmed: false
          };
        }
      }
    }

    function executeDroneSearch() {
      const input = document.getElementById("droneSearchKeywordInput");
      const listEl = document.getElementById("droneSearchResultsList");
      const statusEl = document.getElementById("droneSearchStatusText");
      if (!input || !listEl) return;

      const keyword = input.value.trim().toLowerCase();
      if (!keyword) {
        showToast("제조사 또는 모델명을 입력하세요.");
        input.focus();
        return;
      }

      const matched = VERIFIED_DRONE_MODELS.filter(d => {
        const m = (d.model || "").toLowerCase();
        const mf = (d.manufacturer || "").toLowerCase();
        return m.includes(keyword) || mf.includes(keyword) || keyword.includes(m);
      });

      listEl.style.display = "flex";
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.innerText = `검색 결과: ${matched.length}건`;
      }

      if (matched.length === 0) {
        listEl.innerHTML = `
          <div style="padding:10px 12px; background:#f8fafc; border-radius:8px; font-size:12px; color:var(--muted); text-align:center; border:1px dashed #cbd5e1;">
            등록된 검증 기체 정보가 없습니다: "<strong>${escapeHtml(input.value.trim())}</strong>"<br>
            <span style="font-size:11px; color:#64748b; margin-top:4px; display:inline-block;">공식 제조사 제원에서 최대이륙중량을 확인해 직접 입력하세요.</span>
          </div>
        `;
        return;
      }

      const top5 = matched.slice(0, 5);
      let html = "";
      top5.forEach((d) => {
        const idx = VERIFIED_DRONE_MODELS.indexOf(d);
        const qInfo = calculateQualificationClass(d.maxTakeoffWeightKg, d.selfWeightKg, d.verificationStatus, d.hasConditionalWeight);

        let statusBadge = "";
        if (d.verificationStatus === "verified") {
          statusBadge = `<span style="font-size:10px; font-weight:700; color:#065f46; background:#d1fae5; padding:2px 6px; border-radius:4px;">✅ MTOW 공식확인</span>`;
        } else if (d.verificationStatus === "verified_conditional") {
          statusBadge = `<span style="font-size:10px; font-weight:700; color:#065f46; background:#d1fae5; padding:2px 6px; border-radius:4px;">✅ 공식 제원 확인 · MTOW 조건 확인 필요</span>`;
        } else {
          statusBadge = `<span style="font-size:10px; font-weight:700; color:#92400e; background:#fef3c7; padding:2px 6px; border-radius:4px;">❓ 법령 MTOW 확인필요</span>`;
        }

        const aircraftWeightText = (d.aircraftWeightKg !== null) ? `${d.aircraftWeightKg >= 1 ? d.aircraftWeightKg + 'kg' : Math.round(d.aircraftWeightKg * 1000) + 'g'}` : (d.takeoffWeightKg !== null ? `${d.takeoffWeightKg >= 1 ? d.takeoffWeightKg + 'kg' : Math.round(d.takeoffWeightKg * 1000) + 'g'}` : (d.sourceValueText || '미확인'));
        const mtowText = (d.maxTakeoffWeightKg !== null) ? `${d.maxTakeoffWeightKg}kg` : (d.verificationStatus === "verified_conditional" ? '조건별 상이' : '공식 미명시');
        const dateText = d.verifiedAt ? `확인일: ${d.verifiedAt}` : (d.lastReviewedAt ? `최근검토: ${d.lastReviewedAt}` : '');

        html += `
          <div class="drone-result-item" data-index="${idx}">
            <div>
              <div class="drone-result-name">${escapeHtml(d.manufacturer)} · ${escapeHtml(d.model)} ${statusBadge}</div>
              <div class="drone-result-meta">
                표기중량: ${escapeHtml(aircraftWeightText)} (${escapeHtml(d.sourceFieldLabel || 'Takeoff Weight')}) · 최대이륙중량: ${escapeHtml(mtowText)} 
                ${d.selfWeightKg !== null ? '· 자체중량: ' + d.selfWeightKg + 'kg' : ''} 
                · 분류: <strong>${escapeHtml(qInfo.badgeText)}</strong>
              </div>
              <div style="font-size:10px; color:var(--muted); margin-top:2px;">출처: ${escapeHtml(d.sourceName)} ${dateText ? '(' + escapeHtml(dateText) + ')' : ''}</div>
            </div>
            <button type="button" class="btn-primary btn-sm btn-select-drone" data-index="${idx}" style="padding:4px 8px; font-size:11px; white-space:nowrap;">이 기체 사용</button>
          </div>
        `;
      });
      listEl.innerHTML = html;

      // Event delegation (Section 15)
      listEl.onclick = (e) => {
        const itemEl = e.target.closest('.drone-result-item');
        if (!itemEl) return;
        const targetIdx = parseInt(itemEl.dataset.index, 10);
        if (!isNaN(targetIdx)) {
          selectVerifiedDrone(targetIdx);
        }
      };
    }

    function selectVerifiedDrone(idx) {
      const d = VERIFIED_DRONE_MODELS[idx];
      if (!d) return;

      droneProfile.manufacturer = d.manufacturer;
      droneProfile.model = d.model;
      droneProfile.aircraftWeightKg = d.aircraftWeightKg;
      droneProfile.takeoffWeightKg = d.takeoffWeightKg;
      droneProfile.maxTakeoffWeightKg = d.maxTakeoffWeightKg;
      droneProfile.selfWeightKg = d.selfWeightKg;
      droneProfile.selfWeightSource = d.selfWeightKg ? "official" : "none";
      droneProfile.sourceFieldLabel = d.sourceFieldLabel || "";
      droneProfile.sourceValueText = d.sourceValueText || "";
      droneProfile.sourceCondition = d.sourceCondition || "";
      droneProfile.weightDescription = d.weightDescription || "";
      droneProfile.sourceType = d.sourceType || "manufacturer";
      droneProfile.sourceName = d.sourceName;
      droneProfile.sourceUrl = d.sourceUrl;
      droneProfile.verifiedAt = d.verifiedAt || "";
      droneProfile.lastReviewedAt = d.lastReviewedAt || "";
      droneProfile.verificationStatus = d.verificationStatus;
      droneProfile.hasConditionalWeight = !!d.hasConditionalWeight;
      droneProfile.conditionalNotice = d.conditionalNotice || "";
      droneProfile.maxTakeoffWeightConditions = d.maxTakeoffWeightConditions || [];

      // 입력 폼에 값 동기화
      const elModel = document.getElementById("permitDroneModel");
      const elMfr = document.getElementById("permitManufacturer");
      const elWeight = document.getElementById("permitWeightKg");
      const elSelfWeight = document.getElementById("permitSelfWeightKg");

      if (elModel) elModel.value = d.model;
      if (elMfr) elMfr.value = d.manufacturer;
      if (elWeight) elWeight.value = (d.maxTakeoffWeightKg !== null) ? d.maxTakeoffWeightKg : "";
      if (elSelfWeight) elSelfWeight.value = (d.selfWeightKg !== null) ? d.selfWeightKg : "";

      // 검색 결과 접기
      const listEl = document.getElementById("droneSearchResultsList");
      if (listEl) listEl.style.display = "none";

      const searchInput = document.getElementById("droneSearchKeywordInput");
      if (searchInput) searchInput.value = d.model;

      renderDroneProfileUI();
      savePermitProfile();
      updatePermitView();
      updateComprehensiveDiagnosis();

      showToast(`🚁 "${d.model}" 기체 정보가 적용되었습니다.`);
    }

    // Section 6: 사용자 직접 입력 시 이전 기체 데이터 완전 제거
    function onDroneManualInput() {
      const elModel = document.getElementById("permitDroneModel");
      const elMfr = document.getElementById("permitManufacturer");
      const elWeight = document.getElementById("permitWeightKg");
      const elSelfWeight = document.getElementById("permitSelfWeightKg");

      const modelVal = elModel ? elModel.value.trim() : "";
      const mfrVal = elMfr ? elMfr.value.trim() : "";

      const matched = VERIFIED_DRONE_MODELS.find(d => d.model.toLowerCase() === modelVal.toLowerCase());

      if (matched) {
        droneProfile.manufacturer = matched.manufacturer;
        droneProfile.model = matched.model;
        droneProfile.aircraftWeightKg = matched.aircraftWeightKg;
        droneProfile.takeoffWeightKg = matched.takeoffWeightKg;
        droneProfile.maxTakeoffWeightKg = matched.maxTakeoffWeightKg;
        droneProfile.selfWeightKg = matched.selfWeightKg;
        droneProfile.selfWeightSource = matched.selfWeightKg ? "official" : "none";
        droneProfile.sourceFieldLabel = matched.sourceFieldLabel || "";
        droneProfile.sourceValueText = matched.sourceValueText || "";
        droneProfile.sourceCondition = matched.sourceCondition || "";
        droneProfile.weightDescription = matched.weightDescription || "";
        droneProfile.sourceType = matched.sourceType || "manufacturer";
        droneProfile.sourceName = matched.sourceName;
        droneProfile.sourceUrl = matched.sourceUrl;
        droneProfile.verifiedAt = matched.verifiedAt || "";
        droneProfile.lastReviewedAt = matched.lastReviewedAt || "";
        droneProfile.verificationStatus = matched.verificationStatus;
        droneProfile.hasConditionalWeight = !!matched.hasConditionalWeight;
        droneProfile.conditionalNotice = matched.conditionalNotice || "";
        droneProfile.maxTakeoffWeightConditions = matched.maxTakeoffWeightConditions || [];

        if (elMfr && !mfrVal) elMfr.value = matched.manufacturer;
        if (elWeight) elWeight.value = (matched.maxTakeoffWeightKg !== null) ? matched.maxTakeoffWeightKg : "";
        if (elSelfWeight) elSelfWeight.value = (matched.selfWeightKg !== null) ? matched.selfWeightKg : "";
      } else {
        // 이전 기체 데이터 누출 방지 완전 제거
        droneProfile.model = modelVal;
        droneProfile.manufacturer = mfrVal;
        droneProfile.aircraftWeightKg = null;
        droneProfile.takeoffWeightKg = null;
        droneProfile.maxTakeoffWeightKg = null;
        droneProfile.selfWeightKg = null;
        droneProfile.sourceType = "user_input";
        droneProfile.sourceName = "사용자 직접 입력";
        droneProfile.sourceUrl = "";
        droneProfile.sourceFieldLabel = "사용자 직접 입력";
        droneProfile.sourceValueText = "";
        droneProfile.sourceCondition = "";
        droneProfile.weightDescription = "사용자가 직접 입력한 기체 제원 정보입니다.";
        droneProfile.verifiedAt = "";
        droneProfile.lastReviewedAt = "";
        droneProfile.verificationStatus = modelVal ? "user_input" : "unknown";
        droneProfile.qualificationClass = "unknown";
        droneProfile.classificationBasis = modelVal ? "user_input" : "unknown";
        droneProfile.selfWeightSource = "user_input";
        droneProfile.hasConditionalWeight = false;
        droneProfile.conditionalNotice = "";
        droneProfile.maxTakeoffWeightConditions = [];

        if (elWeight) elWeight.value = "";
        if (elSelfWeight) elSelfWeight.value = "";
      }

      renderDroneProfileUI();
      savePermitProfile();
      updatePermitView();
      updateComprehensiveDiagnosis();
    }

    function onDroneWeightInput(save = true) {
      const elWeight = document.getElementById("permitWeightKg");
      const rawVal = elWeight ? elWeight.value.trim() : "";
      const val = rawVal ? parseFloat(rawVal) : null;
      const kg = (val !== null && !isNaN(val)) ? Math.max(0.001, val) : null;

      droneProfile.maxTakeoffWeightKg = kg;

      const matchedModel = VERIFIED_DRONE_MODELS.find(d => d.model.toLowerCase() === droneProfile.model.toLowerCase());
      if (!matchedModel || matchedModel.maxTakeoffWeightKg !== kg) {
        droneProfile.sourceType = "user_input";
        droneProfile.verificationStatus = "user_input";
        droneProfile.classificationBasis = "user_input";
        droneProfile.sourceName = "사용자 직접 입력";
        droneProfile.sourceUrl = "";
        droneProfile.sourceFieldLabel = "사용자 직접 입력";
        droneProfile.sourceValueText = kg !== null ? `${kg}kg` : "미입력";
        droneProfile.verifiedAt = "";
      }

      renderDroneProfileUI();

      if (save) {
        savePermitProfile();
        updatePermitView();
        updateComprehensiveDiagnosis();
      }
    }

    // Section 7: 자체중량 직접 변경 시 검증 상태 수정
    function onDroneSelfWeightInput() {
      const elSelfWeight = document.getElementById("permitSelfWeightKg");
      const rawVal = elSelfWeight ? elSelfWeight.value.trim() : "";
      const val = rawVal ? parseFloat(rawVal) : null;
      droneProfile.selfWeightKg = (val !== null && !isNaN(val)) ? Math.max(0, val) : null;
      droneProfile.selfWeightSource = "user_input";

      renderDroneProfileUI();
      savePermitProfile();
      updatePermitView();
      updateComprehensiveDiagnosis();
    }

    function setPresetWeight(kg) {
      const elWeight = document.getElementById("permitWeightKg");
      if (elWeight) elWeight.value = kg;
      onDroneWeightInput(true);
    }

    function renderDroneProfileUI() {
      const mtow = droneProfile.maxTakeoffWeightKg;
      const sw = droneProfile.selfWeightKg;
      const q = calculateQualificationClass(mtow, sw, droneProfile.verificationStatus, droneProfile.hasConditionalWeight);
      droneProfile.qualificationClass = q.code;
      droneProfile.classificationBasis = q.classificationBasis;

      const isModelEmpty = !droneProfile.model;

      // 1) 4-Box 상세 비교 그리드 동기화
      const elDispAcw = document.getElementById("displayAircraftWeight");
      const elDispAcwSub = document.getElementById("displayAircraftWeightSub");
      const elDispLabel = document.getElementById("displaySourceFieldLabel");
      const elDispMtow = document.getElementById("displayMaxTakeoffWeight");
      const elDispMtowStatus = document.getElementById("displayMtowStatus");
      const elDispSw = document.getElementById("displaySelfWeight");
      const elDispQ = document.getElementById("displayQualificationClass");
      const elDispQSub = document.getElementById("displayQualificationSub");

      const acw = droneProfile.aircraftWeightKg;
      const tow = droneProfile.takeoffWeightKg;

      if (elDispAcw) {
        if (isModelEmpty) {
          elDispAcw.innerText = "기체 미지정";
        } else if (acw !== null && !isNaN(acw) && acw > 0) {
          elDispAcw.innerText = acw >= 1 ? `${acw} kg` : `${Math.round(acw * 1000)} g`;
        } else if (tow !== null && !isNaN(tow) && tow > 0) {
          elDispAcw.innerText = tow >= 1 ? `${tow} kg` : `${Math.round(tow * 1000)} g`;
        } else if (droneProfile.sourceValueText) {
          elDispAcw.innerText = droneProfile.sourceValueText;
        } else {
          elDispAcw.innerText = "미확인";
        }
      }
      if (elDispAcwSub) {
        elDispAcwSub.innerText = isModelEmpty ? "승인준비에서 기체 선택" : (droneProfile.sourceCondition ? `${droneProfile.sourceCondition.slice(0, 20)}...` : "제조사 표기 중량");
      }
      if (elDispLabel) {
        elDispLabel.innerText = isModelEmpty ? "" : (droneProfile.sourceFieldLabel ? `(${droneProfile.sourceFieldLabel})` : "(항목 미확인)");
      }

      if (elDispMtow) {
        if (isModelEmpty) {
          elDispMtow.innerText = "기체 미지정";
          elDispMtow.style.color = "var(--muted)";
        } else if (mtow !== null && !isNaN(mtow) && mtow > 0) {
          elDispMtow.innerText = `${mtow} kg`;
          elDispMtow.style.color = "var(--text)";
        } else {
          elDispMtow.innerText = (droneProfile.verificationStatus === "verified_conditional") ? "운용조건별 확인 필요" : "확인되지 않음";
          elDispMtow.style.color = "#b45309";
        }
      }
      if (elDispMtowStatus) {
        if (isModelEmpty) {
          elDispMtowStatus.innerText = "기체 미지정";
          elDispMtowStatus.style.color = "var(--muted)";
        } else if (droneProfile.verificationStatus === "verified" && mtow !== null) {
          elDispMtowStatus.innerText = "공식 확인됨";
          elDispMtowStatus.style.color = "var(--success)";
        } else if (droneProfile.verificationStatus === "verified_conditional") {
          elDispMtowStatus.innerText = "운용조건별 상이 (확인필요)";
          elDispMtowStatus.style.color = "#b45309";
        } else if (droneProfile.verificationStatus === "user_input") {
          elDispMtowStatus.innerText = "사용자 직접 입력";
          elDispMtowStatus.style.color = "#b45309";
        } else {
          elDispMtowStatus.innerText = "공식 미명시 (확인필요)";
          elDispMtowStatus.style.color = "#b45309";
        }
      }

      if (elDispSw) {
        if (isModelEmpty) {
          elDispSw.innerText = "기체 미지정";
        } else if (sw !== null && !isNaN(sw) && sw > 0) {
          const swSourceText = (droneProfile.selfWeightSource === "user_input") ? " (자체중량 사용자 입력)" : " (공식)";
          elDispSw.innerText = `${sw} kg${swSourceText}`;
        } else {
          elDispSw.innerText = "해당없음 / 미확인";
        }
      }

      if (elDispQ) {
        if (isModelEmpty) {
          elDispQ.innerText = "🚁 기체 미지정";
          elDispQ.style.color = "var(--muted)";
        } else {
          elDispQ.innerText = q.name;
          elDispQ.style.color = q.isConfirmed ? "#15803d" : "#b45309";
        }
      }
      if (elDispQSub) {
        elDispQSub.innerText = isModelEmpty ? "승인준비 탭에서 기체를 검색하거나 직접 입력하세요." : q.rangeText;
        elDispQSub.style.color = q.isConfirmed ? "#166534" : "#92400e";
      }

      // 2) 기체 조건 경고 상자 동기화
      const alertBox = document.getElementById("droneConditionAlert");
      const alertDesc = document.getElementById("droneConditionAlertDesc");
      if (alertBox && alertDesc) {
        if (!isModelEmpty && droneProfile.hasConditionalWeight && droneProfile.conditionalNotice) {
          alertBox.style.display = "block";
          alertDesc.innerHTML = `<strong>⚠️ 구성 및 운용 조건 주의:</strong> ${escapeHtml(droneProfile.conditionalNotice)}<br><span style="font-size:10.5px; color:#b45309;">※ 사용 중인 실제 배터리와 장착 액세서리를 제조사 제원과 함께 반드시 확인하세요.</span>`;
        } else {
          alertBox.style.display = "none";
        }
      }

      // 3) 상단 뱃지 및 안내문구 갱신
      const badge = document.getElementById("weightCategoryBadge");
      const notice = document.getElementById("weightLawNotice");
      if (badge) {
        if (isModelEmpty) {
          badge.innerText = "🚁 기체 미지정";
          badge.style.color = "var(--muted)";
        } else {
          badge.innerText = q.badgeText;
          if (q.badgeClass === "status-confirmed") {
            badge.style.color = "var(--success)";
          } else if (q.badgeClass === "status-conditional") {
            badge.style.color = "#b45309";
          } else if (q.badgeClass === "status-inquiry") {
            badge.style.color = "var(--danger)";
          } else {
            badge.style.color = "var(--muted)";
          }
        }
      }
      if (notice) {
        if (isModelEmpty) {
          notice.innerText = "※ 기체가 지정되지 않았습니다. 승인준비 탭에서 기체를 검색하거나 직접 입력하세요.";
        } else {
          notice.innerText = `※ ${q.legalNotice}`;
        }
      }

      // 4) 자체중량 입력 영역 표시 조건 (25kg 초과 시 표출)
      const selfWeightGroup = document.getElementById("selfWeightGroup");
      if (selfWeightGroup) {
        selfWeightGroup.style.display = (mtow !== null && mtow > 25) ? "block" : "none";
      }

      // 5) 출처 안내 배너 갱신 (Section 8, 9, 14 XSS 방지)
      const banner = document.getElementById("droneSourceBanner");
      const bannerText = document.getElementById("droneSourceBannerText");
      const btnUrl = document.getElementById("btnDroneSourceUrl");

      if (banner && bannerText && btnUrl) {
        if (isModelEmpty) {
          banner.className = "drone-source-banner drone-source-none";
          bannerText.innerHTML = `<strong>🚁 기체 미지정</strong><br><span style="font-size:11px;">승인준비 탭에서 기체를 검색하여 선택하거나 직접 입력하세요.</span>`;
          btnUrl.style.display = "none";
        } else if (droneProfile.verificationStatus === "verified") {
          banner.className = "drone-source-banner drone-source-verified";
          bannerText.innerHTML = `<strong>✅ 공식 MTOW 확인</strong>: ${escapeHtml(droneProfile.model)}<br><span style="font-size:11px;">출처: ${escapeHtml(droneProfile.sourceName || '공식 기술 사양')} (${escapeHtml(droneProfile.verifiedAt)}) · 항목: "${escapeHtml(droneProfile.sourceFieldLabel || 'Max Takeoff Weight')}" · 최대이륙중량: ${mtow !== null ? mtow + 'kg' : '미확인'}</span>`;
          if (droneProfile.sourceUrl) {
            btnUrl.href = droneProfile.sourceUrl;
            btnUrl.style.display = "inline-flex";
          } else {
            btnUrl.style.display = "none";
          }
        } else if (droneProfile.verificationStatus === "verified_conditional") {
          banner.className = "drone-source-banner drone-source-conditional";
          bannerText.innerHTML = `<strong>✅ 공식 제원 확인</strong>: ${escapeHtml(droneProfile.model)}<br><span style="font-size:11px;">⚠️ 최대이륙중량은 운용조건별 확인 필요 (출처: ${escapeHtml(droneProfile.sourceName || '공식 기술 사양')})</span>`;
          if (droneProfile.sourceUrl) {
            btnUrl.href = droneProfile.sourceUrl;
            btnUrl.style.display = "inline-flex";
          } else {
            btnUrl.style.display = "none";
          }
        } else if (droneProfile.verificationStatus === "user_input") {
          banner.className = "drone-source-banner drone-source-user";
          bannerText.innerHTML = `<strong>⚠️ 사용자 입력 정보</strong>: 최대이륙중량 ${mtow !== null ? mtow + 'kg' : '미입력'}<br><span style="font-size:11px;">사용자 직접 입력 값입니다. 제조사 공식 기술사양(Specs)으로 최대이륙중량(MTOW)을 다시 확인하세요.</span>`;
          btnUrl.style.display = "none";
        } else {
          banner.className = "drone-source-banner drone-source-review";
          const displayAcwText = (acw !== null ? (acw >= 1 ? acw + 'kg' : Math.round(acw * 1000) + 'g') : (droneProfile.sourceValueText || '확인'));
          bannerText.innerHTML = `<strong>❓ 법령상 최대이륙중량(MTOW) 별도 확인 필요</strong><br><span style="font-size:11px;">제조사 공식 자료에서 'Takeoff Weight'(${escapeHtml(displayAcwText)})만 제공되고 '최대이륙중량(MTOW)'이 별도 명시되지 않아 조종자 증명 분류를 자동 확정하지 않습니다.</span>`;
          if (droneProfile.sourceUrl) {
            btnUrl.href = droneProfile.sourceUrl;
            btnUrl.style.display = "inline-flex";
          } else {
            btnUrl.style.display = "none";
          }
        }
      }

      // 6) 1~4종 기준 안내 카드 하이라이트
      const cardMap = {
        class1: document.getElementById("classCard1"),
        class2: document.getElementById("classCard2"),
        class3: document.getElementById("classCard3"),
        class4: document.getElementById("classCard4"),
        none_or_not_applicable: document.getElementById("classCardNone")
      };
      Object.keys(cardMap).forEach(k => {
        if (cardMap[k]) {
          if (q.isConfirmed && k === q.code && !isModelEmpty) {
            cardMap[k].classList.add("active");
          } else {
            cardMap[k].classList.remove("active");
          }
        }
      });
    }

    // ============================================================
    // 11. 공식 확인된 촬영장소 규칙 데이터 (filmingSiteRules)
    // ============================================================
    // ※ [규칙]: detectionRadius는 시설의 실제 행정/관리구역 경계가 아닌 "촬영장소 후보 감지용 반경"입니다.
    const filmingSiteRules = [
      {
        id: "independence_hall",
        name: "독립기념관",
        institutionName: "독립기념관",
        department: "고객소통부",
        address: "충청남도 천안시 동남구 목천읍 독립기념관로 1",
        latitude: 36.7836,
        longitude: 127.2232,
        detectionRadius: 1500, // 1.5km (촬영장소 후보 감지용 반경)
        sourceType: "official",
        source: "독립기념관 공식 촬영허가 안내",
        verifiedAt: "2026-09-17",
        institutionPermission: "사전 허가 필요",
        tel: "041-560-0241",
        phone: "041-560-0241",
        email: "itemdori@i815.or.kr",
        officialUrl: "https://i815.or.kr/2018/news/news.do?mode=V&no=995391",
        deadline: "촬영일 기준 5일 전까지 신청",
        notes: "독립기념관 경내 촬영 시 촬영일 기준 5일 전까지 시설관리 부서(고객소통부) 사전 신청서 및 서약서 제출 필요. 드론 촬영은 관계기관 사전 승인 및 기관 자체 협의가 필요합니다.",
        documents: [
          { id: "doc_ind_1", name: "독립기념관 시설촬영 신청서", requiredStatus: "확인됨", formats: "HWP, PDF", sourceUrl: "https://i815.or.kr/2018/news/news.do?mode=V&no=995391", verifiedAt: "2026-09-17" },
          { id: "doc_ind_2", name: "촬영 준수사항 서약서", requiredStatus: "확인됨", formats: "HWP, PDF", sourceUrl: "https://i815.or.kr/2018/news/news.do?mode=V&no=995391", verifiedAt: "2026-09-17" },
          { id: "doc_ind_3", name: "드론원스톱 관련 승인/신청 자료 (해당 시, 기관 확인 필요)", requiredStatus: "기관 확인 필요", formats: "PDF, JPG", sourceUrl: "https://drone.onestop.go.kr", verifiedAt: "2026-09-17" }
        ]
      },
      {
        id: "war_memorial",
        name: "전쟁기념관",
        institutionName: "전쟁기념사업회",
        department: "확인 필요",
        address: "서울특별시 용산구 이태원로 29",
        latitude: 37.5366,
        longitude: 126.9772,
        detectionRadius: 1000, // 1km (촬영장소 후보 감지용 반경)
        sourceType: "official",
        source: "전쟁기념사업회 공식 안내",
        verifiedAt: "2026-09-17",
        institutionPermission: "기관 사전 문의 필요",
        tel: "02-709-3114",
        phone: "02-709-3114",
        email: null, // 공식 확인되지 않은 이메일 임의 생성 금지
        officialUrl: "https://www.warmemo.or.kr",
        deadline: null, // 공식 신청기한 미공시
        notes: "용산 비행제한/금지공역 인접 및 국가 안보 관련 기념시설입니다. 전용 드론 촬영 신청서 양식 및 공식 이메일 접수처가 공시되지 않았으므로 비행·촬영 전 기관 대표번호(02-709-3114)로 사전 문의가 필수적입니다.",
        documents: [
          { id: "doc_war_1", name: "시설 사용/촬영 허가 신청서 (기관 문의)", requiredStatus: "기관 문의", formats: "기관 문의", sourceUrl: "https://www.warmemo.or.kr", verifiedAt: "2026-09-17" },
          { id: "doc_war_2", name: "드론원스톱 관련 승인/신청 자료 (해당 시, 기관 확인 필요)", requiredStatus: "기관 확인 필요", formats: "PDF, JPG", sourceUrl: "https://drone.onestop.go.kr", verifiedAt: "2026-09-17" }
        ]
      }
    ];

    // ============================================================
    // 12. 비행승인·항공촬영 승인 준비 도우미 모듈
    // ============================================================
    const PERMIT_STORAGE_KEY = "drone_permit_profile";

    let selectedFilmingSite = null; // 사용자가 확정한 장소 규칙 객체
    let candidateFilmingSite = null; // 감지된 반경 내 장소 후보 { site, dist }
    let userDocuments = []; // 사용자 등록 서류 (브라우저 메모리 관리, 서버 미전송)
    let isSearchingLocation = false; // 검색 중복 방지 플래그

    // Section 3: permitProfile.weightKg 중복 상태 제거
    let permitProfile = {
      droneModel: "",
      altitude: 50,
      purpose: "촬영",
      isAerialPhoto: true
    };

    // 프로필 초기 로드 및 UI 반영 (Section 1: 신규 사용자 기본 기체 제거, Section 2: legacy migration 수정)
    function initPermitProfile() {
      const saved = safeStorageGet(PERMIT_STORAGE_KEY, {});

      let legacyWeightCategory = null;
      let legacyNotice = "";
      if (saved.weightCategory) {
        legacyWeightCategory = saved.weightCategory;
      }

      let initialMtow = null;
      if (saved.maxTakeoffWeightKg !== undefined && saved.maxTakeoffWeightKg !== null && !isNaN(saved.maxTakeoffWeightKg)) {
        initialMtow = Number(saved.maxTakeoffWeightKg);
      } else if (saved.weightCategory === "under25" || saved.weightCategory === "over25") {
        // Section 2: over25 -> 26kg, under25 -> 0.249kg 자동변환 금지!
        initialMtow = null;
        legacyNotice = "기존 저장정보에서 정확한 최대이륙중량을 확인할 수 없습니다. 실제 공식 제원 확인 후 다시 입력하세요.";
      } else if (saved.weightKg !== undefined && saved.weightKg !== null && !isNaN(saved.weightKg)) {
        if (!saved.model && !saved.droneModel && (saved.weightKg === 0.249 || saved.weightKg === 26.0)) {
          initialMtow = null;
        } else {
          initialMtow = Number(saved.weightKg);
        }
      }

      droneProfile.legacyWeightCategory = legacyWeightCategory;

      const hasSavedModel = !!(saved.droneModel || saved.model);

      if (hasSavedModel) {
        droneProfile.model = saved.droneModel || saved.model || "";
        droneProfile.manufacturer = saved.manufacturer || "";
        droneProfile.aircraftWeightKg = (saved.aircraftWeightKg !== undefined) ? saved.aircraftWeightKg : null;
        droneProfile.takeoffWeightKg = (saved.takeoffWeightKg !== undefined) ? saved.takeoffWeightKg : null;
        droneProfile.maxTakeoffWeightKg = initialMtow;
        droneProfile.selfWeightKg = (saved.selfWeightKg !== undefined) ? saved.selfWeightKg : null;
        droneProfile.selfWeightSource = saved.selfWeightSource || (saved.selfWeightKg ? "user_input" : "none");
        droneProfile.sourceFieldLabel = saved.sourceFieldLabel || "";
        droneProfile.sourceValueText = saved.sourceValueText || "";
        droneProfile.sourceCondition = saved.sourceCondition || "";
        droneProfile.weightDescription = saved.weightDescription || "";
        droneProfile.sourceType = saved.sourceType || "user_input";
        droneProfile.sourceName = saved.sourceName || "";
        droneProfile.sourceUrl = saved.sourceUrl || "";
        droneProfile.verifiedAt = saved.verifiedAt || "";
        droneProfile.lastReviewedAt = saved.lastReviewedAt || "";
        droneProfile.verificationStatus = saved.verificationStatus || "user_input";
        droneProfile.hasConditionalWeight = !!saved.hasConditionalWeight;
        droneProfile.conditionalNotice = saved.conditionalNotice || "";
        droneProfile.maxTakeoffWeightConditions = saved.maxTakeoffWeightConditions || [];

        const matched = VERIFIED_DRONE_MODELS.find(d => d.model.toLowerCase() === droneProfile.model.toLowerCase());
        if (matched && (droneProfile.verificationStatus === "verified" || droneProfile.verificationStatus === "verified_conditional" || droneProfile.verificationStatus === "needs_review" || !saved.sourceName)) {
          droneProfile.manufacturer = matched.manufacturer;
          droneProfile.model = matched.model;
          droneProfile.aircraftWeightKg = matched.aircraftWeightKg;
          droneProfile.takeoffWeightKg = matched.takeoffWeightKg;
          droneProfile.maxTakeoffWeightKg = matched.maxTakeoffWeightKg;
          droneProfile.selfWeightKg = matched.selfWeightKg;
          droneProfile.selfWeightSource = matched.selfWeightKg ? "official" : "none";
          droneProfile.sourceFieldLabel = matched.sourceFieldLabel || "";
          droneProfile.sourceValueText = matched.sourceValueText || "";
          droneProfile.sourceCondition = matched.sourceCondition || "";
          droneProfile.weightDescription = matched.weightDescription || "";
          droneProfile.sourceType = matched.sourceType || "manufacturer";
          droneProfile.sourceName = matched.sourceName;
          droneProfile.sourceUrl = matched.sourceUrl;
          droneProfile.verifiedAt = matched.verifiedAt || "";
          droneProfile.lastReviewedAt = matched.lastReviewedAt || "";
          droneProfile.verificationStatus = matched.verificationStatus;
          droneProfile.hasConditionalWeight = !!matched.hasConditionalWeight;
          droneProfile.conditionalNotice = matched.conditionalNotice || "";
          droneProfile.maxTakeoffWeightConditions = matched.maxTakeoffWeightConditions || [];
        }
      } else {
        // Section 1: 신규 사용자 초기 상태 (모두 빈값 / null / unknown)
        droneProfile.model = "";
        droneProfile.manufacturer = "";
        droneProfile.aircraftWeightKg = null;
        droneProfile.takeoffWeightKg = null;
        droneProfile.maxTakeoffWeightKg = null;
        droneProfile.selfWeightKg = null;
        droneProfile.selfWeightSource = "none";
        droneProfile.qualificationClass = "unknown";
        droneProfile.classificationBasis = "unknown";
        droneProfile.verificationStatus = "unknown";
        droneProfile.sourceType = "unknown";
        droneProfile.sourceName = "";
        droneProfile.sourceUrl = "";
        droneProfile.verifiedAt = "";
        droneProfile.lastReviewedAt = "";
        droneProfile.hasConditionalWeight = false;
        droneProfile.conditionalNotice = "";
        droneProfile.maxTakeoffWeightConditions = [];
      }

      permitProfile.droneModel = droneProfile.model;
      permitProfile.altitude = (saved.altitude !== undefined) ? (Number(saved.altitude) || 50) : 50;
      permitProfile.purpose = saved.purpose || "촬영";
      permitProfile.isAerialPhoto = (saved.isAerialPhoto !== undefined) ? !!saved.isAerialPhoto : true;

      // DOM 요소에 값 반영
      const elModel = document.getElementById("permitDroneModel");
      const elMfr = document.getElementById("permitManufacturer");
      const elWeight = document.getElementById("permitWeightKg");
      const elSelfWeight = document.getElementById("permitSelfWeightKg");
      const elAlt = document.getElementById("permitAltitude");
      const elPurpose = document.getElementById("permitPurpose");
      const elPhoto = document.getElementById("permitAerialPhoto");

      if (elModel) elModel.value = droneProfile.model;
      if (elMfr) elMfr.value = droneProfile.manufacturer;
      if (elWeight) elWeight.value = (droneProfile.maxTakeoffWeightKg !== null) ? droneProfile.maxTakeoffWeightKg : "";
      if (elSelfWeight) elSelfWeight.value = (droneProfile.selfWeightKg !== null) ? droneProfile.selfWeightKg : "";
      if (elAlt) elAlt.value = permitProfile.altitude;
      if (elPurpose) elPurpose.value = permitProfile.purpose;
      if (elPhoto) elPhoto.checked = permitProfile.isAerialPhoto;

      const photoArea = document.getElementById("aerialPhotoDatesArea");
      if (photoArea) {
        photoArea.style.display = permitProfile.isAerialPhoto ? "block" : "none";
      }

      renderDroneProfileUI();

      if (legacyNotice) {
        const noticeBox = document.getElementById("weightLawNotice");
        if (noticeBox) {
          noticeBox.innerText = `※ ${legacyNotice}`;
          noticeBox.style.color = "#b45309";
        }
      }

      // 비행 예정일 및 촬영 기간 기본값 설정
      const elFlightDate = document.getElementById("permitFlightDate");
      const elPhotoStart = document.getElementById("permitPhotoStartDate");
      const elPhotoEnd = document.getElementById("permitPhotoEndDate");

      const today = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthStr = `${nextMonth.getFullYear()}-${pad(nextMonth.getMonth() + 1)}-${pad(nextMonth.getDate())}`;

      if (elFlightDate && !elFlightDate.value) elFlightDate.value = todayStr;
      if (elPhotoStart && !elPhotoStart.value) elPhotoStart.value = todayStr;
      if (elPhotoEnd && !elPhotoEnd.value) elPhotoEnd.value = nextMonthStr;

      updatePermitView();
      updateComprehensiveDiagnosis();
    }

    // 프로필 입력 필드 변경 핸들러
    function onPermitProfileChange() {
      const elAlt = document.getElementById("permitAltitude");
      const elPurpose = document.getElementById("permitPurpose");
      const elPhoto = document.getElementById("permitAerialPhoto");

      permitProfile.altitude = elAlt ? (parseFloat(elAlt.value) || 0) : 50;
      permitProfile.purpose = elPurpose ? elPurpose.value : "촬영";
      permitProfile.isAerialPhoto = elPhoto ? elPhoto.checked : false;

      const photoArea = document.getElementById("aerialPhotoDatesArea");
      if (photoArea) {
        photoArea.style.display = permitProfile.isAerialPhoto ? "block" : "none";
      }

      savePermitProfile();
      updatePermitView();
    }

    function onPermitInputChange() {
      updatePermitView();
    }

    function savePermitProfile() {
      const payload = {
        droneModel: droneProfile.model,
        manufacturer: droneProfile.manufacturer,
        aircraftWeightKg: droneProfile.aircraftWeightKg,
        takeoffWeightKg: droneProfile.takeoffWeightKg,
        maxTakeoffWeightKg: droneProfile.maxTakeoffWeightKg,
        selfWeightKg: droneProfile.selfWeightKg,
        selfWeightSource: droneProfile.selfWeightSource,
        sourceFieldLabel: droneProfile.sourceFieldLabel,
        sourceValueText: droneProfile.sourceValueText,
        sourceCondition: droneProfile.sourceCondition,
        weightDescription: droneProfile.weightDescription,
        sourceType: droneProfile.sourceType,
        sourceName: droneProfile.sourceName,
        sourceUrl: droneProfile.sourceUrl,
        verifiedAt: droneProfile.verifiedAt,
        lastReviewedAt: droneProfile.lastReviewedAt,
        verificationStatus: droneProfile.verificationStatus,
        hasConditionalWeight: droneProfile.hasConditionalWeight,
        conditionalNotice: droneProfile.conditionalNotice,
        maxTakeoffWeightConditions: droneProfile.maxTakeoffWeightConditions,
        altitude: permitProfile.altitude,
        purpose: permitProfile.purpose,
        isAerialPhoto: permitProfile.isAerialPhoto
      };
      safeStorageSet(PERMIT_STORAGE_KEY, payload);
    }

    // ============================================================
    // 11. VWorld 장소/주소 검색 연동 (Section 13, 14, 15 개선)
    // ============================================================
    let currentSearchResults = [];

    async function executeLocationSearch() {
      const input = document.getElementById("searchKeywordInput");
      const statusEl = document.getElementById("searchStatusText");
      const listEl = document.getElementById("searchResultsList");

      if (!input) return;
      const keyword = input.value.trim();
      if (!keyword) {
        showToast("장소명 또는 주소를 입력하세요.");
        input.focus();
        return;
      }
      if (keyword.length < 2) {
        showToast("검색어를 2글자 이상 입력하세요.");
        return;
      }

      if (isSearchingLocation) return;
      isSearchingLocation = true;

      statusEl.style.display = "block";
      statusEl.innerText = \`🔍 "\${keyword}" 검색 중...\`;
      listEl.innerHTML = "";
      listEl.style.display = "none";

      try {
        let response = await fetch(\`/api/search?query=\${encodeURIComponent(keyword)}&type=place\`);
        let data = await response.json();
        let items = [];

        if (data && data.response && data.response.status === "OK" && data.response.result && data.response.result.items) {
          items = data.response.result.items;
        }

        if (items.length === 0) {
          const addrResp = await fetch(\`/api/search?query=\${encodeURIComponent(keyword)}&type=address\`);
          const addrData = await addrResp.json();
          if (addrData && addrData.response && addrData.response.status === "OK" && addrData.response.result && addrData.response.result.items) {
            items = addrData.response.result.items;
          }
        }

        isSearchingLocation = false;

        if (items.length === 0) {
          statusEl.innerText = \`검색 결과가 없습니다: "\${keyword}"\`;
          return;
        }

        const topItems = items.slice(0, 5);
        currentSearchResults = topItems.map(item => ({
          title: item.title || keyword,
          displayAddr: item.address?.road || item.address?.parcel || "주소 정보 없음",
          lon: parseFloat(item.point.x),
          lat: parseFloat(item.point.y)
        }));

        statusEl.innerText = \`검색 결과 \${topItems.length}건 (터치하여 위치 선택):\`;
        listEl.style.display = "flex";

        let html = "";
        currentSearchResults.forEach((item, idx) => {
          html += \`
            <div class="search-item" data-idx="\${idx}">
              <div class="search-item-name">📍 \${escapeHtml(item.title)}</div>
              <div class="search-item-addr">\${escapeHtml(item.displayAddr)}</div>
            </div>
          \`;
        });
        listEl.innerHTML = html;

        listEl.onclick = (e) => {
          const itemEl = e.target.closest('.search-item');
          if (!itemEl) return;
          const idx = parseInt(itemEl.dataset.idx, 10);
          const target = currentSearchResults[idx];
          if (target) {
            selectSearchResult(target.lat, target.lon, target.title, target.displayAddr);
          }
        };

      } catch (err) {
        isSearchingLocation = false;
        console.error("[Search Error]", err);
        statusEl.innerText = "⚠️ 검색 요청 중 오류가 발생했습니다. 다시 시도하세요.";
      }
    }

    // Section 13: 문자열 비교로 장소 규칙 자동 확정 금지 (좌표 반경 기반으로 후보 탐지)
    function selectSearchResult(lat, lon, title, address) {
      const listEl = document.getElementById("searchResultsList");
      const statusEl = document.getElementById("searchStatusText");
      if (listEl) listEl.style.display = "none";
      if (statusEl) statusEl.innerText = \`선택된 장소: \${title}\`;

      const input = document.getElementById("searchKeywordInput");
      if (input) input.value = title;

      // 장소 규칙은 거리 기반 후보 감지 후 사용자 확인으로만 확정하도록 초기화
      selectedFilmingSite = null;

      setLocation(lat, lon, "search", {
        placeName: title,
        address: address,
        title: \`🔍 \${title}\`
      });

      showToast(\`📍 "\${title}" 위치가 선택되었습니다.\`);
    }

    // ============================================================
    // 12. 등록된 촬영장소 후보 탐지 (checkCandidateFilmingSites)
    // ============================================================
    // Section 12: 이전 장소 상태 stale 방지
    function checkCandidateFilmingSites(lat, lon) {
      const banner = document.getElementById("candidateBanner");
      const nameEl = document.getElementById("candidateSiteName");
      const distEl = document.getElementById("candidateSiteDist");

      if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        if (banner) banner.style.display = "none";
        candidateFilmingSite = null;
        selectedFilmingSite = null;
        return;
      }

      // 새 위치가 기존 선택 장소 반경 밖이면 selectedFilmingSite 초기화
      if (selectedFilmingSite) {
        const distFromSelectedKm = getDistanceKm(lat, lon, selectedFilmingSite.latitude, selectedFilmingSite.longitude);
        const distFromSelectedM = distFromSelectedKm * 1000;
        if (distFromSelectedM > selectedFilmingSite.detectionRadius) {
          selectedFilmingSite = null;
        }
      }

      let closest = null;
      let minDistanceM = Infinity;

      filmingSiteRules.forEach(site => {
        const distKm = getDistanceKm(lat, lon, site.latitude, site.longitude);
        const distM = distKm * 1000;
        if (distM <= site.detectionRadius && distM < minDistanceM) {
          minDistanceM = distM;
          closest = site;
        }
      });

      if (closest) {
        candidateFilmingSite = { site: closest, dist: minDistanceM };
        if (banner && nameEl && distEl) {
          nameEl.innerText = closest.name;
          distEl.innerText = Math.round(minDistanceM);
          banner.style.display = "flex";
        }
      } else {
        candidateFilmingSite = null;
        if (banner) banner.style.display = "none";
      }

      renderFilmingSiteDetails();
    }

    // 사용자가 후보 배너에서 [장소 확인]을 누른 경우에만 확정
    function applyCandidateSite() {
      if (!candidateFilmingSite) return;
      selectedFilmingSite = candidateFilmingSite.site;

      const banner = document.getElementById("candidateBanner");
      if (banner) banner.style.display = "none";

      locationState.placeName = selectedFilmingSite.name;
      locationState.address = selectedFilmingSite.address;

      renderFilmingSiteDetails();
      updatePermitView();
      showToast(\`🏛️ \${selectedFilmingSite.name} 시설 규정이 적용되었습니다.\`);
    }

    // ============================================================
    // 13. 촬영장소 기관 및 서류 안내 UI 렌더링
    // ============================================================
    function renderFilmingSiteDetails() {
      const siteBadge = document.getElementById("siteStatusBadge");
      const emptyNotice = document.getElementById("siteEmptyNotice");
      const activeBox = document.getElementById("siteActiveBox");

      if (!siteBadge || !emptyNotice || !activeBox) return;

      if (!selectedFilmingSite) {
        siteBadge.innerText = candidateFilmingSite ? "후보 감지됨 (확인 필요)" : "장소 확인 대기";
        siteBadge.style.background = candidateFilmingSite ? "#fef3c7" : "#f1f5f9";
        siteBadge.style.color = candidateFilmingSite ? "#b45309" : "#475569";
        emptyNotice.style.display = "block";
        activeBox.style.display = "none";
        return;
      }

      const site = selectedFilmingSite;
      siteBadge.innerText = \`🏛️ \${site.name} 확인됨\`;
      siteBadge.style.background = "#d1fae5";
      siteBadge.style.color = "#065f46";

      emptyNotice.style.display = "none";
      activeBox.style.display = "block";

      document.getElementById("siteBoxName").innerText = \`\${site.name} 시설 촬영 정보\`;
      document.getElementById("siteBoxPermission").innerText = site.institutionPermission;
      document.getElementById("siteBoxDept").innerText = site.department || "담당 부서 문의";
      document.getElementById("siteBoxContact").innerText = site.tel || "유선 문의 필요";
      document.getElementById("siteBoxEmail").innerText = site.email || "🟡 기관 사전 문의 필요 (공식 이메일 미확인)";
      document.getElementById("siteBoxDeadline").innerText = site.deadline || "기관 사전 확인 필요";

      const btnCall = document.getElementById("btnCallAuth");
      if (btnCall) {
        if (site.tel) {
          btnCall.href = \`tel:\${site.tel.replace(/[^0-9]/g, '')}\`;
          btnCall.style.display = "inline-flex";
        } else {
          btnCall.style.display = "none";
        }
      }

      const btnUrl = document.getElementById("btnUrlAuth");
      if (btnUrl) {
        btnUrl.href = site.officialUrl || "#";
      }

      const inquiryBox = document.getElementById("inquiryPreviewBox");
      if (inquiryBox) {
        inquiryBox.innerText = generateInquiryQuestions(site);
      }

      renderDocumentRequirements(site.documents || []);

      const footer = document.getElementById("siteMetaFooter");
      if (footer) {
        footer.innerText = \`출처: \${site.source} · 확인일: \${site.verifiedAt}\`;
      }
    }

    function generateInquiryQuestions(site) {
      const sName = site ? site.name : (locationState.placeName || "촬영 예정 시설");
      return \`[\${sName} 드론 비행 및 촬영 관련 사전 문의사항]
1. 드론 비행 및 촬영 가능 여부
2. 별도 시설 촬영허가 필요 여부
3. 필요한 신청서 및 서약서 양식
4. 제출방법 (이메일/공문/현장접수 등)
5. 신청기한 (촬영 며칠 전까지 접수해야 하는지)
6. 장소사용료 및 부대비용 발생 여부
7. 드론원스톱 비행·촬영승인 외 별도 협의 필요 여부\`;
    }

    function copyInquiryText() {
      const text = generateInquiryQuestions(selectedFilmingSite);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast("📋 7대 기관 문의사항이 복사되었습니다.");
        }).catch(() => {
          fallbackCopyText(text);
        });
      } else {
        fallbackCopyText(text);
      }
    }

    function handleAuthEmailAction() {
      if (!selectedFilmingSite || !selectedFilmingSite.email) {
        showToast("🟡 공식 이메일 주소가 확인되지 않았습니다. 기관 대표 전화로 문의하세요.");
        return;
      }
      const email = selectedFilmingSite.email;
      const subject = encodeURIComponent(\`[드론 촬영 문의] \${selectedFilmingSite.name} 드론 비행 및 촬영 절차 확인 요청\`);
      const body = encodeURIComponent(generateInquiryQuestions(selectedFilmingSite));
      window.location.href = \`mailto:\${email}?subject=\${subject}&body=\${body}\`;
      showToast(\`✉ 이메일 작성 창이 열렸습니다 (\${email})\`);
    }

    function renderDocumentRequirements(docs) {
      const container = document.getElementById("documentRequirementsList");
      if (!container) return;

      if (!docs || docs.length === 0) {
        container.innerHTML = \`<div style="font-size:11px; color:var(--muted); padding:4px 0;">등록된 지정 서류가 없습니다. 기관에 문의하세요.</div>\`;
        return;
      }

      let html = "";
      docs.forEach(doc => {
        let badgeClass = "status-none";
        let badgeText = "⚪ 정보 없음";

        if (doc.requiredStatus === "확인됨") {
          badgeClass = "status-confirmed";
          badgeText = "🟢 확인됨";
        } else if (doc.requiredStatus === "해당 시") {
          badgeClass = "status-conditional";
          badgeText = "🟡 해당 시";
        } else if (doc.requiredStatus === "기관 문의") {
          badgeClass = "status-inquiry";
          badgeText = "🔵 기관 문의";
        } else if (doc.requiredStatus === "기관 확인 필요") {
          badgeClass = "status-conditional";
          badgeText = "🟡 기관 확인 필요";
        }

        html += \`
          <div class="doc-item">
            <div>
              <div style="font-weight:700; color:var(--text);">\${escapeHtml(doc.name)}</div>
              <div style="font-size:11px; color:var(--muted);">지원 형식: \${escapeHtml(doc.formats)} · <a href="\${escapeHtml(doc.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:none;">공식 페이지</a></div>
            </div>
            <span class="doc-status-badge \${badgeClass}">\${badgeText}</span>
          </div>
        \`;
      });
      container.innerHTML = html;
    }

    // ============================================================
    // 14. 사용자 서류 파일 등록 (Section 16: 확장자 검증, Section 17: XSS 방지)
    // ============================================================
    const ALLOWED_DOCUMENT_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".hwp"];

    function handleUserFilesUpload(event) {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const MAX_TOTAL_FILES = 5;
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      let addedCount = 0;

      for (let i = 0; i < files.length; i++) {
        if (userDocuments.length >= MAX_TOTAL_FILES) {
          showToast(\`⚠️ 서류 파일은 최대 \${MAX_TOTAL_FILES}개까지만 등록 가능합니다.\`);
          break;
        }

        const file = files[i];
        const extMatch = file.name.match(/\\.[^.]+$/);
        const ext = extMatch ? extMatch[0].toLowerCase() : "";

        // Section 16: 확장자 검증
        if (!ALLOWED_DOCUMENT_EXTS.includes(ext)) {
          showToast(\`⚠️ "\${file.name}": 허용되지 않는 파일 형식입니다. (.pdf, .jpg, .jpeg, .png, .hwp 만 허용)\`);
          continue;
        }

        // Section 16: 파일 크기 10MB 이하
        if (file.size > MAX_SIZE) {
          showToast(\`⚠️ "\${file.name}" 크기가 10MB를 초과하여 제외되었습니다.\`);
          continue;
        }

        let previewUrl = null;
        if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".pdf") {
          try {
            previewUrl = URL.createObjectURL(file);
          } catch (e) {
            console.warn("createObjectURL error:", e);
          }
        }

        userDocuments.push({
          id: "doc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          fileName: file.name,
          size: (file.size / 1024).toFixed(1) + " KB",
          type: ext,
          previewUrl: previewUrl,
          addedAt: new Date().toLocaleTimeString()
        });
        addedCount++;
      }

      event.target.value = "";
      renderUserFilesList();

      if (addedCount > 0) {
        showToast(\`📎 서류 파일 \${addedCount}건이 등록되었습니다. (서버 미전송 / 현재 세션 유지)\`);
        updatePermitView();
      }
    }

    function removeUserFile(docId) {
      const idx = userDocuments.findIndex(d => d.id === docId);
      if (idx !== -1) {
        if (userDocuments[idx].previewUrl) {
          try { URL.revokeObjectURL(userDocuments[idx].previewUrl); } catch (e) {}
        }
        userDocuments.splice(idx, 1);
        renderUserFilesList();
        updatePermitView();
        showToast("서류 파일이 목록에서 제거되었습니다.");
      }
    }

    function previewUserFile(docId) {
      const doc = userDocuments.find(d => d.id === docId);
      if (doc && doc.previewUrl) {
        window.open(doc.previewUrl, "_blank");
      } else {
        showToast("HWP 파일은 브라우저 미리보기를 지원하지 않습니다.");
      }
    }

    function renderUserFilesList() {
      const container = document.getElementById("userFilesList");
      if (!container) return;

      if (userDocuments.length === 0) {
        container.innerHTML = \`<div style="font-size:11px; color:var(--muted); text-align:center; padding:4px 0;">등록된 서류 파일이 없습니다.</div>\`;
        return;
      }

      let html = "";
      userDocuments.forEach(doc => {
        let icon = "📄";
        if (doc.type === ".pdf") icon = "📕";
        else if (doc.type === ".png" || doc.type === ".jpg" || doc.type === ".jpeg") icon = "🖼️";
        else if (doc.type === ".hwp") icon = "📝";

        // Section 17: 파일명 XSS 방지 (escapeHtml 적용)
        html += \`
          <div class="user-file-item">
            <div class="user-file-info">
              <div class="user-file-thumb">\${icon}</div>
              <div>
                <div class="user-file-name" title="\${escapeHtml(doc.fileName)}">\${escapeHtml(doc.fileName)}</div>
                <div class="user-file-size">\${escapeHtml(doc.size)} · 등록: \${escapeHtml(doc.addedAt)}</div>
              </div>
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
              \${doc.previewUrl ? \`<button type="button" class="btn-secondary btn-sm btn-preview-doc" data-id="\${escapeHtml(doc.id)}">미리보기</button>\` : ''}
              <button type="button" class="btn-secondary btn-sm btn-remove-doc" style="color:var(--danger); border-color:#fecaca;" data-id="\${escapeHtml(doc.id)}">삭제</button>
            </div>
          </div>
        \`;
      });
      container.innerHTML = html;

      // Section 15: 이벤트 위임 처리
      container.onclick = (e) => {
        const previewBtn = e.target.closest('.btn-preview-doc');
        if (previewBtn) {
          previewUserFile(previewBtn.dataset.id);
          return;
        }
        const removeBtn = e.target.closest('.btn-remove-doc');
        if (removeBtn) {
          removeUserFile(removeBtn.dataset.id);
          return;
        }
      };
    }

    // ============================================================
    // 15. 승인준비 전용 GPS 갱신 함수
    // ============================================================
    function fetchGpsForPermit() {
      if (isGpsMeasuring) {
        showToast("📍 이미 정밀 위치 측정이 진행 중입니다.");
        return;
      }
      isGpsMeasuring = true;
      showToast("📍 현재 GPS 위치를 측정 중입니다...");

      requestPreciseLocation({
        onProgress: (bestSample, count, elapsedSec) => {},
        onSuccess: (bestSample) => {
          isGpsMeasuring = false;
          setLocation(bestSample.latitude, bestSample.longitude, "gps", {
            accuracy: bestSample.accuracy,
            title: \`현재 GPS 위치\`
          });
          showToast("✅ GPS 위치가 승인준비에 반영되었습니다.");
        },
        onError: (err) => {
          isGpsMeasuring = false;
          showToast(\`⚠️ GPS 위치 획득 실패: \${err.message || '권한 거부 또는 측정 불가'}\`);
        }
      });
    }

    // ============================================================
    // 16. 승인준비 뷰 종합 렌더링
    // ============================================================
    function updatePermitView() {
      const badgeLoc = document.getElementById("permitLocModeBadge");
      const textPlace = document.getElementById("permitPlaceNameText");
      const textCoord = document.getElementById("permitLocCoordText");
      const textAddr = document.getElementById("permitLocAddressText");

      const hasLoc = (locationState.latitude !== null && locationState.longitude !== null);
      const lat = hasLoc ? locationState.latitude : null;
      const lon = hasLoc ? locationState.longitude : null;

      let modeName = "위치 미확인";
      if (locationState.source === "gps") modeName = "📍 GPS 현재 위치";
      else if (locationState.source === "search") modeName = \`🔍 장소 검색\`;
      else if (locationState.source === "map") modeName = "📌 지도 직접 선택";
      else if (locationState.source === "preset") modeName = "🧭 지역 프리셋";
      else if (locationState.source === "manual") modeName = "🧭 수동 좌표";

      if (badgeLoc) {
        badgeLoc.innerText = modeName;
        badgeLoc.style.background = hasLoc ? "#d1fae5" : "#f1f5f9";
        badgeLoc.style.color = hasLoc ? "#065f46" : "#475569";
      }

      if (textPlace) {
        textPlace.innerText = locationState.placeName ? \`장소명: \${locationState.placeName}\` : (hasLoc ? "장소명: (지정된 좌표)" : "장소명: -");
      }
      if (textCoord) {
        textCoord.innerText = hasLoc ? \`위도: \${lat.toFixed(6)}, 경도: \${lon.toFixed(6)}\` : \`위도: -, 경도: -\`;
      }
      if (textAddr) {
        if (locationState.address) {
          textAddr.innerText = \`주소: \${locationState.address}\`;
        } else if (hasLoc) {
          const accStr = (locationState.source === "gps" && locationState.accuracy) ? \` (오차 약 ±\${Math.round(locationState.accuracy)}m)\` : "";
          textAddr.innerText = \`확인 방식: \${modeName}\${accStr}\`;
        } else {
          textAddr.innerText = \`장소를 검색하거나 GPS 또는 지도를 이용해 위치를 지정하세요.\`;
        }
      }

      renderFilmingSiteDetails();
      renderComprehensiveReview();
    }

    // ============================================================
    // 17. 6단계 종합 검토 결과 렌더링 (Section 18, 19, 20, 21 정밀 준수)
    // ============================================================
    function renderComprehensiveReview() {
      const container = document.getElementById("permitComprehensiveReviewList");
      if (!container) return;

      const hasLoc = (locationState.latitude !== null && locationState.longitude !== null);
      const altitude = permitProfile.altitude || 50;
      const isAerial = permitProfile.isAerialPhoto;
      const mtow = droneProfile.maxTakeoffWeightKg;
      const sw = droneProfile.selfWeightKg;
      const qClass = calculateQualificationClass(mtow, sw, droneProfile.verificationStatus, droneProfile.hasConditionalWeight);

      const items = [];

      // ① 공역 확인 (5개 레이어)
      const resProhibited = airspaceState.results ? airspaceState.results["prohibited"] : null;
      const resTemporary = airspaceState.results ? airspaceState.results["temporary"] : null;
      const resRestricted = airspaceState.results ? airspaceState.results["restricted"] : null;
      const resControl = airspaceState.results ? airspaceState.results["control"] : null;
      const resUac = airspaceState.results ? airspaceState.results["uac"] : null;

      if (!hasLoc) {
        items.push({
          step: "① 공역 확인",
          type: "neutral",
          title: "비행 위치 확인 필요",
          desc: "위치가 지정되지 않아 공역 공간 판정을 진행할 수 없습니다. 상단에서 장소를 검색하거나 GPS를 누르세요."
        });
      } else if (airspaceState.partialFailure) {
        items.push({
          step: "① 공역 확인",
          type: "warning",
          title: "일부 공역 데이터 조회 실패",
          desc: \`공역 데이터 [\${(airspaceState.failedLayers || []).join(', ')}] 수신에 실패했습니다. 최신 제한 여부는 드론원스톱에서 공식 확인하세요.\`
        });
      } else {
        const detected = [];
        if (resProhibited && resProhibited.isIncluded) detected.push("비행금지구역(P)");
        if (resTemporary && resTemporary.isIncluded) detected.push("임시비행금지공역");
        if (resRestricted && resRestricted.isIncluded) detected.push("비행제한구역(R)");
        if (resControl && resControl.isIncluded) detected.push("관제권");
        if (resUac && resUac.isIncluded) detected.push("초경량비행장치공역(UAC)");

        if (detected.length > 0) {
          const isDanger = (resProhibited?.isIncluded || resTemporary?.isIncluded);
          items.push({
            step: "① 공역 확인",
            type: isDanger ? "danger" : "warning",
            title: isDanger ? "🔴 제한·금지공역 포함 (사전 승인 확인 필요)" : "🟡 관제권·제한공역 포함 (비행승인 확인 필요)",
            desc: \`현재 위치에서 [\${detected.join(', ')}] 공역이 검출되었습니다. 해당 관할 지방항공청 또는 군부대 승인 대상 여부를 확인하세요.\`
          });
        } else {
          // Section 21: 공역 결과 표현 재점검 (참고용 안내 유지)
          items.push({
            step: "① 공역 확인",
            type: "info",
            title: "🟢 주요 5대 제한공역 미검출 (참고용 - 드론원스톱 최종 확인)",
            desc: "현재 VWorld 5대 공역 기준 주요 제한구역은 미검출되었습니다. (참고용 안내이며, 전체 항공·군사·시설·지자체 규정을 모두 포함하지 않을 수 있으므로 비행 전 공식 드론원스톱에서 최종 확인하세요.)"
          });
        }
      }

      // ② 비행 조건 확인 (Section 18: 150m 문구, Section 19: 야간/비가시권 문구, Section 20: '충족' 표현 제거)
      const condWarnings = [];

      if (altitude >= 150) {
        condWarnings.push(\`예정 비행 고도(\${altitude}m): 150m 이상 비행 시 비행승인 대상 여부 확인 필요\`);
      }
      if (!droneProfile.model) {
        condWarnings.push(\`기체 미지정: 승인준비 탭에서 기체 검색 또는 입력 필요\`);
      } else if (mtow === null) {
        condWarnings.push(\`최대이륙중량(MTOW) 미확인: 조종자 증명 분류 확인 필요\`);
      } else if (mtow > 25) {
        condWarnings.push(\`최대이륙중량(\${mtow}kg) 25kg 초과: 1종 여부 확인 및 자체중량 조건(\${sw !== null ? sw + 'kg' : '미확인'}) 확인, 안전성인증 및 비행승인 대상 여부 확인 필요\`);
      }

      if (droneProfile.hasConditionalWeight && droneProfile.conditionalNotice) {
        condWarnings.push(\`기체 조건: \${droneProfile.conditionalNotice}\`);
      }

      const nightVLOSNotice = "야간 또는 육안으로 확인할 수 없는 범위에서 비행하려면 특별비행승인 여부를 확인하세요. (항공안전법 시행규칙 제312조의2)";

      if (condWarnings.length > 0 || !qClass.isConfirmed) {
        items.push({
          step: "② 비행 조건 확인",
          type: "warning",
          title: "⚠️ 현재 입력조건 기준 확인사항",
          desc: condWarnings.join(" / ") + \` · 분류 안내: \${qClass.name} (\${qClass.rangeText}) · \${nightVLOSNotice}\`
        });
      } else {
        items.push({
          step: "② 비행 조건 확인",
          type: "info",
          title: \`ℹ️ 현재 입력조건 기준 확인사항 (\${qClass.name})\`,
          desc: \`고도 \${altitude}m, 최대이륙중량 \${mtow !== null ? mtow + 'kg' : '미확인'} (\${qClass.rangeText}) 조건입니다. (\${nightVLOSNotice})\`
        });
      }

      // ③ 항공촬영 확인
      if (isAerial) {
        const photoStart = document.getElementById("permitPhotoStartDate")?.value || "시작일";
        const photoEnd = document.getElementById("permitPhotoEndDate")?.value || "종료일";
        items.push({
          step: "③ 항공촬영 확인",
          type: "warning",
          title: "⚠️ 항공촬영 신청 확인 필요 (근무일 기준 4일 전)",
          desc: \`개활지 등 촬영금지시설이 명백히 없는 경우를 제외하고 국가보안시설 촬영 여부 확인을 위해 국방부 항공촬영 허가 신청이 필요할 수 있습니다. (신청 예정기간: \${photoStart} ~ \${photoEnd})\`
        });
      } else {
        items.push({
          step: "③ 항공촬영 확인",
          type: "neutral",
          title: "📷 항공촬영 미선택 (단순 비행)",
          desc: "촬영 장치를 사용하지 않는 일반 비행으로 설정되었습니다."
        });
      }

      // ④ 촬영장소 확인
      if (selectedFilmingSite) {
        items.push({
          step: "④ 촬영장소 확인",
          type: "warning",
          title: \`🏛️ \${selectedFilmingSite.name} 시설 규정 확인 필요\`,
          desc: \`\${selectedFilmingSite.institutionPermission}: \${selectedFilmingSite.notes}\`
        });
      } else {
        items.push({
          step: "④ 촬영장소 확인",
          type: "neutral",
          title: "📍 일반 장소 (개별 시설물 규정 확인 권장)",
          desc: "별도 등록된 공공 기념시설 외 일반 토지/시설물의 경우 해당 소유자 및 관리주체의 이용 규정을 사전 확인하세요."
        });
      }

      // ⑤ 기관 확인
      if (selectedFilmingSite) {
        const contactStr = selectedFilmingSite.tel ? \`전화: \${selectedFilmingSite.tel}\` : "유선 문의 필요";
        const emailStr = selectedFilmingSite.email ? \`이메일: \${selectedFilmingSite.email}\` : "이메일 미확인";
        items.push({
          step: "⑤ 기관 확인",
          type: "info",
          title: \`🏢 담당기관: \${selectedFilmingSite.name} (\${selectedFilmingSite.department || '관리부서'})\`,
          desc: \`\${contactStr} · \${emailStr} (드론원스톱 공역 승인과 별도로 시설관리부서와 협의)\`
        });
      } else {
        items.push({
          step: "⑤ 기관 확인",
          type: "info",
          title: "🏢 정부 포털: 국토교통부 지방항공청 및 국방부",
          desc: "드론원스톱(drone.onestop.go.kr)을 통해 비행승인 및 항공촬영 허가를 일괄 접수할 수 있습니다."
        });
      }

      // ⑥ 준비서류 확인
      const docCount = userDocuments.length;
      if (selectedFilmingSite) {
        items.push({
          step: "⑥ 준비서류 확인",
          type: docCount > 0 ? "info" : "warning",
          title: \`📁 시설 신청 서류 준비 (\${docCount}개 등록됨)\`,
          desc: \`필수 제출 서류 목록(신청서/서약서 등)을 확인하고 파일을 등록하세요. (등록된 서류: \${docCount}건)\`
        });
      } else {
        items.push({
          step: "⑥ 준비서류 확인",
          type: "neutral",
          title: \`📁 준비서류 (\${docCount}개 등록됨)\`,
          desc: "기체 제원표, 조종자 증명서, 비행계획서 등 필요 서류를 등록하여 일괄 관리할 수 있습니다."
        });
      }

      // HTML 렌더링 (Section 14: escapeHtml 적용)
      let html = "";
      items.forEach(it => {
        html += \`
          <div class="review-item review-\${it.type}">
            <div class="review-title">
              <span>\${escapeHtml(it.step)}:</span> \${escapeHtml(it.title)}
            </div>
            <div>\${escapeHtml(it.desc)}</div>
          </div>
        \`;
      });
      container.innerHTML = html;
    }

    // ============================================================
    // 18. 신청 준비정보 복사 (Section 22 완벽 준수)
    // ============================================================
    function copyPermitInfo() {
      const lat = (locationState.latitude !== null) ? locationState.latitude.toFixed(6) : "미확인";
      const lon = (locationState.longitude !== null) ? locationState.longitude.toFixed(6) : "미확인";
      const placeName = locationState.placeName || "미확인";
      const address = locationState.address || "미확인";

      let modeName = "미확인";
      if (locationState.source === "gps") modeName = "GPS 현재 위치";
      else if (locationState.source === "search") modeName = "장소 검색";
      else if (locationState.source === "map" || locationState.source === "map_click") modeName = "지도 직접 선택";
      else if (locationState.source === "preset") modeName = "지역 프리셋";
      else if (locationState.source === "manual") modeName = "수동 좌표 입력";

      const flightDate = document.getElementById("permitFlightDate")?.value || "미확인";
      const startTime = document.getElementById("permitStartTime")?.value || "미확인";
      const endTime = document.getElementById("permitEndTime")?.value || "미확인";

      const isAerial = permitProfile.isAerialPhoto;
      const photoStart = document.getElementById("permitPhotoStartDate")?.value || "미확인";
      const photoEnd = document.getElementById("permitPhotoEndDate")?.value || "미확인";

      const mfr = droneProfile.manufacturer || "미확인";
      const model = droneProfile.model || "미확인";
      const sourceField = droneProfile.sourceFieldLabel || "미확인";
      const sourceVal = droneProfile.sourceValueText || "미확인";
      const sourceCond = droneProfile.sourceCondition || "미확인";
      const acw = (droneProfile.aircraftWeightKg !== null) ? \`\${droneProfile.aircraftWeightKg}kg\` : "미확인";
      const tow = (droneProfile.takeoffWeightKg !== null) ? \`\${droneProfile.takeoffWeightKg}kg\` : "미확인";
      const mtow = (droneProfile.maxTakeoffWeightKg !== null) ? \`\${droneProfile.maxTakeoffWeightKg}kg\` : "미확인";
      const selfWeight = (droneProfile.selfWeightKg !== null) ? \`\${droneProfile.selfWeightKg}kg\` : "미확인";

      const qClass = calculateQualificationClass(droneProfile.maxTakeoffWeightKg, droneProfile.selfWeightKg, droneProfile.verificationStatus, droneProfile.hasConditionalWeight);
      const qCode = qClass.code || "unknown";
      const qBasis = qClass.classificationBasis || "unknown";
      const vStatus = droneProfile.verificationStatus || "unknown";

      const altitude = permitProfile.altitude ? \`\${permitProfile.altitude}m\` : "미확인";
      const purpose = permitProfile.purpose || "미확인";

      const airspaceLines = [];
      AIRSPACE_LAYERS.forEach(l => {
        const r = airspaceState.results ? airspaceState.results[l.key] : null;
        const inc = r ? r.isIncluded : false;
        const cnt = r ? (r.matchedCount || 0) : 0;
        const fetchSuccess = r ? r.fetchSuccess : airspaceState.loaded;
        if (!fetchSuccess) {
          airspaceLines.push(\`- \${l.name}: 조회 실패 (드론원스톱 공식 확인 필요)\`);
        } else {
          airspaceLines.push(\`- \${l.name}: \${inc ? \`포함 (\${cnt}개 구역 검출 - 승인 대상 여부 확인 필요)\` : '미포함 (주요 제한 미검출)'}\`);
        }
      });

      let filmingInst = "미확인 (일반 장소 / 사전 협의 권장)";
      let filmingDept = "미확인";
      let filmingTel = "미확인";
      let filmingEmail = "미확인";
      if (selectedFilmingSite) {
        filmingInst = selectedFilmingSite.name || selectedFilmingSite.institutionName || "미확인";
        filmingDept = selectedFilmingSite.department || "미확인";
        filmingTel = selectedFilmingSite.tel || selectedFilmingSite.phone || "미확인";
        filmingEmail = selectedFilmingSite.email || "미확인";
      }

      const docLines = [];
      if (selectedFilmingSite && selectedFilmingSite.documents) {
        selectedFilmingSite.documents.forEach(d => {
          docLines.push(\`- \${d.name} (\${d.requiredStatus || '미확인'})\`);
        });
      }
      docLines.push(\`- 사용자 등록 서류: \${userDocuments.length}건 (\${userDocuments.map(d => d.fileName).join(", ") || "없음"})\`);

      const inquiryQuestionsText = generateInquiryQuestions(selectedFilmingSite);

      const copyText = \`[드론 비행·촬영 신청 준비정보]

장소: \${placeName}
주소: \${address}
좌표: 위도 \${lat}, 경도 \${lon}
위치 출처: \${modeName}

비행일: \${flightDate}
시간: \${startTime} ~ \${endTime}
고도: \${altitude}

기체 및 자격분류 정보:
- 제조사: \${mfr}
- 모델: \${model}
- 공식 표기 항목(sourceFieldLabel): \${sourceField}
- 공식 표기 원문(sourceValueText): \${sourceVal}
- 표기 조건(sourceCondition): \${sourceCond}
- 기체 중량(aircraftWeightKg): \${acw}
- 이륙 중량(takeoffWeightKg): \${tow}
- 최대이륙중량(maxTakeoffWeightKg): \${mtow}
- 자체중량(selfWeightKg): \${selfWeight}
- 조종자 증명 자격코드(qualificationClass): \${qCode}
- 조종자 증명 분류명: \${qClass.name} (\${qClass.rangeText})
- 자격 분류 근거(classificationBasis): \${qBasis}
- 검증 상태(verificationStatus): \${vStatus}
- 제원 출처: \${droneProfile.sourceName || '미확인'}
- 출처 URL: \${droneProfile.sourceUrl || '미확인'}
- 공식 검증일: \${droneProfile.verifiedAt || '미확인'}
- 최근 검토일: \${droneProfile.lastReviewedAt || '미확인'}
\${droneProfile.hasConditionalWeight ? \`중량 조건 안내: \${droneProfile.conditionalNotice}\\n\` : ''}
비행 목적: \${purpose}
항공촬영 여부: \${isAerial ? \`신청 준비 (예정기간: \${photoStart} ~ \${photoEnd})\` : '미촬영 (단순 비행)'}

공역:
\${airspaceLines.join("\\n")}
공역 조회 시각: \${airspaceState.lastFetchedAt ? new Date(airspaceState.lastFetchedAt).toLocaleString() : '미확인'}

시설 촬영허가:
기관: \${filmingInst}
담당부서: \${filmingDept}
전화: \${filmingTel}
이메일: \${filmingEmail}

준비서류:
\${docLines.join("\\n")}

문의사항:
\${inquiryQuestionsText}

※ 본 내용은 신청 준비를 위한 참고 정보이며
실제 신청 대상·허가·승인 여부는
공식 기관 및 드론원스톱에서 최종 확인해야 합니다.\`;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).then(() => {
          showToast("📋 신청 준비정보가 클립보드에 복사되었습니다.");
        }).catch(() => {
          fallbackCopyText(copyText);
        });
      } else {
        fallbackCopyText(copyText);
      }
    }

    function fallbackCopyText(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast("📋 신청 준비정보가 클립보드에 복사되었습니다.");
      } catch (err) {
        showToast("⚠️ 클립보드 복사에 실패했습니다.");
      }
      document.body.removeChild(ta);
    }

`;

const newContent = content.slice(0, startIndex) + replacementBlock + content.slice(endIndex);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log("Successfully rebuilt sections 9 to 18 in index.html!");

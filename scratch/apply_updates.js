const fs = require('fs');
const path = require('path');

const filePath = path.resolve('index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add escapeHtml right inside <script>
const scriptStartTarget = '  <script>\n    // ============================================================';
const scriptStartReplacement = `  <script>
    // XSS 방지용 HTML 이스케이프 유틸리티
    function escapeHtml(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // ============================================================`;

if (!content.includes(scriptStartTarget)) {
  console.error("Could not find scriptStartTarget");
  process.exit(1);
}
content = content.replace(scriptStartTarget, scriptStartReplacement);

// 2. 150m wording in HTML
content = content.replace(
  '<span style="font-size: 11px; color: var(--primary); font-weight: 600;">법정 기준: 150m</span>',
  '<span style="font-size: 11px; color: var(--primary); font-weight: 600;">150m 이상 비행 시 비행승인 대상 여부 확인</span>'
);
content = content.replace(
  '<div class="form-hint">※ 지표면/건물 상단 기준 150m 이상 비행 시 별도 비행승인 확인 필요</div>',
  '<div class="form-hint">※ 지표면/건물 상단 기준 150m 이상 비행 시 비행승인 대상 여부 확인 필요</div>'
);
content = content.replace(
  'let answer = "드론 비행 및 촬영 전 비행 승인 대상 여부, 고도 150m 제한, 인구 밀집 지역 안전 수칙을 준수하세요. 본 앱은 비행 가능 여부를 최종 확정하지 않으므로 공식 기관 및 드론원스톱(drone.onestop.go.kr)에서 확인하시기 바랍니다.";',
  'let answer = "드론 비행 및 촬영 전 비행 승인 대상 여부, 150m 이상 비행 시 비행승인 대상 여부 확인, 인구 밀집 지역 안전 수칙을 준수하세요. 본 앱은 비행 가능 여부를 최종 확정하지 않으므로 공식 기관 및 드론원스톱(drone.onestop.go.kr)에서 확인하시기 바랍니다.";'
);

console.log("Step 1 & 2 applied successfully");
fs.writeFileSync(filePath, content, 'utf8');

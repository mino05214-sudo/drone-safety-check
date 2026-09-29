/**
 * 공역 폴리곤 클릭 동작 정적 분석 스크립트
 * - handleMapClickSelection 함수가 onEachFeature 클릭에서 실제 호출되는지 검증
 * - openMarkerPopup 파라미터가 false로 전달되는지 검증
 * - 버블링 방지 로직이 올바른 순서인지 검증
 */

const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`[PASS] ${label}`);
    passed++;
  } else {
    console.log(`[FAIL] ${label}`);
    failed++;
  }
}

// ─────────────────────────────────────────────
// 1. onEachFeature 클릭 핸들러에서 handleMapClickSelection 호출 확인
// ─────────────────────────────────────────────
const onEachIdx = content.indexOf('onEachFeature: function (feat, leafletLayer)');
const onEachBlock = content.slice(onEachIdx, onEachIdx + 1200); // 관련 블록만 추출

check(
  '1. onEachFeature 내 leafletLayer.on(click) 존재',
  onEachBlock.includes("leafletLayer.on('click'")
);

check(
  '2. onEachFeature 내 handleMapClickSelection 호출 존재',
  onEachBlock.includes('handleMapClickSelection(e.latlng.lat, e.latlng.lng, false)')
);

check(
  '3. openMarkerPopup = false 로 전달 (폴리곤 팝업과 핀 마커 팝업 분리)',
  onEachBlock.includes('false)')
);

check(
  '4. e.latlng 존재 확인 후 호출 (안전 가드)',
  onEachBlock.includes('e && e.latlng')
);

check(
  '5. stopPropagation 은 handleMapClickSelection 이후에 위치',
  onEachBlock.indexOf('handleMapClickSelection') < onEachBlock.indexOf('stopPropagation')
);

check(
  '6. L.DomEvent.stopPropagation 사용 (표준 Leaflet API)',
  onEachBlock.includes('L.DomEvent.stopPropagation(e)')
);

// ─────────────────────────────────────────────
// 2. handleMapClickSelection 함수 시그니처 확인
// ─────────────────────────────────────────────
check(
  '7. handleMapClickSelection 함수에 openMarkerPopup 파라미터 존재',
  content.includes('function handleMapClickSelection(lat, lon, openMarkerPopup = true)')
);

check(
  '8. openMarkerPopup 조건부 팝업 오픈 구현',
  content.includes('if (openMarkerPopup)') && content.includes('marker.openPopup()')
);

// ─────────────────────────────────────────────
// 3. map.on('click') 핸들러 → handleMapClickSelection 호출 확인 (빈 지도 클릭)
// ─────────────────────────────────────────────
check(
  '9. onMapClick 함수에서 handleMapClickSelection 호출',
  content.includes('function onMapClick(e)') &&
  content.includes('handleMapClickSelection(lat, lon)')
);

// ─────────────────────────────────────────────
// 4. bindPopup 과 클릭 핸들러 모두 존재 (팝업과 위치선택 동시 지원)
// ─────────────────────────────────────────────
check(
  '10. bindPopup 과 클릭 핸들러 모두 onEachFeature 내에 존재',
  onEachBlock.includes('leafletLayer.bindPopup(') &&
  onEachBlock.includes("leafletLayer.on('click'")
);

// ─────────────────────────────────────────────
// 5. selectedMapMarker 정리 로직 (기존 핀 제거 후 새 핀 생성)
// ─────────────────────────────────────────────
check(
  '11. handleMapClickSelection 내 이전 마커 제거 로직 존재',
  content.includes('if (selectedMapMarker && map)') &&
  content.includes('map.removeLayer(selectedMapMarker)')
);

// ─────────────────────────────────────────────
// 6. pendingLocation 저장 확인
// ─────────────────────────────────────────────
const mapClickSelFn = content.slice(
  content.indexOf('function handleMapClickSelection'),
  content.indexOf('function handleMapClickSelection') + 2200
);

check(
  '12. pendingLocation 에 lat/lon/mode 저장',
  mapClickSelFn.includes('pendingLocation = {') &&
  mapClickSelFn.includes('"map_click"')
);

// ─────────────────────────────────────────────
// 7. locationActionCard 업데이트 확인
// ─────────────────────────────────────────────
check(
  '13. handleMapClickSelection 내 showLocationActionCard 호출',
  mapClickSelFn.includes('showLocationActionCard(')
);

check(
  '14. btnText "이 위치로 공역 판정 실행" 포함',
  mapClickSelFn.includes('이 위치로 공역 판정 실행')
);

// ─────────────────────────────────────────────
// 8. toast 표시 확인
// ─────────────────────────────────────────────
check(
  '15. handleMapClickSelection 내 showToast 호출',
  mapClickSelFn.includes('showToast(')
);

// ─────────────────────────────────────────────
// 결과 출력
// ─────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`정적 코드 분석 결과: ${passed} PASSED, ${failed} FAILED`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n✅ 폴리곤 클릭 수정 코드가 올바르게 적용되어 있습니다.');
  console.log('   - onEachFeature 클릭 → handleMapClickSelection(lat, lng, false) 호출 확인');
  console.log('   - bindPopup 은 그대로 유지 (팝업은 Leaflet이 자동 처리)');
  console.log('   - stopPropagation 은 위치 선택 이후에 실행 (순서 정상)');
  console.log('   - openMarkerPopup=false 이므로 마커 팝업은 조용히 추가됨');
  console.log('\n   ※ 실제 동작 확인은 브라우저에서 직접 수행 필요');
} else {
  console.log('\n❌ 일부 항목 실패. 코드를 재확인하세요.');
}

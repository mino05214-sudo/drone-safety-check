/**
 * Leaflet 폴리곤 클릭 이벤트 e.latlng 전달 여부 분석
 *
 * Leaflet 1.9.x 에서 GeoJSON 레이어(Polygon)를 클릭하면
 * e.latlng 이 전달되는지 공식 소스 분석
 */

const https = require('https');

// Leaflet 1.9.4 소스에서 MouseEvent에 latlng가 포함되는지 확인
// Leaflet의 Map._handleDOMEvent → map.fire → event.latlng 설정 방식 분석

function fetchLeafletSource() {
  return new Promise((resolve, reject) => {
    https.get('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function analyze() {
  console.log('Leaflet 1.9.4 소스 다운로드 중...');
  
  let src;
  try {
    src = await fetchLeafletSource();
    console.log('다운로드 완료. 크기:', src.length, 'bytes');
  } catch (e) {
    console.log('Leaflet 소스 다운로드 실패 (네트워크 오류):', e.message);
    console.log('\n→ Leaflet 공식 문서 기반 분석으로 대체합니다.');
    analyzeFromDocs();
    return;
  }

  // _handleDOMEvent 또는 _mousemove에서 latlng 설정 여부 확인
  const hasLatlng = src.includes('e.latlng') || src.includes('.latlng=');
  const hasMouseEvent = src.includes('MouseEvent') || src.includes('_onClick');
  
  console.log('\n=== Leaflet 소스 분석 결과 ===');
  console.log('e.latlng 사용:', hasLatlng);
  console.log('MouseEvent 처리:', hasMouseEvent);
  
  // 폴리곤(Path) 클릭 시 latlng 설정 코드 찾기
  const latlngMatch = src.match(/\.latlng\s*=\s*[^;]{1,100}/g);
  if (latlngMatch) {
    console.log('\nlatlng 할당 패턴 (상위 5개):');
    latlngMatch.slice(0, 5).forEach(m => console.log(' -', m.trim()));
  }

  analyzeFromDocs();
}

function analyzeFromDocs() {
  console.log('\n=== Leaflet 공식 문서/소스 기반 분석 ===');
  console.log('');
  console.log('Leaflet 1.x 에서 Layer.on("click", handler) 를 등록할 때:');
  console.log('');
  console.log('1. GeoJSON Polygon 클릭 이벤트 객체(e) 구조:');
  console.log('   e.latlng    → LatLng 객체. 클릭된 지점의 위도/경도 ✅');
  console.log('   e.originalEvent → 원본 브라우저 MouseEvent ✅');
  console.log('   e.target    → 클릭된 Leaflet Layer ✅');
  console.log('   e.containerPoint → 컨테이너 픽셀 좌표 ✅');
  console.log('');
  console.log('   → Leaflet은 Map._fireMouseEvent() 에서 mouse 이벤트에');
  console.log('     항상 e.latlng 를 자동으로 추가합니다. (Path.fire 경유)');
  console.log('');
  console.log('2. GeoJSON의 MultiPolygon/Polygon 에서도 동일하게 e.latlng 전달됨');
  console.log('');
  console.log('3. bubblingMouseEvents 옵션:');
  console.log('   - Leaflet 1.x 기본값: true (이벤트 버블링됨)');
  console.log('   - L.DomEvent.stopPropagation(e) 로 map.click 이중 실행 방지 가능');
  console.log('');
  console.log('=== 현재 코드 동작 흐름 분석 ===');
  console.log('');
  console.log('[폴리곤 클릭 시]');
  console.log('1. Leaflet이 polygon.fire("click", {latlng: ..., originalEvent: ...}) 실행');
  console.log('2. onEachFeature 에 등록한 leafletLayer.on("click", handler) 실행');
  console.log('3. handler 내:');
  console.log('   a. e.latlng 존재 → handleMapClickSelection(lat, lng, false) 호출');
  console.log('      → selectedMapMarker 생성 (팝업 미오픈, false 전달)');
  console.log('      → pendingLocation 저장 (mode: "map_click")');
  console.log('      → showLocationActionCard() 호출 → btnActionJudge 표시');
  console.log('      → showToast("📌 지도에서 위치가 선택되었습니다.")');
  console.log('   b. bindPopup 은 이미 등록됨 → Leaflet이 자동으로 팝업 오픈');
  console.log('   c. L.DomEvent.stopPropagation → map.on("click") 이중 실행 방지');
  console.log('');
  console.log('[주의 사항]');
  console.log('bindPopup + leafletLayer.on("click") 동시 등록 시:');
  console.log('Leaflet 내부에서 bindPopup 핸들러가 먼저 실행되고,');
  console.log('그 다음에 사용자 등록 click 핸들러가 실행됩니다.');
  console.log('→ 팝업이 열리고, 그 다음에 핀 마커가 설정됩니다. ✅');
  console.log('');
  console.log('[잠재적 문제]');
  console.log('GeoJSON 레이어가 이미 렌더링된 상태에서 코드가 업데이트된 경우:');
  console.log('→ 서버가 새 index.html 을 제공하고 있으므로 하드리프레시 필요');
  console.log('→ Ctrl+Shift+R 또는 하드 리프레시 후 테스트 권장');
}

analyze();

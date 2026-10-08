import fs from "node:fs";

const raw = fs.readFileSync("data/airspace/airspace.geojson", "utf8");
const geojson = JSON.parse(raw);

function pointInPolygon(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function judgePoint(lon, lat) {
  const pt = [lon, lat];
  const matched = [];

  for (const f of geojson.features) {
    const geom = f.geometry;
    if (geom.type === "Polygon") {
      // outer ring
      if (pointInPolygon(pt, geom.coordinates[0])) {
        // check if inside inner ring (hole)
        let inHole = false;
        for (let h = 1; h < geom.coordinates.length; h++) {
          if (pointInPolygon(pt, geom.coordinates[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) {
          matched.push(f);
        }
      }
    }
  }

  // Determine representative status
  let rep = {
    level: "safe",
    title: "주요 제한공역 미검출",
    desc: "현재 확인된 주요 공역 데이터에서 제한공역이 검출되지 않았습니다."
  };

  const priorityOrder = ["PROHIBITED", "RESTRICTED", "CTR", "UAS"];
  for (const prioType of priorityOrder) {
    const topFeat = matched.find(m => m.properties.type === prioType);
    if (topFeat) {
      if (prioType === "PROHIBITED" || prioType === "RESTRICTED") {
        rep = {
          level: "danger",
          title: "비행 전 확인 필요",
          desc: `${topFeat.properties.typeName} (${topFeat.properties.name}) 구역에 포함되어 비행 전 승인 확인이 필요합니다.`
        };
      } else {
        rep = {
          level: "warning",
          title: "비행 전 추가 확인",
          desc: `${topFeat.properties.typeName} (${topFeat.properties.name}) 구역에 포함되어 있습니다.`
        };
      }
      break;
    }
  }

  return {
    point: [lon, lat],
    matchedCount: matched.length,
    matchedTypes: [...new Set(matched.map(m => m.properties.type))],
    matchedFeatures: matched.map(m => ({ id: m.properties.id, name: m.properties.name, type: m.properties.type })),
    uiStatus: rep
  };
}

const testCases = [
  { name: "1. 공역 외부", lon: 128.500000, lat: 36.500000, expectedType: "NONE" },
  { name: "2. 비행금지구역 내부", lon: 127.575270, lat: 38.243051, expectedType: "PROHIBITED" },
  { name: "3. 비행제한구역 내부", lon: 127.502328, lat: 37.523467, expectedType: "RESTRICTED" },
  { name: "4. 관제권 내부", lon: 127.499170, lat: 36.716653, expectedType: "CTR" },
  { name: "5. UAS 내부", lon: 127.007500, lat: 35.739444, expectedType: "UAS" },
  { name: "6. 원전 비행금지구역(P61A) 내부", lon: 129.300000, lat: 35.316815, expectedType: "PROHIBITED" },
];

console.log("=== 6 Core Airspace Decision Tests ===");
let allPassed = true;

for (const tc of testCases) {
  const result = judgePoint(tc.lon, tc.lat);
  console.log(`\n--- [${tc.name}] ---`);
  console.log(`좌표: lon=${tc.lon}, lat=${tc.lat}`);
  console.log(`포함 공역 수: ${result.matchedCount}`);
  console.log(`포함 레이어 타입: ${result.matchedTypes.join(", ") || "(없음)"}`);
  console.log(`매칭된 공역:`, result.matchedFeatures.map(f => `${f.name} [${f.id}] (${f.type})`).join("; ") || "(없음)");
  console.log(`UI 대표 상태: [${result.uiStatus.level}] ${result.uiStatus.title} - ${result.uiStatus.desc}`);

  const passed = tc.expectedType === "NONE" ? (result.matchedCount === 0) : result.matchedTypes.includes(tc.expectedType);
  console.log(`검증 결과: ${passed ? "PASS" : "FAIL"}`);
  if (!passed) allPassed = false;
}

console.log("\n=================================");
console.log(`전체 6개 테스트 판정: ${allPassed ? "ALL PASS" : "FAIL"}`);

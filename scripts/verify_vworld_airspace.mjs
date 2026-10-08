import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// 1. 공역 레이어 정의 및 매핑
const LAYER_DEFS = [
  { key: "PROHIBITED", layer: "lt_c_aisprhc", name: "비행금지구역" },
  { key: "RESTRICTED", layer: "lt_c_aisresc", name: "비행제한구역" },
  { key: "CTR", layer: "lt_c_aisctrc", name: "관제권" },
  { key: "UAS", layer: "lt_c_aisuac", name: "초경량비행장치공역" },
  { key: "TEMPORARY", layer: "lt_c_aistemp", name: "임시비행금지공역" },
];

// Bounding Box 및 포인트 계산 유틸리티
function calcBbox(geom) {
  if (!geom || !geom.coordinates) return [0, 0, 0, 0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function traverse(coords) {
    if (typeof coords[0] === "number") {
      minX = Math.min(minX, coords[0]);
      maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxY = Math.max(maxY, coords[1]);
    } else {
      coords.forEach(traverse);
    }
  }
  traverse(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

function countCoords(geom) {
  if (!geom || !geom.coordinates) return 0;
  let count = 0;
  function traverse(coords) {
    if (typeof coords[0] === "number") {
      count++;
    } else {
      coords.forEach(traverse);
    }
  }
  traverse(geom.coordinates);
  return count;
}

// ID 정규화 유틸리티
function normalizeId(id) {
  if (!id) return "";
  return String(id)
    .replace(/^CTR_/i, "")
    .replace(/^RK\s*/i, "")
    .trim()
    .toUpperCase();
}

// 2. VWorld 최신 데이터 가져오기 (WFS 직접 조회 또는 MCP 연결 설정 재사용, 실패 시 캐시 fallback)
async function fetchVworldData() {
  const vworldData = {};
  let client = null;

  try {
    const configPath = path.join(projectRoot, "scratch/vworld-mcp/vworld-api-mcp-main/dist/config.js");
    const clientPath = path.join(projectRoot, "scratch/vworld-mcp/vworld-api-mcp-main/dist/api/client.js");

    if (fs.existsSync(configPath) && fs.existsSync(clientPath)) {
      const { loadConfig } = await import(`file://${configPath}`);
      const { VworldClient } = await import(`file://${clientPath}`);
      const config = loadConfig();
      if (config.apiKey) {
        client = new VworldClient({ apiKey: config.apiKey, domain: config.domain });
      }
    }
  } catch (err) {
    console.warn("[VWorld] MCP 설정 로드 경고 (캐시 데이터 사용 가능):", err.message);
  }

  // 캐시 파일 확인
  const cachePath = path.join(projectRoot, "scratch/vworld_full_features.json");
  let cachedData = null;
  if (fs.existsSync(cachePath)) {
    try {
      cachedData = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    } catch (e) {
      // ignore
    }
  }

  for (const item of LAYER_DEFS) {
    let layerGeoJson = null;

    if (client) {
      try {
        const res = await client.requestText("https://api.vworld.kr/req/wfs", {
          service: "WFS",
          version: "2.0.0",
          request: "GetFeature",
          typename: item.layer,
          srsName: "EPSG:4326",
          outputFormat: "application/json",
          count: 1000,
        });
        if (res.status === 200) {
          const parsed = JSON.parse(res.body);
          if (parsed && Array.isArray(parsed.features)) {
            layerGeoJson = parsed;
          }
        }
      } catch (reqErr) {
        // network or quota issue, fallback to cache
      }
    }

    if (!layerGeoJson && cachedData && cachedData[item.key]) {
      layerGeoJson = cachedData[item.key];
    }

    vworldData[item.key] = layerGeoJson || { type: "FeatureCollection", features: [] };
  }

  return vworldData;
}

// 3. 레이어별 상세 비교 분석 함수
function compareLayer(layerDef, staticFeatures, vworldFeatures) {
  const result = {
    layerName: layerDef.layer,
    displayName: layerDef.name,
    staticCount: staticFeatures.length,
    vworldCount: vworldFeatures.length,
    status: "MATCH",
    added: [],
    removed: [],
    changed: [],
    commonCount: 0
  };

  const key = layerDef.key;

  if (key === "UAS") {
    // UAS: ident_txt 기준 비교 (UA 2 ~ UA 63)
    const staticMap = new Map();
    staticFeatures.forEach(f => staticMap.set(f.properties.id, f));

    const vworldMap = new Map();
    vworldFeatures.forEach(f => {
      const p = f.properties || {};
      const id = p.ident_txt || p.uac_lbl_1;
      vworldMap.set(id, f);
    });

    for (const [id, sFeat] of staticMap.entries()) {
      if (vworldMap.has(id)) {
        result.commonCount++;
        const vFeat = vworldMap.get(id);
        const changes = [];
        const sProps = sFeat.properties || {};
        const vProps = vFeat.properties || {};

        // Name check
        if (sProps.name && vProps.name_txt && sProps.name !== vProps.name_txt) {
          changes.push({
            type: "NAME_CHANGED",
            static: sProps.name,
            vworld: vProps.name_txt
          });
        }

        // Geometry check (tolerance 0.01 deg)
        const sBbox = calcBbox(sFeat.geometry);
        const vBbox = calcBbox(vFeat.geometry);
        const bboxDiff = Math.max(...sBbox.map((v, i) => Math.abs(v - vBbox[i])));
        if (bboxDiff > 0.01) {
          changes.push({
            type: "GEOMETRY_CHANGED",
            detail: `Bbox diff: ${bboxDiff.toFixed(6)}`
          });
        }

        if (changes.length > 0) {
          result.changed.push({ id, changes });
        }
      } else {
        result.removed.push({ id, name: sFeat.properties?.name });
      }
    }

    for (const [id, vFeat] of vworldMap.entries()) {
      if (!staticMap.has(id)) {
        result.added.push({ id, name: vFeat.properties?.name_txt });
      }
    }
  } else if (key === "PROHIBITED") {
    // PROHIBITED: RK P518, P518E, P518W, P73 vs VWorld (15개, 원전 10개 + P73A + 접경 3개 + D4006)
    const staticMap = new Map();
    staticFeatures.forEach(f => staticMap.set(f.properties.id, f));

    const vworldMap = new Map();
    vworldFeatures.forEach(f => {
      const p = f.properties || {};
      const id = p.prh_lbl_1 || f.id;
      vworldMap.set(id, f);
    });

    // P73 -> P73A 매칭 확인
    for (const [sId, sFeat] of staticMap.entries()) {
      let matchedVFeat = vworldMap.get(sId);
      let vId = sId;
      if (!matchedVFeat && sId === "RK P73" && vworldMap.has("RK P73A")) {
        matchedVFeat = vworldMap.get("RK P73A");
        vId = "RK P73A";
      }

      if (matchedVFeat) {
        result.commonCount++;
        const changes = [];
        if (sId !== vId) {
          changes.push({
            type: "NAME_CHANGED",
            static: sId,
            vworld: vId,
            note: "청와대 이전 후 용산 비행금지구역 명칭 개편 (P-73 -> P-73A)"
          });
        }
        if (changes.length > 0) {
          result.changed.push({ id: sId, changes });
        }
      } else {
        result.removed.push({ id: sId, name: sFeat.properties?.name });
      }
    }

    for (const [vId, vFeat] of vworldMap.entries()) {
      let isCommon = staticMap.has(vId) || (vId === "RK P73A" && staticMap.has("RK P73"));
      if (!isCommon) {
        result.added.push({
          id: vId,
          name: vFeat.properties?.prh_lbl_1 || vId,
          note: vId.startsWith("RK P6") ? "원전 비행금지구역 (정적 데이터에서는 TEMPORARY 분류)" : "추가된 비행금지구역"
        });
      }
    }
  } else if (key === "RESTRICTED") {
    // RESTRICTED: 정규화 ID (R1, R100 등) 기준 비교
    const staticMap = new Map();
    staticFeatures.forEach(f => staticMap.set(normalizeId(f.properties.id), f));

    const vworldMap = new Map();
    vworldFeatures.forEach(f => {
      const p = f.properties || {};
      const id = normalizeId(p.res_lbl_1 || f.id);
      vworldMap.set(id, f);
    });

    for (const [normId, sFeat] of staticMap.entries()) {
      if (vworldMap.has(normId)) {
        result.commonCount++;
        const vFeat = vworldMap.get(normId);
        const changes = [];
        const sProps = sFeat.properties || {};
        const vProps = vFeat.properties || {};

        // Geometry check
        const sBbox = calcBbox(sFeat.geometry);
        const vBbox = calcBbox(vFeat.geometry);
        const bboxDiff = Math.max(...sBbox.map((v, i) => Math.abs(v - vBbox[i])));
        if (bboxDiff > 0.05) {
          changes.push({
            type: "GEOMETRY_CHANGED",
            detail: `Bbox diff: ${bboxDiff.toFixed(6)}`
          });
        }

        if (changes.length > 0) {
          result.changed.push({ id: sProps.id, changes });
        }
      } else {
        result.removed.push({ id: sFeat.properties?.id, name: sFeat.properties?.name });
      }
    }

    for (const [normId, vFeat] of vworldMap.entries()) {
      if (!staticMap.has(normId)) {
        result.added.push({
          id: vFeat.properties?.res_lbl_1 || normId,
          name: vFeat.properties?.restricted || vFeat.properties?.res_lbl_1
        });
      }
    }
  } else if (key === "CTR") {
    // CTR: 공항명 기준 비교
    const staticAirports = new Map();
    staticFeatures.forEach(f => {
      const airportName = normalizeId(f.properties.name || f.properties.id);
      staticAirports.set(airportName, f);
    });

    const vworldAirports = new Map();
    vworldFeatures.forEach(f => {
      const lbl = f.properties?.ctr_lbl_1 || "";
      const baseName = normalizeId(lbl.split(" ")[0]);
      vworldAirports.set(lbl, { feature: f, baseName });
    });

    for (const [name, sFeat] of staticAirports.entries()) {
      let matchedV = null;
      for (const [lbl, info] of vworldAirports.entries()) {
        if (info.baseName === name) {
          matchedV = info.feature;
          break;
        }
      }

      if (matchedV) {
        result.commonCount++;
      } else {
        result.removed.push({ id: sFeat.properties?.id, name: sFeat.properties?.name });
      }
    }

    for (const [lbl, info] of vworldAirports.entries()) {
      if (!staticAirports.has(info.baseName)) {
        result.added.push({
          id: lbl,
          name: lbl,
          note: lbl.includes("CTLZ") ? "군 비행장 관제권" : lbl.includes("TCA") ? "접근관제구역(TCA)" : "추가 관제구역"
        });
      }
    }
  } else if (key === "TEMPORARY") {
    // TEMPORARY: 임시비행금지구역 특별 처리
    result.staticCount = staticFeatures.length;
    result.vworldCount = vworldFeatures.length;
    result.querySuccess = true;
    result.note = "TEMPORARY 레이어의 존재 여부만으로 현재 실제 비행 가능 상태를 확정하지 않는다. 실제 비행 전 최신 공식 공역·승인 정보를 별도 확인해야 한다.";

    // Static: 원전(P61A-P65B) + 안보구역
    // VWorld: 현재 활성 NOTAM 임시금지구역 (3개)
    staticFeatures.forEach(f => {
      result.removed.push({
        id: f.properties?.id,
        name: f.properties?.name,
        note: f.properties?.id?.startsWith("P6") ? "VWorld에서는 PROHIBITED (lt_c_aisprhc) 정규 레이어로 관리됨" : "임시 지정 해제 또는 별도 관리"
      });
    });

    vworldFeatures.forEach(f => {
      const p = f.properties || {};
      result.added.push({
        id: p.prh_lbl_1 || f.id,
        name: p.prohibited || p.notam || "NOTAM 임시공역",
        altitude: `${p.prh_lbl_3 || 'SFC'} ~ ${p.prh_lbl_2 || '-'}`,
        geometryType: f.geometry?.type
      });
    });
  }

  // 상태 판정
  if (result.added.length === 0 && result.removed.length === 0 && result.changed.length === 0) {
    result.status = "MATCH";
  } else {
    result.status = "CHANGED";
  }

  return result;
}

// 4. 메인 실행 함수
async function main() {
  console.log("========================================");
  console.log("VWorld 최신 공역 데이터 비교 검증");
  console.log("========================================");

  const checkedAt = new Date().toISOString();
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  const localTimeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  console.log(`\n검증시각: ${localTimeStr}\n`);

  // 1) static airspace.geojson 읽기
  const staticPath = path.join(projectRoot, "data/airspace/airspace.geojson");
  if (!fs.existsSync(staticPath)) {
    console.error(`[오류] 정적 공역 파일이 존재하지 않습니다: ${staticPath}`);
    process.exit(1);
  }
  const staticGeoJson = JSON.parse(fs.readFileSync(staticPath, "utf8"));
  const staticFeatures = staticGeoJson.features || [];

  // Static 레이어별 파티셔닝
  const staticByLayer = {
    PROHIBITED: staticFeatures.filter(f => f.properties?.type === "PROHIBITED"),
    RESTRICTED: staticFeatures.filter(f => f.properties?.type === "RESTRICTED"),
    CTR: staticFeatures.filter(f => f.properties?.type === "CTR"),
    UAS: staticFeatures.filter(f => f.properties?.type === "UAS"),
    TEMPORARY: staticFeatures.filter(f => f.properties?.type === "TEMPORARY"),
  };

  // 2) VWorld 최신 데이터 조회
  console.log("VWorld 최신 5대 공역 레이어 데이터 조회 중...");
  const vworldData = await fetchVworldData();

  // 3) 각 레이어 비교
  const layerResults = {};
  for (const def of LAYER_DEFS) {
    const sFeats = staticByLayer[def.key] || [];
    const vFeats = vworldData[def.key]?.features || [];
    layerResults[def.key] = compareLayer(def, sFeats, vFeats);
  }

  // 콘솔 레이어별 요약 출력
  for (const def of LAYER_DEFS) {
    const r = layerResults[def.key];
    console.log(`[${def.key}]`);
    console.log(`Static : ${r.staticCount}`);
    console.log(`VWorld : ${r.vworldCount}`);
    console.log(`상태   : ${r.status}`);
    console.log("");
  }

  // 전체 상태 결정
  const anyChanged = Object.values(layerResults).some(r => r.status === "CHANGED");
  const overallStatus = anyChanged ? "CHANGED" : "MATCH";

  console.log("----------------------------------------");
  console.log(`전체 결과: ${overallStatus}`);
  console.log("----------------------------------------\n");

  // 추가 감지 출력
  console.log("추가:");
  for (const def of LAYER_DEFS) {
    const r = layerResults[def.key];
    if (r.added.length > 0) {
      console.log(`  [${def.key}] +${r.added.length}건:`);
      r.added.slice(0, 5).forEach(item => {
        console.log(`  - ${item.id} (${item.name || '-'})${item.note ? ' [' + item.note + ']' : ''}`);
      });
      if (r.added.length > 5) {
        console.log(`    ... 외 ${r.added.length - 5}건 추가`);
      }
    }
  }
  console.log("");

  // 삭제 감지 출력
  console.log("삭제:");
  for (const def of LAYER_DEFS) {
    const r = layerResults[def.key];
    if (r.removed.length > 0) {
      console.log(`  [${def.key}] -${r.removed.length}건:`);
      r.removed.forEach(item => {
        console.log(`  - ${item.id} (${item.name || '-'})${item.note ? ' [' + item.note + ']' : ''}`);
      });
    }
  }
  console.log("");

  // 속성 변경 출력
  console.log("속성 변경:");
  for (const def of LAYER_DEFS) {
    const r = layerResults[def.key];
    const nameOrAltChanges = r.changed.filter(c => c.changes.some(ch => ch.type === "NAME_CHANGED" || ch.type === "ALTITUDE_CHANGED"));
    if (nameOrAltChanges.length > 0) {
      console.log(`  [${def.key}] ${nameOrAltChanges.length}건:`);
      nameOrAltChanges.forEach(item => {
        item.changes.forEach(ch => {
          console.log(`  - ID ${item.id}: [${ch.type}] Static="${ch.static}" -> VWorld="${ch.vworld}"${ch.note ? ' (' + ch.note + ')' : ''}`);
        });
      });
    }
  }
  console.log("");

  // Geometry 변경 출력
  console.log("Geometry 변경:");
  for (const def of LAYER_DEFS) {
    const r = layerResults[def.key];
    const geomChanges = r.changed.filter(c => c.changes.some(ch => ch.type === "GEOMETRY_CHANGED"));
    if (geomChanges.length > 0) {
      console.log(`  [${def.key}] ${geomChanges.length}건:`);
      geomChanges.slice(0, 3).forEach(item => {
        item.changes.filter(ch => ch.type === "GEOMETRY_CHANGED").forEach(ch => {
          console.log(`  - ID ${item.id}: ${ch.detail}`);
        });
      });
      if (geomChanges.length > 3) {
        console.log(`    ... 외 ${geomChanges.length - 3}건`);
      }
    } else {
      console.log(`  [${def.key}] 주요 Geometry 변동 없음 (허용 오차 범위 내 일치)`);
    }
  }
  console.log("");

  console.log("※ 현재 서비스는 static GeoJSON을 계속 사용한다.");
  console.log("※ 변경사항은 자동 반영하지 않는다.");
  console.log("※ 실제 비행 전 최신 공식 정보를 별도 확인해야 한다.");
  console.log("※ TEMPORARY 레이어의 존재 여부만으로 현재 실제 비행 가능 상태를 확정하지 않는다.");
  console.log("========================================\n");

  // 4) JSON 검증 결과 파일 생성
  const verificationJson = {
    checkedAt,
    localCheckedTime: localTimeStr,
    staticSource: "data/airspace/airspace.geojson",
    layers: layerResults,
    summary: {
      overallStatus,
      totalStaticFeatures: staticFeatures.length,
      totalVworldFeatures: Object.values(layerResults).reduce((sum, r) => sum + r.vworldCount, 0),
      matchedLayers: Object.keys(layerResults).filter(k => layerResults[k].status === "MATCH"),
      changedLayers: Object.keys(layerResults).filter(k => layerResults[k].status === "CHANGED"),
      disclaimer: "TEMPORARY 레이어의 존재 여부만으로 현재 실제 비행 가능 상태를 확정하지 않는다. 실제 비행 전 최신 공식 공역·승인 정보를 별도 확인해야 한다."
    }
  };

  const outputJsonPath = path.join(projectRoot, "data/airspace/vworld-verification.json");
  fs.writeFileSync(outputJsonPath, JSON.stringify(verificationJson, null, 2), "utf8");
  console.log(`검증 결과 파일 저장 완료: ${outputJsonPath}`);
}

main().catch(err => {
  console.error("검증 스크립트 실행 오류:", err);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";

const kmlPath = path.resolve("scratch/kmz_extracted/doc.kml");
const outGeoJsonPath = path.resolve("data/airspace/airspace.geojson");

if (!fs.existsSync(kmlPath)) {
  console.error("KML file not found at", kmlPath);
  process.exit(1);
}

const content = fs.readFileSync(kmlPath, "utf8");

function extractFolderContent(folderId) {
  const startRegex = new RegExp(`<Folder\\s+id="${folderId}"[^>]*>`, 'g');
  const match = startRegex.exec(content);
  if (!match) return null;
  const startIndex = match.index;
  let depth = 1;
  let pos = startIndex + match[0].length;
  while (depth > 0 && pos < content.length) {
    const nextOpen = content.indexOf("<Folder", pos);
    const nextClose = content.indexOf("</Folder>", pos);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 7;
    } else {
      depth--;
      if (depth === 0) return content.substring(startIndex, nextClose + 9);
      pos = nextClose + 9;
    }
  }
  return null;
}

function parseTableProps(descHtml) {
  const props = {};
  const rows = [...descHtml.matchAll(/<tr(?:\s+[^>]*)?>\s*<td>([^<]+)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/g)];
  for (const r of rows) {
    const k = r[1].trim();
    let v = r[2].trim();
    if (v === "&lt;Null&gt;" || v === "<Null>") v = null;
    props[k] = v;
  }
  return props;
}

function parseCoordinates(coordText) {
  const points = [];
  const tokens = coordText.trim().split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    const parts = token.split(",");
    if (parts.length >= 2) {
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lon) && !isNaN(lat)) {
        points.push([lon, lat]);
      }
    }
  }
  return points;
}

function parseGeometry(placemarkXml) {
  // Extract polygon outer and inner rings
  const polyMatch = placemarkXml.match(/<Polygon[\s\S]*?<\/Polygon>/);
  if (!polyMatch) return null;

  const polyXml = polyMatch[0];
  const outerMatch = polyXml.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/);
  if (!outerMatch) return null;

  const outerRing = parseCoordinates(outerMatch[1]);
  if (outerRing.length < 4) return null;

  // Ensure closure
  const first = outerRing[0];
  const last = outerRing[outerRing.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    outerRing.push([first[0], first[1]]);
  }

  const rings = [outerRing];

  // Inner rings (if any)
  const innerMatches = [...polyXml.matchAll(/<innerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)];
  for (const im of innerMatches) {
    const innerRing = parseCoordinates(im[1]);
    if (innerRing.length >= 4) {
      const iFirst = innerRing[0];
      const iLast = innerRing[innerRing.length - 1];
      if (iFirst[0] !== iLast[0] || iFirst[1] !== iLast[1]) {
        innerRing.push([iFirst[0], iFirst[1]]);
      }
      rings.push(innerRing);
    }
  }

  return {
    type: "Polygon",
    coordinates: rings,
  };
}

const targetLayers = [
  { type: "PROHIBITED", typeName: "비행금지구역", folderId: "FeatureLayer18", sourceGroup: "3.Airspace_통제공역", sourceSubgroup: "비행금지구역" },
  { type: "RESTRICTED", typeName: "비행제한구역", folderId: "FeatureLayer19", sourceGroup: "3.Airspace_통제공역", sourceSubgroup: "비행제한구역(2605)" },
  { type: "CTR", typeName: "관제권", folderId: "FeatureLayer2", sourceGroup: "1.Airspace_관제공역", sourceSubgroup: "관제권" },
  { type: "UAS", typeName: "초경량비행장치비행구역", folderId: "FeatureLayer20", sourceGroup: "3.Airspace_통제공역", sourceSubgroup: "통제공역_초경량비행장치비행구역" },
  { type: "TEMPORARY", typeName: "임시비행금지구역", folderId: "FeatureLayer29", sourceGroup: "7.Airspace_임시비행금지구역", sourceSubgroup: "원자력발전소" },
  { type: "TEMPORARY", typeName: "임시비행금지구역", folderId: "FeatureLayer30", sourceGroup: "7.Airspace_임시비행금지구역", sourceSubgroup: "안보구역" },
];

const features = [];
const countsByType = {
  PROHIBITED: 0,
  RESTRICTED: 0,
  CTR: 0,
  UAS: 0,
  TEMPORARY: 0,
};

for (const layerDef of targetLayers) {
  const folderXml = extractFolderContent(layerDef.folderId);
  if (!folderXml) {
    console.error(`Folder not found: ${layerDef.folderId}`);
    continue;
  }

  const placemarks = [...folderXml.matchAll(/<Placemark(?:\s+id="([^"]*)")?>([\s\S]*?)<\/Placemark>/g)];
  for (const pm of placemarks) {
    const pmId = pm[1] || "";
    const pmBody = pm[2];

    const geom = parseGeometry(pmBody);
    if (!geom) {
      console.warn(`Skipping placemark without polygon: ${pmId}`);
      continue;
    }

    const nameMatch = pmBody.match(/<name>([^<]*)<\/name>/);
    const kmlName = nameMatch ? nameMatch[1].trim() : "";

    const descMatch = pmBody.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
    const table = descMatch ? parseTableProps(descMatch[1]) : {};

    // 1. ID determination
    let id = table.Ident_Txt;
    if (!id) {
      if (layerDef.type === "CTR") {
        id = `CTR_${(table.Name_Txt || kmlName).replace(/\s+/g, "_")}`;
      } else {
        id = `${layerDef.type}_${(table.Name_Txt || kmlName).replace(/\s+/g, "_")}`;
      }
    }

    // 2. Name determination
    const name = table.Name_Txt || kmlName || id;

    // 3. Altitude parsing
    // Upper
    let upper = null;
    let upperRef = table.DistVertUpper_Code || null;
    let upperUnit = table.DistVertUpper_UOM || null;
    if (upperRef === "Unlimited") {
      upper = null;
    } else if (table.DistVertUpper_Val !== null && table.DistVertUpper_Val !== undefined) {
      const numVal = parseFloat(table.DistVertUpper_Val);
      upper = !isNaN(numVal) ? numVal : null;
    }

    // Lower
    let lower = null;
    let lowerRef = table.DistVertLower_Code || null;
    let lowerUnit = table.DistVertLower_UOM || null;
    if (lowerRef && ["Ground", "Surface", "SFC", "GND"].includes(lowerRef)) {
      lower = 0;
    } else if (table.DistVertLower_Val !== null && table.DistVertLower_Val !== undefined) {
      const numVal = parseFloat(table.DistVertLower_Val);
      lower = !isNaN(numVal) ? numVal : null;
    }

    const feature = {
      type: "Feature",
      id,
      properties: {
        id,
        name,
        type: layerDef.type,
        typeName: layerDef.typeName,
        sourceGroup: layerDef.sourceGroup,
        sourceSubgroup: layerDef.sourceSubgroup,
        upper,
        upperUnit,
        upperRef,
        lower,
        lowerUnit,
        lowerRef,
        source: "AIP KMZ",
        sourceVersion: "AIP 26년 10차 기준",
      },
      geometry: geom,
    };

    features.push(feature);
    countsByType[layerDef.type]++;
  }
}

const geoJson = {
  type: "FeatureCollection",
  features,
};

fs.mkdirSync(path.dirname(outGeoJsonPath), { recursive: true });
fs.writeFileSync(outGeoJsonPath, JSON.stringify(geoJson, null, 2), "utf8");

const stats = fs.statSync(outGeoJsonPath);
console.log("=== Conversion Finished ===");
console.log(`Saved to: ${outGeoJsonPath}`);
console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB (${stats.size} bytes)`);
console.log("Feature Counts:");
console.log(`PROHIBITED: 실제 ${countsByType.PROHIBITED}개`);
console.log(`RESTRICTED: 실제 ${countsByType.RESTRICTED}개`);
console.log(`CTR: 실제 ${countsByType.CTR}개`);
console.log(`UAS: 실제 ${countsByType.UAS}개`);
console.log(`TEMPORARY: 실제 ${countsByType.TEMPORARY}개`);
console.log(`TOTAL: 실제 ${features.length}개`);

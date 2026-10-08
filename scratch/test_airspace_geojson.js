const fs = require('fs');
const path = require('path');

const geoJsonPath = path.resolve(__dirname, '../data/airspace/airspace.geojson');

console.log('=== Airspace GeoJSON Validation ===');
console.log('Target file:', geoJsonPath);

if (!fs.existsSync(geoJsonPath)) {
  console.error('FAIL: File does not exist:', geoJsonPath);
  process.exit(1);
}

const raw = fs.readFileSync(geoJsonPath, 'utf8');
let data;
try {
  data = JSON.parse(raw);
  console.log('PASS: Valid JSON parse');
} catch (e) {
  console.error('FAIL: JSON parse error:', e.message);
  process.exit(1);
}

// 1. FeatureCollection check
if (data.type !== 'FeatureCollection') {
  console.error('FAIL: Root type is not FeatureCollection, got:', data.type);
  process.exit(1);
}
console.log('PASS: type is FeatureCollection');

if (!Array.isArray(data.features)) {
  console.error('FAIL: features is not an array');
  process.exit(1);
}
console.log('PASS: features is array, total length:', data.features.length);

const expectedCounts = {
  PROHIBITED: 14,
  RESTRICTED: 58,
  CTR: 20,
  UAS: 48,
  TEMPORARY: 0,
};

const counts = {
  PROHIBITED: 0,
  RESTRICTED: 0,
  CTR: 0,
  UAS: 0,
  TEMPORARY: 0,
};

const requiredPropKeys = [
  'id', 'name', 'type', 'typeName', 'sourceGroup', 'sourceSubgroup',
  'upper', 'upperUnit', 'upperRef', 'lower', 'lowerUnit', 'lowerRef',
  'source', 'sourceVersion'
];

let invalidGeomCount = 0;
let unclosedRingCount = 0;
let outOfRangeCoordsCount = 0;
let missingPropCount = 0;
const seenIds = new Set();
let duplicateIdCount = 0;

data.features.forEach((f, idx) => {
  if (f.type !== 'Feature') {
    invalidGeomCount++;
    console.error(`FAIL: Feature ${idx} is not type Feature`);
  }

  // Properties check
  const p = f.properties || {};
  for (const k of requiredPropKeys) {
    if (!(k in p)) {
      missingPropCount++;
      console.error(`FAIL: Feature ${idx} missing prop ${k}`);
    }
  }

  if (p.type in counts) {
    counts[p.type]++;
  } else {
    console.error(`FAIL: Unknown type ${p.type} in feature ${idx}`);
  }

  if (seenIds.has(p.id)) {
    duplicateIdCount++;
    console.error(`FAIL: Duplicate ID ${p.id}`);
  }
  seenIds.add(p.id);

  // Geometry check
  const g = f.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) {
    invalidGeomCount++;
    console.error(`FAIL: Feature ${idx} invalid geometry type:`, g?.type);
    return;
  }

  if (g.type === 'Polygon') {
    if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) {
      invalidGeomCount++;
      return;
    }
    g.coordinates.forEach((ring, rIdx) => {
      if (!Array.isArray(ring) || ring.length < 4) {
        invalidGeomCount++;
        return;
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        unclosedRingCount++;
      }
      ring.forEach(pt => {
        if (!Array.isArray(pt) || pt.length !== 2) {
          invalidGeomCount++;
        }
        const [lon, lat] = pt;
        if (typeof lon !== 'number' || typeof lat !== 'number' || isNaN(lon) || isNaN(lat)) {
          invalidGeomCount++;
        }
        if (lon < 120 || lon > 135 || lat < 30 || lat > 42) {
          outOfRangeCoordsCount++;
        }
      });
    });
  }
});

console.log('\n--- Category Counts ---');
for (const [k, exp] of Object.entries(expectedCounts)) {
  const actual = counts[k];
  const pass = actual === exp;
  console.log(`${k}: 실제 ${actual}개 (예상 ${exp}개) -> ${pass ? 'PASS' : 'FAIL'}`);
}
console.log(`TOTAL: 실제 ${data.features.length}개 (예상 140개) -> ${data.features.length === 140 ? 'PASS' : 'FAIL'}`);

console.log('\n--- Integrity Checks ---');
console.log('Invalid geometries:', invalidGeomCount, invalidGeomCount === 0 ? 'PASS' : 'FAIL');
console.log('Unclosed rings:', unclosedRingCount, unclosedRingCount === 0 ? 'PASS' : 'FAIL');
console.log('Out of range coords:', outOfRangeCoordsCount, outOfRangeCoordsCount === 0 ? 'PASS' : 'FAIL');
console.log('Missing properties:', missingPropCount, missingPropCount === 0 ? 'PASS' : 'FAIL');
console.log('Duplicate IDs:', duplicateIdCount, duplicateIdCount === 0 ? 'PASS' : 'FAIL');

const allPass = (
  data.features.length === 140 &&
  invalidGeomCount === 0 &&
  unclosedRingCount === 0 &&
  outOfRangeCoordsCount === 0 &&
  missingPropCount === 0 &&
  duplicateIdCount === 0 &&
  Object.keys(expectedCounts).every(k => counts[k] === expectedCounts[k])
);

console.log('\n=== Overall Test Result ===');
if (allPass) {
  console.log('ALL PASS: airspace.geojson is 100% valid.');
  process.exit(0);
} else {
  console.error('FAIL: One or more validation checks failed.');
  process.exit(1);
}

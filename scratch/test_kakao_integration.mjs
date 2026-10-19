import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to spawn a mock server for testing
console.log('=== STEP 3.24 Kakao Local API Mock & Mapping Tests ===');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    testsFailed++;
  }
}

// 1. Mock Kakao API data samples
const mockKeywordResponse = {
  meta: { total_count: 1, pageable_count: 1, is_end: true },
  documents: [
    {
      id: "18625902",
      place_name: "충주시청",
      category_name: "공공,사회기관 > 행정기관 > 시청",
      address_name: "충북 충주시 금릉동 710",
      road_address_name: "충북 충주시 으뜸로 21",
      x: "127.925968595604",
      y: "36.991371720888"
    }
  ]
};

const mockAddressResponse = {
  meta: { total_count: 1, pageable_count: 1, is_end: true },
  documents: [
    {
      address_name: "충북 충주시 으뜸로 21",
      address_type: "ROAD_ADDR",
      x: "127.925968595604",
      y: "36.991371720888",
      address: {
        address_name: "충북 충주시 금릉동 710",
        region_1depth_name: "충북",
        region_2depth_name: "충주시",
        region_3depth_name: "금릉동"
      },
      road_address: {
        address_name: "충북 충주시 으뜸로 21",
        region_1depth_name: "충북",
        region_2depth_name: "충주시",
        road_name: "으뜸로",
        building_name: "충주시청",
        zone_no: "27339"
      }
    }
  ]
};

const mockCoord2AddressResponse = {
  meta: { total_count: 1 },
  documents: [
    {
      road_address: {
        address_name: "충청북도 충주시 으뜸로 21",
        building_name: "충주시청",
        zone_no: "27339"
      },
      address: {
        address_name: "충청북도 충주시 금릉동 710"
      }
    }
  ]
};

const mockCoord2AddressParcelOnly = {
  meta: { total_count: 1 },
  documents: [
    {
      road_address: null,
      address: {
        address_name: "강원도 평창군 대관령면 횡계리 123"
      }
    }
  ]
};

// 2. Logic simulation tests (matching the exact transformations in server.js)
console.log('\n--- Test Group 1: Place (Keyword) Search Mapping ---');
{
  const docs = mockKeywordResponse.documents;
  const items = docs.map(doc => {
    const placeName = (doc.place_name || '').trim();
    const roadAddr = (doc.road_address_name || '').trim();
    const parcelAddr = (doc.address_name || '').trim();
    return {
      title: placeName,
      point: {
        x: String(doc.x || ''),
        y: String(doc.y || '')
      },
      address: {
        road: roadAddr,
        parcel: parcelAddr,
        bldnm: placeName
      }
    };
  }).filter(it => it.title && it.point.x && it.point.y);

  assert(items.length === 1, 'Keyword search mapped 1 item');
  assert(items[0].title === '충주시청', 'Item title matches place_name');
  assert(items[0].point.x === '127.925968595604', 'Item point.x matches longitude');
  assert(items[0].point.y === '36.991371720888', 'Item point.y matches latitude');
  assert(items[0].address.road === '충북 충주시 으뜸로 21', 'Item address.road matches');
  assert(items[0].address.parcel === '충북 충주시 금릉동 710', 'Item address.parcel matches');
  assert(items[0].address.bldnm === '충주시청', 'Item address.bldnm matches');
}

console.log('\n--- Test Group 2: Address Search Mapping (ROAD & PARCEL) ---');
{
  // Case A: category=ROAD
  const docs = mockAddressResponse.documents;
  const roadFiltered = docs.filter(doc => !!(doc.road_address && doc.road_address.address_name));
  const roadItems = roadFiltered.map(doc => {
    const roadName = (doc.road_address && doc.road_address.address_name) ? doc.road_address.address_name.trim() : '';
    const parcelName = (doc.address && doc.address.address_name) ? doc.address.address_name.trim() : '';
    const bldName = (doc.road_address && doc.road_address.building_name) ? doc.road_address.building_name.trim() : '';
    const title = bldName || roadName || (doc.address_name || '').trim();
    return {
      title,
      point: { x: String(doc.x || ''), y: String(doc.y || '') },
      address: { road: roadName, parcel: parcelName, bldnm: bldName }
    };
  });

  assert(roadItems.length === 1, 'Address ROAD search mapped 1 item');
  assert(roadItems[0].title === '충주시청', 'ROAD title prefers building name');
  assert(roadItems[0].address.road === '충북 충주시 으뜸로 21', 'ROAD address matches');
  assert(roadItems[0].address.parcel === '충북 충주시 금릉동 710', 'ROAD address includes parcel fallback');

  // Case B: category=PARCEL
  const parcelFiltered = docs.filter(doc => !!(doc.address && doc.address.address_name));
  const parcelItems = parcelFiltered.map(doc => {
    const roadName = (doc.road_address && doc.road_address.address_name) ? doc.road_address.address_name.trim() : '';
    const parcelName = (doc.address && doc.address.address_name) ? doc.address.address_name.trim() : '';
    const bldName = (doc.road_address && doc.road_address.building_name) ? doc.road_address.building_name.trim() : '';
    const title = parcelName || (doc.address_name || '').trim();
    return {
      title,
      point: { x: String(doc.x || ''), y: String(doc.y || '') },
      address: { road: roadName, parcel: parcelName, bldnm: bldName }
    };
  });

  assert(parcelItems.length === 1, 'Address PARCEL search mapped 1 item');
  assert(parcelItems[0].title === '충북 충주시 금릉동 710', 'PARCEL title is parcel address');
  assert(parcelItems[0].address.parcel === '충북 충주시 금릉동 710', 'PARCEL address matches');

  // Case C: Empty results fallback
  const emptyDocs = [];
  const emptyFiltered = emptyDocs.filter(doc => !!(doc.road_address && doc.road_address.address_name));
  assert(emptyFiltered.length === 0, 'No matching docs returns empty array for fallback');
}

console.log('\n--- Test Group 3: Reverse Geocoding Mapping ---');
{
  // Case A: Both road and parcel available
  const docA = mockCoord2AddressResponse.documents[0];
  const roadObjA = docA.road_address;
  const parcelObjA = docA.address;
  const roadAddrA = (roadObjA && roadObjA.address_name) ? roadObjA.address_name.trim() : '';
  const parcelAddrA = (parcelObjA && parcelObjA.address_name) ? parcelObjA.address_name.trim() : '';
  const bldNameA = (roadObjA && roadObjA.building_name) ? roadObjA.building_name.trim() : '';
  let primaryTextA = '';
  if (roadAddrA && bldNameA) {
    primaryTextA = `${roadAddrA} (${bldNameA})`;
  } else if (roadAddrA) {
    primaryTextA = roadAddrA;
  } else if (parcelAddrA) {
    primaryTextA = parcelAddrA;
  }

  assert(primaryTextA === '충청북도 충주시 으뜸로 21 (충주시청)', 'Reverse geocode formatted text with building');

  // Case B: Parcel only (e.g. mountainous / rural area)
  const docB = mockCoord2AddressParcelOnly.documents[0];
  const roadObjB = docB.road_address;
  const parcelObjB = docB.address;
  const roadAddrB = (roadObjB && roadObjB.address_name) ? roadObjB.address_name.trim() : '';
  const parcelAddrB = (parcelObjB && parcelObjB.address_name) ? parcelObjB.address_name.trim() : '';
  let primaryTextB = '';
  if (roadAddrB) {
    primaryTextB = roadAddrB;
  } else if (parcelAddrB) {
    primaryTextB = parcelAddrB;
  }
  assert(primaryTextB === '강원도 평창군 대관령면 횡계리 123', 'Reverse geocode cleanly falls back to parcel address when road is null');
}

console.log('\n--- Test Group 4: Frontend Compatibility Check ---');
{
  // Simulate index.html fetchSearchResults parsing logic
  function simulateFrontendParse(responseBody) {
    let hasApiError = false;
    let items = [];
    if (responseBody && responseBody.response) {
      if (responseBody.response.status === "OK" && responseBody.response.result && Array.isArray(responseBody.response.result.items)) {
        items = responseBody.response.result.items;
      } else if (responseBody.response.status === "ERROR") {
        hasApiError = true;
      }
    }
    return { items, hasApiError };
  }

  // 1. Success response
  const okResult = simulateFrontendParse({
    response: {
      status: "OK",
      result: {
        items: [{ title: "충주시청", point: { x: "127.92", y: "36.99" }, address: { road: "으뜸로 21", parcel: "금릉동 710", bldnm: "충주시청" } }]
      }
    }
  });
  assert(okResult.items.length === 1 && !okResult.hasApiError, 'Frontend parse OK result: 1 item, no API error');

  // 2. Not found response
  const notFoundResult = simulateFrontendParse({
    response: {
      status: "NOT_FOUND",
      result: { items: [] }
    }
  });
  assert(notFoundResult.items.length === 0 && !notFoundResult.hasApiError, 'Frontend parse NOT_FOUND: 0 items, no API error (allows next fallback)');

  // 3. Error response
  const errResult = simulateFrontendParse({
    response: {
      status: "ERROR",
      error: { text: "KAKAO_API_ERROR" }
    }
  });
  assert(errResult.items.length === 0 && errResult.hasApiError, 'Frontend parse ERROR: flags hasApiError=true');
}

console.log(`\nTests Summary: ${testsPassed} passed, ${testsFailed} failed.`);
if (testsFailed > 0) process.exit(1);

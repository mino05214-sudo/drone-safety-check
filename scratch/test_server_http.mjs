import { spawn } from 'child_process';
import http from 'http';

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    }).on('error', reject);
  });
}

async function run() {
  // 테스트 환경 격리: 자식 프로세스에서 .env 로드를 차단하여 API 키 미설정 상태(500 에러)를 순수 재현
  const serverProc = spawn('node', [
    '-e',
    "const fs = require('fs'); const path = require('path'); const origExists = fs.existsSync; fs.existsSync = (p) => (typeof p === 'string' && path.basename(p) === '.env' ? false : origExists(p)); require('./server.js');"
  ], {
    env: { ...process.env, PORT: '5599', KAKAO_REST_API_KEY: '' },
    cwd: process.cwd()
  });

  serverProc.stdout.on('data', (d) => process.stdout.write(`[Server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`[Server Err] ${d}`));

  // Wait for server to start
  await new Promise(r => setTimeout(r, 1000));

  let passed = 0;
  let failed = 0;
  function check(cond, msg) {
    if (cond) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Missing Key Check - Search
    const searchNoKey = await get(5599, '/api/search?query=충주시청&type=place');
    check(searchNoKey.statusCode === 500, 'Search without KAKAO_REST_API_KEY returns 500');
    check(searchNoKey.json?.response?.status === 'ERROR', 'Search without key returns response.status = ERROR');
    check(searchNoKey.json?.error?.includes('KAKAO_REST_API_KEY'), 'Search without key mentions KAKAO_REST_API_KEY in error');

    // 2. Missing Key Check - Reverse
    const reverseNoKey = await get(5599, '/api/reverse?lat=36.9913&lon=127.9259');
    check(reverseNoKey.statusCode === 500, 'Reverse without KAKAO_REST_API_KEY returns 500');
    check(reverseNoKey.json?.response?.status === 'ERROR', 'Reverse without key returns response.status = ERROR');

    // 3. Validation - Search
    const searchNoQuery = await get(5599, '/api/search?type=place');
    check(searchNoQuery.statusCode === 400, 'Search without query returns 400 Bad Request');

    const searchBadType = await get(5599, '/api/search?query=test&type=invalid');
    check(searchBadType.statusCode === 400, 'Search with invalid type returns 400 Bad Request');

    const searchBadCategory = await get(5599, '/api/search?query=test&type=address&category=INVALID');
    check(searchBadCategory.statusCode === 400, 'Search with invalid category returns 400 Bad Request');

    // 4. Validation - Reverse
    const reverseNoCoords = await get(5599, '/api/reverse');
    check(reverseNoCoords.statusCode === 400, 'Reverse without coords returns 400 Bad Request');

    const reverseBadCoords = await get(5599, '/api/reverse?lat=999&lon=999');
    check(reverseBadCoords.statusCode === 400, 'Reverse with out-of-range coords returns 400 Bad Request');

    // 5. Existing /api/wfs preserved check
    const wfsBad = await get(5599, '/api/wfs?TYPENAME=invalid_layer');
    check(wfsBad.statusCode === 400, '/api/wfs rejects invalid layer with 400 (intact)');

    // 6. Static files check
    const root = await get(5599, '/');
    check(root.statusCode === 200, 'Static files / index.html served with 200 OK');

    const airspaceGeojson = await get(5599, '/data/airspace/airspace.geojson');
    check(airspaceGeojson.statusCode === 200, 'airspace.geojson static fallback served with 200 OK');

  } finally {
    serverProc.kill();
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nEnd-to-End Server Tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

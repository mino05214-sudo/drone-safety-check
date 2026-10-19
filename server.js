const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 0. .env 파일 수동 로드 (__dirname 기준 유지, 외부 패키지 없는 순수 Node.js)
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    } catch (e) {
      console.error('[Env] Error loading .env:', e.message);
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 5500;
const PUBLIC_DIR = path.resolve(__dirname);

// VWorld 4개 핵심 공역 레이어 화이트리스트 (PROHIBITED, RESTRICTED, CTR, UAS)
const ALLOWED_TYPENAMES = new Set([
  'lt_c_aisprhc', // 비행금지구역
  'lt_c_aisresc', // 비행제한구역
  'lt_c_aisctrc', // 관제권
  'lt_c_aisuac'   // 초경량비행장치공역
]);

// 서빙 허용 MIME 타입 목록 (화이트리스트 기반 보안)
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

// 웹으로 절대 제공하지 않을 민감 파일 목록 (개발 검증 JSON 포함)
const BLOCKED_FILENAMES = new Set([
  '.env',
  '.gitignore',
  'server.js',
  'package.json',
  'package-lock.json',
  'vworld-verification.json',
  'airspace-update-candidates.json'
]);

// IP 기반 간단한 인메모리 요청 제한 (VWorld Proxy 악용 방지)
const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 60, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) rateLimitMap.delete(ip);
  }
}, 60000);

const server = http.createServer((req, res) => {
  // 보안 헤더 설정
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Same-origin 기반 CORS 제어 (와일드카드 '*' 제거)
  const reqOrigin = req.headers['origin'];
  const reqHost = req.headers['x-forwarded-host'] || req.headers['host'];
  const allowedOriginEnv = process.env.ALLOWED_ORIGIN;
  let isOriginAllowed = false;

  if (reqOrigin) {
    if (allowedOriginEnv && reqOrigin === allowedOriginEnv) {
      isOriginAllowed = true;
    } else if (reqHost && (reqOrigin === `http://${reqHost}` || reqOrigin === `https://${reqHost}`)) {
      isOriginAllowed = true;
    } else if (reqOrigin === 'https://drone-safety-check.onrender.com') {
      isOriginAllowed = true;
    } else if (reqOrigin.startsWith('http://localhost:') || reqOrigin.startsWith('http://127.0.0.1:')) {
      isOriginAllowed = true;
    }

    if (isOriginAllowed) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(isOriginAllowed || !reqOrigin ? 204 : 403);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  // IP 기반 rate limit 검증 (API 프록시 및 진단 엔드포인트)
  if (parsedUrl.pathname === '/api/wfs' || parsedUrl.pathname === '/req/wfs' || parsedUrl.pathname === '/api/search' || parsedUrl.pathname === '/api/reverse' || parsedUrl.pathname === '/api/egress-diagnostics') {
    const trustProxy = process.env.TRUST_PROXY === 'true';
    let clientIp = req.socket.remoteAddress || 'unknown';
    if (trustProxy && req.headers['x-forwarded-for']) {
      clientIp = req.headers['x-forwarded-for'].split(',')[0].trim();
    }
    if (!checkRateLimit(clientIp, 60, 60000)) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '429 Too Many Requests: 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.' }));
      return;
    }
  }

  // 1. VWorld WFS 프록시 엔드포인트 (/api/wfs 또는 /req/wfs)
  if (parsedUrl.pathname === '/api/wfs' || parsedUrl.pathname === '/req/wfs') {
    const query = parsedUrl.query;
    const typename = query.TYPENAME || query.typename;

    // 1-1. 허용된 레이어 검증
    if (!typename || !ALLOWED_TYPENAMES.has(typename)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '400 Bad Request: 허용되지 않은 TYPENAME입니다.' }));
      return;
    }

    // 1-2. BBOX 크기 기본 검증
    const bbox = query.BBOX || query.bbox;
    if (bbox) {
      const parts = bbox.split(',').map(Number);
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        const [minX, minY, maxX, maxY] = parts;
        if (Math.abs(maxX - minX) > 2.0 || Math.abs(maxY - minY) > 2.0) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: '400 Bad Request: BBOX 요청 범위가 너무 큽니다.' }));
          return;
        }
      }
    }

    // 1-3. 환경변수 확인
    const vworldApiKey = process.env.VWORLD_API_KEY;
    const vworldDomain = process.env.VWORLD_DOMAIN || 'localhost';

    if (!vworldApiKey) {
      console.error('[Server Error] VWorld API Key가 설정되지 않았습니다.');
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '서버 환경변수(VWORLD_API_KEY)가 설정되지 않았습니다.' }));
      return;
    }

    // 1-4. VWorld 요청 쿼리 구성 (API Key는 서버 측에서만 주입)
    const targetParams = new URLSearchParams();
    for (const [key, val] of Object.entries(query)) {
      if (key.toUpperCase() !== 'KEY' && key.toUpperCase() !== 'DOMAIN') {
        targetParams.append(key, val);
      }
    }
    targetParams.append('KEY', vworldApiKey.trim());
    targetParams.append('DOMAIN', vworldDomain.trim());

    const targetUrl = `https://api.vworld.kr/req/wfs?${targetParams.toString()}`;

    // 보안 로깅: API Key 노출 없이 레이어명과 BBOX만 출력
    console.log(`[Proxy] WFS Forwarding -> Layer: ${typename}, BBOX: ${bbox || 'N/A'}`);

    const startTime = Date.now();
    let timeoutTriggered = false;

    const proxyReq = https.get(targetUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'DroneSafetyCheck/1.0',
        'Accept': 'application/json, application/geo+json, application/xml, text/xml, */*'
      }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
      timeoutTriggered = true;
      const elapsedMs = Date.now() - startTime;
      console.error(`[Proxy Timeout - WFS] elapsed=${elapsedMs}ms timeoutTriggered=${timeoutTriggered}`);
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '504 Gateway Timeout: VWorld WFS 서버 응답 시간 초과 (10초)' }));
      }
    });

    proxyReq.on('error', (err) => {
      const elapsedMs = Date.now() - startTime;
      const cause = timeoutTriggered ? 'AFTER_LOCAL_TIMEOUT' : 'REMOTE_OR_NETWORK_ERROR';
      console.error(
        `[Proxy Error - WFS] cause=${cause} timeoutTriggered=${timeoutTriggered} elapsed=${elapsedMs}ms code=${err.code || 'NONE'} message=${err.message}`
      );
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '502 Bad Gateway: VWorld WFS 요청 실패' }));
      }
    });
    return;
  }

  // Kakao Local REST API 전용 요청 유틸리티
  function requestKakaoApi(endpointPath, queryParams, apiKey) {
    return new Promise((resolve, reject) => {
      const searchParams = new URLSearchParams(queryParams);
      const options = {
        hostname: 'dapi.kakao.com',
        port: 443,
        path: `${endpointPath}?${searchParams.toString()}`,
        method: 'GET',
        headers: {
          'Authorization': `KakaoAK ${apiKey}`,
          'User-Agent': 'DroneSafetyCheck/1.0',
          'Accept': 'application/json'
        },
        timeout: 10000
      };

      let timeoutTriggered = false;
      const req = https.request(options, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          if (data.length < 524288) { // 최대 512KB 제한
            data += chunk;
          }
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            return reject(new Error('Kakao API 반환 데이터 JSON 파싱 실패'));
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        });
      });

      req.on('timeout', () => {
        timeoutTriggered = true;
        req.destroy();
        const err = new Error('Kakao API timeout (10s)');
        err.code = 'ETIMEDOUT';
        reject(err);
      });

      req.on('error', (err) => {
        if (timeoutTriggered) return;
        reject(err);
      });

      req.end();
    });
  }

  // 2. Kakao 장소/주소 검색 프록시 엔드포인트 (/api/search)
  if (parsedUrl.pathname === '/api/search') {
    const query = parsedUrl.query;
    const searchKeyword = (query.query || query.q || '').trim();
    const searchType = (query.type || 'place').toLowerCase(); // 'place' | 'address'

    if (searchType !== 'place' && searchType !== 'address') {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '400 Bad Request: type은 place 또는 address여야 합니다.' }));
      return;
    }

    let searchCategory = null;
    if (searchType === 'address') {
      const rawCategory = (query.category || 'ROAD').toUpperCase();
      if (rawCategory !== 'ROAD' && rawCategory !== 'PARCEL') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '400 Bad Request: category는 ROAD 또는 PARCEL이어야 합니다.' }));
        return;
      }
      searchCategory = rawCategory;
    }

    if (!searchKeyword) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '400 Bad Request: 검색어(query)를 입력하세요.' }));
      return;
    }

    if (searchKeyword.length > 100) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '400 Bad Request: 검색어가 너무 깁니다.' }));
      return;
    }

    const kakaoApiKey = (process.env.KAKAO_REST_API_KEY || '').trim();
    if (!kakaoApiKey) {
      console.error('[Server Error] KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.');
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: '서버 환경변수(KAKAO_REST_API_KEY)가 설정되지 않았습니다.',
        response: { status: 'ERROR', error: { text: 'KAKAO_REST_API_KEY_NOT_CONFIGURED' } }
      }));
      return;
    }

    const startTime = Date.now();
    console.log(`[Proxy] Kakao Search Forwarding -> Type: ${searchType}${searchCategory ? ` (${searchCategory})` : ''}, Length: ${searchKeyword.length}`);

    (async () => {
      try {
        if (searchType === 'place') {
          // Kakao 장소명(키워드) 검색
          const kakaoRes = await requestKakaoApi(
            '/v2/local/search/keyword.json',
            { query: searchKeyword, size: '15' },
            kakaoApiKey
          );

          if (kakaoRes.statusCode !== 200) {
            console.error(`[Proxy Error - Kakao Search Keyword] HTTP ${kakaoRes.statusCode}`);
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: `Kakao 장소 검색 API 오류 (HTTP ${kakaoRes.statusCode})`,
              response: { status: 'ERROR', error: { text: 'KAKAO_API_ERROR', code: kakaoRes.statusCode } }
            }));
            return;
          }

          const docs = (kakaoRes.data && Array.isArray(kakaoRes.data.documents)) ? kakaoRes.data.documents : [];
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

          const elapsedMs = Date.now() - startTime;
          console.log(`[Proxy Done - Kakao Place Search] elapsed=${elapsedMs}ms items=${items.length}`);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          if (items.length === 0) {
            res.end(JSON.stringify({
              response: {
                status: 'NOT_FOUND',
                result: { items: [] }
              }
            }));
          } else {
            res.end(JSON.stringify({
              response: {
                status: 'OK',
                result: { items: items }
              }
            }));
          }
        } else {
          // Kakao 주소 검색 (type === 'address')
          const kakaoRes = await requestKakaoApi(
            '/v2/local/search/address.json',
            { query: searchKeyword, size: '15' },
            kakaoApiKey
          );

          if (kakaoRes.statusCode !== 200) {
            console.error(`[Proxy Error - Kakao Search Address] HTTP ${kakaoRes.statusCode}`);
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: `Kakao 주소 검색 API 오류 (HTTP ${kakaoRes.statusCode})`,
              response: { status: 'ERROR', error: { text: 'KAKAO_API_ERROR', code: kakaoRes.statusCode } }
            }));
            return;
          }

          const docs = (kakaoRes.data && Array.isArray(kakaoRes.data.documents)) ? kakaoRes.data.documents : [];
          let filteredDocs = docs;

          if (searchCategory === 'ROAD') {
            filteredDocs = docs.filter(doc => !!(doc.road_address && doc.road_address.address_name));
          } else if (searchCategory === 'PARCEL') {
            filteredDocs = docs.filter(doc => !!(doc.address && doc.address.address_name));
          }

          const items = filteredDocs.map(doc => {
            const roadName = (doc.road_address && doc.road_address.address_name) ? doc.road_address.address_name.trim() : '';
            const parcelName = (doc.address && doc.address.address_name) ? doc.address.address_name.trim() : '';
            const bldName = (doc.road_address && doc.road_address.building_name) ? doc.road_address.building_name.trim() : '';
            let title = '';
            if (searchCategory === 'ROAD') {
              title = bldName || roadName || (doc.address_name || '').trim();
            } else if (searchCategory === 'PARCEL') {
              title = parcelName || (doc.address_name || '').trim();
            } else {
              title = bldName || roadName || parcelName || (doc.address_name || '').trim();
            }

            return {
              title: title,
              point: {
                x: String(doc.x || ''),
                y: String(doc.y || '')
              },
              address: {
                road: roadName,
                parcel: parcelName,
                bldnm: bldName
              }
            };
          }).filter(it => it.title && it.point.x && it.point.y);

          const elapsedMs = Date.now() - startTime;
          console.log(`[Proxy Done - Kakao Address Search] category=${searchCategory} elapsed=${elapsedMs}ms items=${items.length}`);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          if (items.length === 0) {
            res.end(JSON.stringify({
              response: {
                status: 'NOT_FOUND',
                result: { items: [] }
              }
            }));
          } else {
            res.end(JSON.stringify({
              response: {
                status: 'OK',
                result: { items: items }
              }
            }));
          }
        }
      } catch (err) {
        const elapsedMs = Date.now() - startTime;
        if (err.code === 'ETIMEDOUT') {
          console.error(`[Proxy Timeout - Kakao Search] elapsed=${elapsedMs}ms`);
          if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: '504 Gateway Timeout: Kakao 검색 서버 응답 시간 초과 (10초)',
              response: { status: 'ERROR', error: { text: 'GATEWAY_TIMEOUT' } }
            }));
          }
        } else {
          console.error(`[Proxy Error - Kakao Search] elapsed=${elapsedMs}ms code=${err.code || 'NONE'} message=${err.message}`);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: '502 Bad Gateway: Kakao 검색 요청 실패',
              response: { status: 'ERROR', error: { text: 'BAD_GATEWAY' } }
            }));
          }
        }
      }
    })();
    return;
  }

  // 3. Kakao 좌표 -> 주소 역지오코딩 엔드포인트 (/api/reverse)
  if (parsedUrl.pathname === '/api/reverse') {
    const query = parsedUrl.query;
    const lat = parseFloat(query.lat || query.latitude);
    const lon = parseFloat(query.lon || query.lng || query.longitude);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '400 Bad Request: 유효한 lat, lon 좌표가 필요합니다.' }));
      return;
    }

    const kakaoApiKey = (process.env.KAKAO_REST_API_KEY || '').trim();
    if (!kakaoApiKey) {
      console.error('[Server Error] KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.');
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: '서버 환경변수(KAKAO_REST_API_KEY)가 설정되지 않았습니다.',
        response: { status: 'ERROR', error: { text: 'KAKAO_REST_API_KEY_NOT_CONFIGURED' } }
      }));
      return;
    }

    const startTime = Date.now();
    console.log(`[Proxy] Kakao Reverse Geocode -> Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`);

    (async () => {
      try {
        const kakaoRes = await requestKakaoApi(
          '/v2/local/geo/coord2address.json',
          { x: String(lon), y: String(lat), input_coord: 'WGS84' },
          kakaoApiKey
        );

        if (kakaoRes.statusCode !== 200) {
          console.error(`[Proxy Error - Kakao Reverse] HTTP ${kakaoRes.statusCode}`);
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            error: `Kakao 좌표 주소 변환 API 오류 (HTTP ${kakaoRes.statusCode})`,
            response: { status: 'ERROR', error: { text: 'KAKAO_API_ERROR', code: kakaoRes.statusCode } }
          }));
          return;
        }

        const docs = (kakaoRes.data && Array.isArray(kakaoRes.data.documents)) ? kakaoRes.data.documents : [];
        if (docs.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            response: {
              status: 'NOT_FOUND',
              result: []
            }
          }));
          return;
        }

        const doc = docs[0];
        const roadObj = doc.road_address;
        const parcelObj = doc.address;

        const roadAddr = (roadObj && roadObj.address_name) ? roadObj.address_name.trim() : '';
        const parcelAddr = (parcelObj && parcelObj.address_name) ? parcelObj.address_name.trim() : '';
        const bldName = (roadObj && roadObj.building_name) ? roadObj.building_name.trim() : '';

        let primaryText = '';
        if (roadAddr && bldName) {
          primaryText = `${roadAddr} (${bldName})`;
        } else if (roadAddr) {
          primaryText = roadAddr;
        } else if (parcelAddr) {
          primaryText = parcelAddr;
        }

        if (!primaryText) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            response: {
              status: 'NOT_FOUND',
              result: []
            }
          }));
          return;
        }

        const elapsedMs = Date.now() - startTime;
        console.log(`[Proxy Done - Kakao Reverse] elapsed=${elapsedMs}ms`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          response: {
            status: 'OK',
            result: [
              {
                text: primaryText,
                road: roadAddr || null,
                parcel: parcelAddr || null,
                building: bldName || null,
                zipCode: (roadObj && roadObj.zone_no) ? roadObj.zone_no : null
              }
            ]
          }
        }));
      } catch (err) {
        const elapsedMs = Date.now() - startTime;
        if (err.code === 'ETIMEDOUT') {
          console.error(`[Proxy Timeout - Kakao Reverse] elapsed=${elapsedMs}ms`);
          if (!res.headersSent) {
            res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: '504 Gateway Timeout: Kakao 주소 서버 응답 시간 초과 (10초)',
              response: { status: 'ERROR', error: { text: 'GATEWAY_TIMEOUT' } }
            }));
          }
        } else {
          console.error(`[Proxy Error - Kakao Reverse] elapsed=${elapsedMs}ms code=${err.code || 'NONE'} message=${err.message}`);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: '502 Bad Gateway: Kakao 주소 변환 요청 실패',
              response: { status: 'ERROR', error: { text: 'BAD_GATEWAY' } }
            }));
          }
        }
      }
    })();
    return;
  }


  // 4. 임시 아웃바운드 HTTPS 연결 비교 진단 엔드포인트 (GET /api/egress-diagnostics)
  if (parsedUrl.pathname === '/api/egress-diagnostics') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '405 Method Not Allowed' }));
      return;
    }

    const trustProxy = process.env.TRUST_PROXY === 'true';
    let clientIp = req.socket.remoteAddress || 'unknown';
    if (trustProxy && req.headers['x-forwarded-for']) {
      clientIp = req.headers['x-forwarded-for'].split(',')[0].trim();
    }
    if (!checkRateLimit(`${clientIp}:egress-diag`, 5, 60000)) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '429 Too Many Requests: 진단 요청 한도를 초과했습니다.' }));
      return;
    }

    if (process.env.ENABLE_EGRESS_DIAGNOSTICS !== 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ enabled: false, error: '403 Forbidden: Egress diagnostics disabled' }));
      return;
    }

    executeEgressDiagnosticsOnce()
      .then((diagResult) => {
        if (!res.headersSent) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(diagResult));
        }
      })
      .catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ enabled: true, error: sanitizeDiagMessage(err.message) }));
        }
      });
    return;
  }

  // 5. 정적 파일 서빙 (path.resolve + path.relative 엄격한 보안 검증)
  let reqPath = parsedUrl.pathname;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // URL 디코딩 및 상대 경로 계산
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(reqPath);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  const safePath = path.resolve(PUBLIC_DIR, '.' + path.normalize(decodedPath));
  const rel = path.relative(PUBLIC_DIR, safePath);

  // 3-1. PUBLIC_DIR 외부 경로 접근 시도 차단 (Directory Traversal 및 접두어 우회 방지)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: 접근이 거부되었습니다.');
    return;
  }

  // 3-2. 민감 파일 및 숨김 파일/서버 내부 파일/개발용 폴더 차단
  const baseName = path.basename(safePath).toLowerCase();
  const relNormalized = rel.replace(/\\/g, '/');
  const isInternalFolder = relNormalized.startsWith('scratch/') || relNormalized.startsWith('scripts/') || relNormalized.startsWith('.git/');
  const isHidden = baseName.startsWith('.') || rel.split(path.sep).some(segment => segment.startsWith('.'));
  if (isHidden || isInternalFolder || BLOCKED_FILENAMES.has(baseName)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: 접근할 수 없는 파일입니다.');
    return;
  }

  // 3-3. 허용된 확장자 확인
  const ext = path.extname(safePath).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: 지원하지 않는 파일 형식입니다.');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    fs.readFile(safePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

function getEgressDiagTargets() {
  const vworldApiKey = (process.env.VWORLD_API_KEY || '').trim();
  const vworldDomain = (process.env.VWORLD_DOMAIN || 'localhost').trim();

  const searchParams = new URLSearchParams({
    service: 'search',
    request: 'search',
    version: '2.0',
    query: '충주시청',
    type: 'place',
    size: '1',
    page: '1',
    format: 'json',
    errorformat: 'json',
    crs: 'EPSG:4326',
    key: vworldApiKey,
    domain: vworldDomain
  });

  const addressParams = new URLSearchParams({
    service: 'address',
    request: 'getAddress',
    version: '2.0',
    point: '127.93,36.97',
    format: 'json',
    type: 'both',
    crs: 'epsg:4326',
    key: vworldApiKey,
    domain: vworldDomain
  });

  const wfsParams = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '1.1.0',
    REQUEST: 'GetFeature',
    TYPENAME: 'lt_c_aisprhc',
    OUTPUTFORMAT: 'application/json',
    SRSNAME: 'EPSG:4326',
    BBOX: '127.92,36.96,127.94,36.98',
    MAXFEATURES: '1',
    KEY: vworldApiKey,
    DOMAIN: vworldDomain
  });

  return [
    Object.freeze({ name: 'example.com', url: 'https://example.com/' }),
    Object.freeze({ name: 'api.vworld.kr', url: 'https://api.vworld.kr/' }),
    Object.freeze({ name: 'vworld-search', url: `https://api.vworld.kr/req/search?${searchParams.toString()}` }),
    Object.freeze({ name: 'vworld-address', url: `https://api.vworld.kr/req/address?${addressParams.toString()}` }),
    Object.freeze({ name: 'vworld-wfs', url: `https://api.vworld.kr/req/wfs?${wfsParams.toString()}` })
  ];
}

let egressDiagPromise = null;
let egressDiagCache = null;

function sanitizeDiagMessage(msg) {
  if (!msg) return 'NONE';
  return String(msg)
    .replace(/https?:\/\/[^\s"']+/gi, '<URL_REDACTED>')
    .replace(/\[[0-9a-fA-F:.]+(?:%[0-9a-zA-Z._-]+)?\](?::\d+)?/g, '<IPV6_REDACTED>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<IP_REDACTED>')
    .replace(/(?:[0-9a-fA-F]{0,4}:){2,}[0-9a-fA-F:.]*(?:%[0-9a-zA-Z._-]+)?(?::\d+)?/g, '<IPV6_REDACTED>');
}

function probeHttpsTarget(target) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const state = {
      target: target.name,
      lookup: 'PENDING',
      family: 'NONE',
      connect: false,
      secureConnect: false,
      authorized: 'NONE',
      authorizationError: 'NONE',
      httpStatus: 'NONE',
      contentType: 'NONE',
      closedBeforeResponse: false,
      timeoutTriggered: false,
      cause: 'UNKNOWN',
      errorCode: 'NONE',
      errorMessage: 'NONE',
      providerStatus: 'NONE',
      featuresCount: 'NONE',
      elapsedMs: 0
    };

    let finished = false;
    let responseReceived = false;

    const finalize = (cause) => {
      if (finished) return;
      finished = true;
      state.cause = cause;
      state.elapsedMs = Date.now() - startTime;
      console.log(
        `[Egress Diag] target=${state.target} cause=${state.cause} lookup=${state.lookup} family=${state.family} connect=${state.connect} secureConnect=${state.secureConnect} authorized=${state.authorized} authorizationError=${state.authorizationError} httpStatus=${state.httpStatus} providerStatus=${state.providerStatus} featuresCount=${state.featuresCount} closedBeforeResponse=${state.closedBeforeResponse} timeoutTriggered=${state.timeoutTriggered} errorCode=${state.errorCode} errorMessage="${state.errorMessage}" elapsed=${state.elapsedMs}ms`
      );
      resolve(state);
    };

    try {
      const req = https.get(target.url, {
        agent: false,
        timeout: 5000,
        headers: {
          'User-Agent': 'DroneSafetyCheck/1.0',
          'Accept': 'application/json, application/geo+json, application/xml, text/xml, */*'
        }
      }, (res) => {
        responseReceived = true;
        state.httpStatus = res.statusCode;
        state.contentType = res.headers['content-type'] || 'NONE';

        let bodyText = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (bodyText.length < 65536) {
            bodyText += chunk;
          }
        });
        res.on('end', () => {
          try {
            const trimmed = bodyText.trim();
            if (trimmed.startsWith('{')) {
              const json = JSON.parse(trimmed);
              if (json.response) {
                if (json.response.status) {
                  state.providerStatus = String(json.response.status);
                } else if (json.response.error) {
                  state.providerStatus = `ERROR:${json.response.error.code || 'UNKNOWN'}:${json.response.error.text || ''}`.trim();
                }
              } else if (json.error) {
                state.providerStatus = `ERROR:${json.error.code || json.error.status || 'UNKNOWN'}`;
              }
              if (Array.isArray(json.features)) {
                state.featuresCount = json.features.length;
                if (state.providerStatus === 'NONE') {
                  state.providerStatus = 'GEOJSON_OK';
                }
              }
            }
          } catch (_) {}
          finalize('HTTP_RESPONSE_RECEIVED');
        });
      });

      req.on('socket', (socket) => {
        socket.on('lookup', (err, _address, family) => {
          if (err) {
            state.lookup = `ERROR:${err.code || 'UNKNOWN'}`;
          } else {
            state.lookup = 'OK';
          }
          state.family = family ? String(family) : 'NONE';
        });

        socket.on('connect', () => {
          state.connect = true;
        });

        socket.on('secureConnect', () => {
          state.secureConnect = true;
          state.authorized = Boolean(socket.authorized);
          const authErr = socket.authorizationError;
          state.authorizationError = authErr ? String(authErr.code || authErr.message || authErr) : 'NONE';
        });

        socket.on('close', () => {
          if (!responseReceived && !finished) {
            state.closedBeforeResponse = true;
          }
        });
      });

      req.on('timeout', () => {
        if (finished) return;
        state.timeoutTriggered = true;
        state.closedBeforeResponse = !responseReceived;
        state.errorCode = 'ETIMEDOUT';
        state.errorMessage = sanitizeDiagMessage('Diagnostic timeout (5000ms)');
        finalize('DIAGNOSTIC_TIMEOUT');
        req.destroy();
      });

      req.on('error', (err) => {
        if (finished) return;
        state.closedBeforeResponse = !responseReceived;
        state.errorCode = err.code || 'NONE';
        state.errorMessage = sanitizeDiagMessage(err.message);
        finalize('REMOTE_OR_NETWORK_ERROR');
      });
    } catch (syncErr) {
      state.closedBeforeResponse = true;
      state.errorCode = syncErr.code || 'SYNC_ERR';
      state.errorMessage = sanitizeDiagMessage(syncErr.message);
      finalize('REMOTE_OR_NETWORK_ERROR');
    }
  });
}

function executeEgressDiagnosticsOnce() {
  if (egressDiagCache) {
    return Promise.resolve(egressDiagCache);
  }
  if (egressDiagPromise) {
    return egressDiagPromise;
  }
  egressDiagPromise = (async () => {
    console.log('[Egress Diag] Starting one-time outbound HTTPS comparison (5 targets)...');
    const targets = getEgressDiagTargets();
    const results = [];
    for (const target of targets) {
      const res = await probeHttpsTarget(target);
      results.push(res);
    }
    console.log('[Egress Diag] Outbound HTTPS comparison finished.');
    egressDiagCache = {
      enabled: true,
      executedAt: new Date().toISOString(),
      targets: results
    };
    return egressDiagCache;
  })().finally(() => {
    egressDiagPromise = null;
  });
  return egressDiagPromise;
}

function runEgressDiagnosticsIfEnabled() {
  if (process.env.ENABLE_EGRESS_DIAGNOSTICS !== 'true') {
    return;
  }
  setImmediate(async () => {
    try {
      await executeEgressDiagnosticsOnce();
    } catch (err) {
      console.error('[Egress Diag] Unexpected error:', sanitizeDiagMessage(err.message));
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}/`);
  console.log(`[Server] VWorld WFS proxy enabled at /api/wfs`);
  console.log(`[Server] Kakao search proxy enabled at /api/search`);
  console.log(`[Server] Kakao reverse geocode proxy enabled at /api/reverse`);
  if (process.env.KAKAO_REST_API_KEY) {
    console.log(`[Server] Kakao REST API Key: configured`);
  } else {
    console.warn(`[Server Warning] KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.`);
  }
  if (process.env.VWORLD_API_KEY) {
    console.log(`[Server] VWorld WFS API Key: configured`);
  } else {
    console.warn(`[Server Warning] VWorld API Key가 설정되지 않았습니다.`);
  }
  runEgressDiagnosticsIfEnabled();
});

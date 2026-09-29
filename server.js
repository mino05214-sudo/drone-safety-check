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

// VWorld 5개 공역 레이어 화이트리스트
const ALLOWED_TYPENAMES = new Set([
  'lt_c_aisprhc', // 비행금지구역
  'lt_c_aistemp', // 임시비행금지공역
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
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

// 웹으로 절대 제공하지 않을 민감 파일 목록
const BLOCKED_FILENAMES = new Set([
  '.env',
  '.gitignore',
  'server.js',
  'package.json',
  'package-lock.json'
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
    } else if (reqOrigin.endsWith('.onrender.com')) {
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

  // IP 기반 rate limit 검증 (API 프록시 엔드포인트)
  if (parsedUrl.pathname === '/api/wfs' || parsedUrl.pathname === '/req/wfs' || parsedUrl.pathname === '/api/search') {
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

    const proxyReq = https.get(targetUrl, { timeout: 10000 }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '504 Gateway Timeout: VWorld WFS 서버 응답 시간 초과 (10초)' }));
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy Error - WFS]', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '502 Bad Gateway: VWorld WFS 요청 실패' }));
      }
    });
    return;
  }

  // 2. VWorld 장소/주소 검색 프록시 엔드포인트 (/api/search)
  if (parsedUrl.pathname === '/api/search') {
    const query = parsedUrl.query;
    const searchKeyword = (query.query || query.q || '').trim();
    const searchType = (query.type || 'place').toLowerCase(); // 'place' | 'address'

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

    const vworldApiKey = process.env.VWORLD_API_KEY;
    const vworldDomain = process.env.VWORLD_DOMAIN || 'localhost';

    if (!vworldApiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '서버 환경변수(VWORLD_API_KEY)가 설정되지 않았습니다.' }));
      return;
    }

    const targetParams = new URLSearchParams({
      service: 'search',
      request: 'search',
      version: '2.0',
      crs: 'EPSG:4326',
      size: '5',
      page: '1',
      query: searchKeyword,
      type: (searchType === 'address') ? 'address' : 'place',
      format: 'json',
      errorformat: 'json',
      key: vworldApiKey.trim(),
      domain: vworldDomain.trim()
    });

    const targetUrl = `https://api.vworld.kr/req/search?${targetParams.toString()}`;
    console.log(`[Proxy] Search Forwarding -> Type: ${searchType}, Query: ${searchKeyword.slice(0, 20)}`);

    const proxyReq = https.get(targetUrl, { timeout: 10000 }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '504 Gateway Timeout: VWorld 검색 서버 응답 시간 초과 (10초)' }));
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy Error - Search]', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '502 Bad Gateway: VWorld 검색 요청 실패' }));
      }
    });
    return;
  }

  // 3. 정적 파일 서빙 (path.resolve + path.relative 엄격한 보안 검증)
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

  // 3-2. 민감 파일 및 숨김 파일/서버 내부 파일 차단
  const baseName = path.basename(safePath).toLowerCase();
  const isHidden = baseName.startsWith('.') || rel.split(path.sep).some(segment => segment.startsWith('.'));
  if (isHidden || BLOCKED_FILENAMES.has(baseName)) {
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}/`);
  console.log(`[Server] VWorld proxy enabled at /api/wfs`);
  console.log(`[Server] VWorld search proxy enabled at /api/search`);
  if (process.env.VWORLD_API_KEY) {
    console.log(`[Server] VWorld API Key: configured`);
  } else {
    console.warn(`[Server Warning] VWorld API Key가 설정되지 않았습니다.`);
  }
});

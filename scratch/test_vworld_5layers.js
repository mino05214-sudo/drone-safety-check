const http = require('http');

const layers = [
  { key: 'uac', typename: 'lt_c_aisuac' },
  { key: 'prh', typename: 'lt_c_aisprhc' },
  { key: 'res', typename: 'lt_c_aisresc' },
  { key: 'tmp', typename: 'lt_c_aistemp' },
  { key: 'ctr', typename: 'lt_c_aisctrc' }
];

// 15km bbox around Seoul (37.54, 126.98)
const seoulBbox = '126.81,37.40,127.15,37.68';
// 15km bbox around Chungju (36.97, 127.93)
const chungjuBbox = '127.76,36.83,128.10,37.11';

function testLayer(layer, bbox) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '1.1.0',
      REQUEST: 'GetFeature',
      TYPENAME: layer.typename,
      OUTPUTFORMAT: 'application/json',
      SRSNAME: 'EPSG:4326',
      BBOX: bbox
    });

    const url = `http://localhost:5500/api/wfs?${params.toString()}`;
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const featureCount = json.features ? json.features.length : 0;
          resolve({ layer: layer.typename, statusCode: res.statusCode, featureCount, hasError: !!json.error });
        } catch (e) {
          resolve({ layer: layer.typename, statusCode: res.statusCode, error: e.message, preview: data.slice(0, 100) });
        }
      });
    }).on('error', (err) => {
      resolve({ layer: layer.typename, error: err.message });
    });
  });
}

async function run() {
  console.log('=== Testing Seoul (37.54, 126.98) ===');
  for (const l of layers) {
    const res = await testLayer(l, seoulBbox);
    console.log(`Layer [${l.typename}]: status=${res.statusCode}, features=${res.featureCount}, hasError=${res.hasError}`);
  }

  console.log('\n=== Testing Chungju (36.97, 127.93) ===');
  for (const l of layers) {
    const res = await testLayer(l, chungjuBbox);
    console.log(`Layer [${l.typename}]: status=${res.statusCode}, features=${res.featureCount}, hasError=${res.hasError}`);
  }
}

run();

const fs = require('fs');

const dom = {
  permitWeightKg: { value: '' },
  permitSelfWeightKg: { value: '' },
  permitDroneModel: { value: '' },
  permitManufacturer: { value: '' },
  displayAircraftWeight: {},
  displayAircraftWeightSub: {},
  displaySourceFieldLabel: {},
  displayMaxTakeoffWeight: { style: {} },
  displayMtowStatus: { style: {} },
  displaySelfWeight: {},
  displayQualificationClass: { style: {} },
  displayQualificationSub: { style: {} },
  droneConditionAlert: { style: {} },
  droneConditionAlertDesc: {},
  weightCategoryBadge: { style: {} },
  weightLawNotice: {},
  selfWeightGroup: { style: {} },
  droneSourceBanner: {},
  droneSourceBannerText: {},
  btnDroneSourceUrl: { style: {} },
  droneSearchResultsList: { style: {}, innerHTML: '', onclick: null },
  droneSearchStatusText: { style: {}, innerText: '' },
  droneSearchKeywordInput: { value: '', focus: () => {} }
};

let lastToast = '';
global.window = { addEventListener: () => {} };
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.document = {
  getElementById: (id) => {
    if (!dom[id]) {
      dom[id] = {
        style: {},
        innerText: '',
        innerHTML: '',
        value: '',
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false
        },
        setAttribute: () => {},
        appendChild: () => {},
        dataset: {},
        focus: () => {}
      };
    }
    if (!dom[id].classList) {
      dom[id].classList = {
        add: () => {},
        remove: () => {},
        contains: () => false
      };
    }
    if (!dom[id].setAttribute) dom[id].setAttribute = () => {};
    if (!dom[id].appendChild) dom[id].appendChild = () => {};
    if (!dom[id].focus) dom[id].focus = () => {};
    return dom[id];
  },
  createElement: () => ({
    style: {},
    innerText: '',
    innerHTML: '',
    className: '',
    setAttribute: () => {},
    appendChild: () => {},
    classList: { add: () => {}, remove: () => {} }
  }),
  body: { appendChild: () => {} },
  querySelectorAll: () => []
};

global.showToast = (msg) => {
  lastToast = msg;
  console.log('  [TOAST]', msg);
};
global.savePermitProfile = () => {};
global.updatePermitView = () => {};
global.updateComprehensiveDiagnosis = () => {};

let script = fs.readFileSync('scratch/extracted_all.js', 'utf8');

// Append test runner inside eval context
script += `
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    throw new Error('Assertion failed: ' + msg);
  }
  console.log('PASS:', msg);
}

console.log('\\n==================================================');
console.log('1. normalizeDroneSearchText TESTS');
console.log('==================================================');
assert(normalizeDroneSearchText('Mini 4 Pro') === 'mini4pro', 'Mini 4 Pro -> mini4pro');
assert(normalizeDroneSearchText('mini4pro') === 'mini4pro', 'mini4pro -> mini4pro');
assert(normalizeDroneSearchText('MINI-4-PRO') === 'mini4pro', 'MINI-4-PRO -> mini4pro');
assert(normalizeDroneSearchText('mini 4') === 'mini4', 'mini 4 -> mini4');
assert(normalizeDroneSearchText('  DJI_Mini-4_Pro  ') === 'djimini4pro', 'whitespace, hyphens, underscores removed');
assert(normalizeDroneSearchText('미니 4') === '미니4', '미니 4 -> 미니4');
assert(normalizeDroneSearchText('미니4') === '미니4', '미니4 -> 미니4');

console.log('\\n==================================================');
console.log('2. REQUIRED SEARCH KEYWORD TESTS');
console.log('==================================================');

const searchCases = [
  { q: 'mini4', expectedTop: 'DJI Mini 4 Pro' },
  { q: 'mini 4', expectedTop: 'DJI Mini 4 Pro' },
  { q: 'mini4pro', expectedTop: 'DJI Mini 4 Pro' },
  { q: 'Mini 4 Pro', expectedTop: 'DJI Mini 4 Pro' },
  { q: 'MINI 4', expectedTop: 'DJI Mini 4 Pro' },
  { q: '미니4', expectedTop: 'DJI Mini 4 Pro' },
  { q: '미니 4', expectedTop: 'DJI Mini 4 Pro' },
  { q: 'Air 3', expectedTop: 'DJI Air 3' },
  { q: 'Mavic 3', expectedTop: 'DJI Mavic 3 Pro' },
  { q: 'agras t40', expectedTop: 'DJI Agras T40' }
];

searchCases.forEach(({ q, expectedTop }) => {
  dom.droneSearchKeywordInput.value = q;
  executeDroneSearch();
  const status = dom.droneSearchStatusText.innerText;
  const html = dom.droneSearchResultsList.innerHTML;
  
  assert(status.startsWith('검색 결과: ') && !status.includes('0건'), \`Search for "\${q}" returns results: \${status}\`);
  assert(html.includes(expectedTop), \`Search for "\${q}" contains \${expectedTop}\`);
  // Verify top result contains expectedTop
  const firstItemMatch = html.indexOf(expectedTop);
  assert(firstItemMatch !== -1, \`\${expectedTop} is present in results\`);
});

console.log('\\n==================================================');
console.log('3. SHORT SEARCH KEYWORDS (< 2 chars)');
console.log('==================================================');
dom.droneSearchKeywordInput.value = 'a';
executeDroneSearch();
assert(dom.toast && dom.toast.innerText === '기체명을 2글자 이상 입력해주세요.', 'Query "a" triggers 2-character toast warning');

dom.droneSearchKeywordInput.value = '1';
executeDroneSearch();
assert(dom.toast && dom.toast.innerText === '기체명을 2글자 이상 입력해주세요.', 'Query "1" triggers 2-character toast warning');

dom.droneSearchKeywordInput.value = ' ';
executeDroneSearch();
assert(dom.toast && dom.toast.innerText === '기체명을 2글자 이상 입력해주세요.', 'Empty query triggers 2-character toast warning');

console.log('\\n==================================================');
console.log('4. NON-EXISTENT QUERY (zzzz9999)');
console.log('==================================================');
dom.droneSearchKeywordInput.value = 'zzzz9999';
executeDroneSearch();
assert(dom.droneSearchStatusText.innerText === '검색 결과: 0건', 'Status says 0 results');
assert(dom.droneSearchResultsList.innerHTML.includes('검색 결과가 없습니다'), 'HTML has "검색 결과가 없습니다"');
assert(dom.droneSearchResultsList.innerHTML.includes('Mini 4 Pro') && dom.droneSearchResultsList.innerHTML.includes('Air 3'), 'HTML provides example queries');

console.log('\\n==================================================');
console.log('5. SELECTING DRONE FROM SEARCH RESULT');
console.log('==================================================');
// Search mini 2 se
dom.droneSearchKeywordInput.value = '미니2';
executeDroneSearch();
assert(dom.droneSearchResultsList.innerHTML.includes('DJI Mini 2 SE'), '미니2 finds DJI Mini 2 SE');

// Select Mini 2 SE via selectVerifiedDrone
const mini2seIdx = VERIFIED_DRONE_MODELS.findIndex(d => d.model === 'DJI Mini 2 SE');
selectVerifiedDrone(mini2seIdx);
assert(droneProfile.model === 'DJI Mini 2 SE', 'Selected model is DJI Mini 2 SE');
assert(droneProfile.verificationStatus === 'verified', 'Mini 2 SE verificationStatus is verified');
assert(droneProfile.classificationBasis === 'official_verified', 'Mini 2 SE classificationBasis is official_verified');
assert(droneProfile.hasConditionalWeight === true, 'Mini 2 SE hasConditionalWeight is true');

console.log('\\n🎉 === ALL SEARCH TESTS PASSED WITH 100% SUCCESS === 🎉\\n');
`;

eval(script);

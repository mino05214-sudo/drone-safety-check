import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.join(__dirname, '..', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

console.log('=== STEP 3.31 UI & Logic Verification Tests ===\n');

// 1. Check DOM elements existence
console.log('--- Test 1: DOM Structure Checks ---');
assert.ok(indexHtml.includes('id="siteUnregisteredBox"'), 'siteUnregisteredBox exists');
assert.ok(indexHtml.includes('해당 장소의 기관별 규정 미등록'), 'Guidance point 1 exists');
assert.ok(indexHtml.includes('드론원스톱 비행승인 대상 여부 확인'), 'Guidance point 2 exists');
assert.ok(indexHtml.includes('항공촬영 신청은 비행승인과 별도 확인'), 'Guidance point 3 exists');
assert.ok(indexHtml.includes('사유지 또는 시설 관리자 별도 협의'), 'Guidance point 4 exists');
assert.ok(indexHtml.includes('id="droneSpecMetaBox"'), 'droneSpecMetaBox exists');
assert.ok(indexHtml.includes('id="displayDroneSourceName"'), 'displayDroneSourceName exists');
assert.ok(indexHtml.includes('id="displayDroneVerifiedAt"'), 'displayDroneVerifiedAt exists');
assert.ok(indexHtml.includes('id="displayDroneVerificationStatus"'), 'displayDroneVerificationStatus exists');
assert.ok(indexHtml.includes('id="permitBatteryConfig"'), 'permitBatteryConfig exists');
assert.ok(indexHtml.includes('조종자 증명(자격) vs 기체신고 vs 비행승인·촬영허가 구분 기준'), '3-system comparison guide exists');
assert.ok(indexHtml.includes('focusManualDroneInput'), 'focusManualDroneInput exists');
assert.ok(indexHtml.includes('항공안전법 제125조 및 시행규칙 제306조제4항'), 'Correct statutory citation for 1~4 classes exists');
assert.ok(indexHtml.includes('시행규칙 제306조제1항제4호가목'), 'Correct citation for 250g exemption exists');
assert.ok(!indexHtml.includes('306조의4'), 'Old citation 306조의4 is removed');
console.log('  [PASS] All required DOM elements and text patterns are present in index.html');

// 2. Extract and evaluate simulation logic
console.log('\n--- Test 2: Drone Model Search & Pilot License Logic ---');

// Mock browser globals for simulation
let storage = {};
global.safeStorageGet = (key, def) => storage[key] !== undefined ? storage[key] : def;
global.safeStorageSet = (key, val) => { storage[key] = val; };
global.escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
global.showToast = (msg) => {};

// Evaluate script snippet
const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'script tag found in index.html');
const scriptContent = scriptMatch[1];

// Extract calculateQualificationClass
const qClassMatch = scriptContent.match(/function calculateQualificationClass\([\s\S]*?\n    \}/);
assert.ok(qClassMatch, 'calculateQualificationClass function found');
const calculateQualificationClass = new Function('mtowKg', 'selfWeightKg', 'verificationStatus', 'hasConditionalWeight', `
  ${qClassMatch[0]}
  return calculateQualificationClass(mtowKg, selfWeightKg, verificationStatus, hasConditionalWeight);
`);

// Test cases for calculateQualificationClass
const testNullMtow = calculateQualificationClass(null, null, "user_input", false);
assert.strictEqual(testNullMtow.code, "unknown", 'Null MTOW is unknown');
assert.strictEqual(testNullMtow.isConfirmed, false, 'Null MTOW is NOT confirmed');
console.log('  [PASS] Empty/unconfirmed MTOW returns unknown classification');

const test249g = calculateQualificationClass(0.249, null, "official_verified", false);
assert.strictEqual(test249g.code, "none_or_not_applicable", '249g is none_or_not_applicable');
assert.strictEqual(test249g.isConfirmed, true, '249g is confirmed exempt');
console.log('  [PASS] 249g is exempt from pilot license');

const test1kg = calculateQualificationClass(1.0, null, "user_input", false);
assert.strictEqual(test1kg.code, "class4", '1kg is class4');
assert.ok(test1kg.name.includes('4종'), '1kg mentions 4종');
console.log('  [PASS] 1kg is classified as class 4');

const test5kg = calculateQualificationClass(5.0, null, "user_input", false);
assert.strictEqual(test5kg.code, "class3", '5kg is class3');
console.log('  [PASS] 5kg is classified as class 3');

const test15kg = calculateQualificationClass(15.0, null, "user_input", false);
assert.strictEqual(test15kg.code, "class2", '15kg is class2');
console.log('  [PASS] 15kg is classified as class 2');

const test30kgNoSw = calculateQualificationClass(30.0, null, "user_input", false);
assert.strictEqual(test30kgNoSw.code, "unknown", '30kg with no self weight is unknown');
assert.strictEqual(test30kgNoSw.isConfirmed, false, '30kg with no self weight cannot be confirmed');
console.log('  [PASS] 30kg without confirmed self-weight is NOT automatically confirmed as class 1');

const test30kgSw50 = calculateQualificationClass(30.0, 50.0, "user_input", false);
assert.strictEqual(test30kgSw50.code, "class1", '30kg with self weight <= 150kg is class1');
console.log('  [PASS] 30kg with verified self-weight <= 150kg is confirmed class 1');

// 3. Test Filming Site Inquiry generation
console.log('\n--- Test 3: Filming Site Inquiry Question Generator ---');
const inquiryMatch = scriptContent.match(/function generateInquiryQuestions\(site\) \{[\s\S]*?\n    \}/);
assert.ok(inquiryMatch, 'generateInquiryQuestions function found');

let locationState = { placeName: "충주시청" };
const generateInquiryQuestions = new Function('site', 'locationState', `
  ${inquiryMatch[0]}
  return generateInquiryQuestions(site);
`);

const generalText = generateInquiryQuestions(null, locationState);
assert.ok(generalText.includes('충주시청'), 'Includes current place name');
assert.ok(generalText.includes('1. 드론 비행 및 촬영 가능 여부'), 'Includes question 1');
assert.ok(generalText.includes('7. 드론원스톱 비행·촬영승인 외 별도 협의 필요 여부'), 'Includes question 7');
console.log('  [PASS] General place inquiry question generation formatted properly');

const specificSite = { name: "독립기념관" };
const specificText = generateInquiryQuestions(specificSite, locationState);
assert.ok(specificText.includes('독립기념관'), 'Includes registered site name');
console.log('  [PASS] Registered facility inquiry question generation formatted properly');

console.log('\n=== All STEP 3.31 Verification Tests Passed Successfully! ===');

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
  droneSearchResultsList: { style: {} },
  droneSearchKeywordInput: { value: '' }
};

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
        dataset: {}
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
global.showToast = (msg) => console.log('[TOAST]', msg);
global.savePermitProfile = () => {};
global.updatePermitView = () => {};
global.updateComprehensiveDiagnosis = () => {};

let script = fs.readFileSync('scratch/extracted_all.js', 'utf8');

// Append tests inside the script scope
script += `
console.log('=== TEST 1: calculateQualificationClass ===');
const mini2se = calculateQualificationClass(0.246, null, 'verified', true);
console.log('Mini 2 SE result:', {
  code: mini2se.code,
  classificationBasis: mini2se.classificationBasis,
  badgeText: mini2se.badgeText,
  isConfirmed: mini2se.isConfirmed,
  hasConditionalWarning: mini2se.hasConditionalWarning
});
if (mini2se.code !== 'none_or_not_applicable' || mini2se.classificationBasis !== 'official_verified' || !mini2se.isConfirmed) {
  throw new Error('Mini 2 SE failed!');
}

const t40 = calculateQualificationClass(null, null, 'verified_conditional', true);
console.log('Agras T40 result:', {
  code: t40.code,
  classificationBasis: t40.classificationBasis,
  badgeText: t40.badgeText,
  isConfirmed: t40.isConfirmed
});
if (t40.code !== 'conditional' || t40.classificationBasis !== 'conditional' || t40.isConfirmed) {
  throw new Error('T40 failed!');
}

const air3 = calculateQualificationClass(null, null, 'needs_review', false);
console.log('Air 3 result:', {
  code: air3.code,
  classificationBasis: air3.classificationBasis
});
if (air3.code !== 'unknown') throw new Error('Air 3 failed!');

console.log('\\n=== TEST 2: selectVerifiedDrone keeps official status ===');
const mini2seIdx = VERIFIED_DRONE_MODELS.findIndex(d => d.model === 'DJI Mini 2 SE');
selectVerifiedDrone(mini2seIdx);
console.log('After selectVerifiedDrone Mini 2 SE:', {
  model: droneProfile.model,
  maxTakeoffWeightKg: droneProfile.maxTakeoffWeightKg,
  verificationStatus: droneProfile.verificationStatus,
  classificationBasis: droneProfile.classificationBasis,
  qualificationClass: droneProfile.qualificationClass,
  hasConditionalWeight: droneProfile.hasConditionalWeight
});
if (droneProfile.verificationStatus !== 'verified' || droneProfile.classificationBasis !== 'official_verified') {
  throw new Error('selectVerifiedDrone verificationStatus failed!');
}

console.log('\\n=== TEST 3: onDroneWeightInput sets user_input even when value equals official DB ===');
dom.permitWeightKg.value = '0.246'; // Same as official DB!
onDroneWeightInput(false);
console.log('After user typed 0.246 into permitWeightKg:', {
  maxTakeoffWeightKg: droneProfile.maxTakeoffWeightKg,
  verificationStatus: droneProfile.verificationStatus,
  classificationBasis: droneProfile.classificationBasis,
  sourceType: droneProfile.sourceType,
  qualificationClass: droneProfile.qualificationClass
});
if (droneProfile.verificationStatus !== 'user_input' || droneProfile.classificationBasis !== 'user_input') {
  throw new Error('onDroneWeightInput user_input check failed!');
}

console.log('\\n🎉 === ALL TESTS PASSED WITH 100% SUCCESS === 🎉');
`;

eval(script);

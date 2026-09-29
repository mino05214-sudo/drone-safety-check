const fs = require('fs');
const path = require('path');

const scriptContent = fs.readFileSync(path.resolve('scratch/extracted_script.js'), 'utf8');

function runLocalStorageTest() {
  console.log("Testing 5 localStorage scenarios...");

  let storageStore = {};
  const mockLocalStorage = {
    getItem: (k) => storageStore[k] !== undefined ? storageStore[k] : null,
    setItem: (k, v) => { storageStore[k] = String(v); },
    removeItem: (k) => { delete storageStore[k]; }
  };

  const documentElements = {};
  const mockDoc = {
    getElementById: (id) => {
      if (!documentElements[id]) {
        documentElements[id] = {
          value: '',
          innerText: '',
          innerHTML: '',
          style: {},
          classList: { add: () => {}, remove: () => {} },
          checked: false
        };
      }
      return documentElements[id];
    }
  };

  const fnCode = scriptContent.slice(
    scriptContent.indexOf('const VERIFIED_DRONE_MODELS = ['),
    scriptContent.indexOf('function onPermitProfileChange()')
  );

  const testHarness = `
    let safeStorageGet = (key, fallback) => {
      try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : fallback;
      } catch (e) {
        return fallback;
      }
    };
    let safeStorageSet = (key, val) => {
      localStorage.setItem(key, JSON.stringify(val));
    };
    let showToast = () => {};
    let updatePermitView = () => {};
    let updateComprehensiveDiagnosis = () => {};

    ${fnCode}

    return { initPermitProfile, droneProfile, permitProfile };
  `;

  // Scenario 1: 기존 weightCategory under25
  storageStore = {
    "drone_permit_profile": JSON.stringify({ weightCategory: "under25" })
  };
  const runner1 = new Function('localStorage', 'document', testHarness);
  const res1 = runner1(mockLocalStorage, mockDoc);
  res1.initPermitProfile();
  console.log("Scenario 1 (under25): MTOW =", res1.droneProfile.maxTakeoffWeightKg, "legacyWeightCategory =", res1.droneProfile.legacyWeightCategory);
  if (res1.droneProfile.maxTakeoffWeightKg !== null) throw new Error("Scenario 1 failed: MTOW should be null!");
  if (res1.droneProfile.legacyWeightCategory !== "under25") throw new Error("Scenario 1 failed: legacyWeightCategory not preserved!");

  // Scenario 2: 기존 weightCategory over25
  storageStore = {
    "drone_permit_profile": JSON.stringify({ weightCategory: "over25" })
  };
  const runner2 = new Function('localStorage', 'document', testHarness);
  const res2 = runner2(mockLocalStorage, mockDoc);
  res2.initPermitProfile();
  console.log("Scenario 2 (over25): MTOW =", res2.droneProfile.maxTakeoffWeightKg, "legacyWeightCategory =", res2.droneProfile.legacyWeightCategory);
  if (res2.droneProfile.maxTakeoffWeightKg !== null) throw new Error("Scenario 2 failed: MTOW should be null!");
  if (res2.droneProfile.legacyWeightCategory !== "over25") throw new Error("Scenario 2 failed: legacyWeightCategory not preserved!");

  // Scenario 3: 손상된 JSON
  storageStore = {
    "drone_permit_profile": "{invalid_json:::"
  };
  const runner3 = new Function('localStorage', 'document', testHarness);
  const res3 = runner3(mockLocalStorage, mockDoc);
  res3.initPermitProfile();
  console.log("Scenario 3 (corrupt JSON): model =", res3.droneProfile.model, "verificationStatus =", res3.droneProfile.verificationStatus);
  if (res3.droneProfile.model !== "") throw new Error("Scenario 3 failed: model should be empty string!");
  if (res3.droneProfile.verificationStatus !== "unknown") throw new Error("Scenario 3 failed: status should be unknown!");

  // Scenario 4: 신규 사용자 빈 상태
  storageStore = {};
  const runner4 = new Function('localStorage', 'document', testHarness);
  const res4 = runner4(mockLocalStorage, mockDoc);
  res4.initPermitProfile();
  console.log("Scenario 4 (fresh user): model =", res4.droneProfile.model, "MTOW =", res4.droneProfile.maxTakeoffWeightKg);
  if (res4.droneProfile.model !== "") throw new Error("Scenario 4 failed: model should be empty string!");
  if (res4.droneProfile.maxTakeoffWeightKg !== null) throw new Error("Scenario 4 failed: MTOW should be null!");
  if (res4.droneProfile.verificationStatus !== "unknown") throw new Error("Scenario 4 failed: status should be unknown!");

  // Scenario 5: 사용자 직접 입력 후 새로고침
  storageStore = {
    "drone_permit_profile": JSON.stringify({
      droneModel: "내 드론",
      manufacturer: "자작",
      maxTakeoffWeightKg: 3.5,
      selfWeightKg: 2.1,
      selfWeightSource: "user_input",
      verificationStatus: "user_input"
    })
  };
  const runner5 = new Function('localStorage', 'document', testHarness);
  const res5 = runner5(mockLocalStorage, mockDoc);
  res5.initPermitProfile();
  console.log("Scenario 5 (user input restored): model =", res5.droneProfile.model, "MTOW =", res5.droneProfile.maxTakeoffWeightKg, "status =", res5.droneProfile.verificationStatus);
  if (res5.droneProfile.model !== "내 드론") throw new Error("Scenario 5 failed: model should be '내 드론'!");
  if (res5.droneProfile.maxTakeoffWeightKg !== 3.5) throw new Error("Scenario 5 failed: MTOW should be 3.5!");
  if (res5.droneProfile.verificationStatus !== "user_input") throw new Error("Scenario 5 failed: status should be user_input!");

  console.log("[ALL 5 LOCALSTORAGE SCENARIOS PASSED]");
}

runLocalStorageTest();

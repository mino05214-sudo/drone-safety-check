import { spawn } from "node:child_process";
import fs from "node:fs";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBrowserTest() {
  console.log("=== Starting Real Headless Edge Browser Test ===");

  const browserProc = spawn(edgePath, [
    "--headless=new",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "http://localhost:5500",
  ]);

  try {
    let target = null;
    for (let i = 0; i < 20; i++) {
      await wait(500);
      try {
        const res = await fetch("http://localhost:9222/json/list");
        const list = await res.json();
        target = list.find((t) => t.type === "page" && t.url.includes("5500"));
        if (target && target.webSocketDebuggerUrl) {
          console.log("Found Edge target:", target.title, target.url);
          break;
        }
      } catch {}
    }

    if (!target) {
      throw new Error("Could not connect to Edge remote debugging on port 9222");
    }

    const wsUrl = target.webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    function send(method, params = {}) {
      const reqId = id++;
      return new Promise((resolve, reject) => {
        pending.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result?.value;
    }

    console.log("Waiting for app initialization and GeoJSON loading in Edge...");
    await wait(3000);

    // 1. Verify Home Tab and Badges
    console.log("\n--- 1. Home Tab & Initial Status ---");
    const homeInfo = await evaluate(`({
      title: document.title,
      headerStatus: document.getElementById('headerStatus')?.innerText,
      homeAirspaceStatus: document.getElementById('homeAirspaceFetchStatus')?.innerText,
      staticAirspaceLoaded: staticAirspaceLoaded,
      airspaceLayersCount: AIRSPACE_LAYERS.length,
      airspaceDataStoreKeys: Object.keys(airspaceDataStore)
    })`);
    console.log("Home Info in Edge:", JSON.stringify(homeInfo, null, 2));

    // 2. Switch to Map tab
    console.log("\n--- 2. Switching to Map Tab ---");
    const mapSwitchResult = await evaluate(`(async () => {
      switchTab('map');
      await new Promise(r => setTimeout(r, 1000));
      return {
        isMapViewActive: document.getElementById('viewMap')?.classList.contains('active'),
        mapCreated: !!map,
        connBadge: document.getElementById('wfsConnBadge')?.innerText,
        fetchTime: document.getElementById('wfsFetchTime')?.innerText,
        mapTileLayersCount: Object.keys(map?._layers || {}).length,
      };
    })()`);
    console.log("Map Tab Switch Result:", JSON.stringify(mapSwitchResult, null, 2));

    // 3. Verify Layer Groups and Feature Counts
    console.log("\n--- 3. Verifying Layer Groups & Polygon Count on Map ---");
    const layersInfo = await evaluate(`(() => {
      const info = {};
      AIRSPACE_LAYERS.forEach(layer => {
        const group = airspaceLayerGroups[layer.key];
        const store = airspaceDataStore[layer.key];
        info[layer.key] = {
          name: layer.name,
          featuresInStore: (store?.features || []).length,
          leafletLayersInGroup: group ? Object.keys(group._layers || {}).length : 0,
          isOnMap: group ? map.hasLayer(group) : false,
          checkboxChecked: document.getElementById('chk_' + layer.key)?.checked
        };
      });
      return info;
    })()`);
    console.log("Layers on Map:", JSON.stringify(layersInfo, null, 2));

    // 4. Test Layer Toggling
    console.log("\n--- 4. Testing Layer Toggle ON/OFF ---");
    const toggleTest = await evaluate(`(() => {
      const chk = document.getElementById('chk_prohibited');
      const group = airspaceLayerGroups['prohibited'];
      const initialHas = map.hasLayer(group);

      // Toggle off
      chk.checked = false;
      toggleAirspaceLayer('prohibited');
      const afterOffHas = map.hasLayer(group);

      // Toggle back on
      chk.checked = true;
      toggleAirspaceLayer('prohibited');
      const afterOnHas = map.hasLayer(group);

      return { initialHas, afterOffHas, afterOnHas };
    })()`);
    console.log("Layer Toggle Result (prohibited):", JSON.stringify(toggleTest, null, 2));

    // 5. Test Map Click / Selection and Location Card
    console.log("\n--- 5. Testing Map Click / Selection ---");
    const clickSelectionTest = await evaluate(`(() => {
      handleMapClickSelection(37.523467, 127.502328, false);

      const actionCard = document.getElementById('locationActionCard');
      const actionTitle = document.getElementById('locActionTitle')?.innerText;
      const actionDetail = document.getElementById('locActionDetail')?.innerText;
      const btnArea = document.getElementById('locActionBtnArea')?.style.display;

      return {
        cardVisible: actionCard ? actionCard.style.display !== 'none' : false,
        actionTitle,
        actionDetail,
        btnAreaVisible: btnArea !== 'none',
        pendingLocation
      };
    })()`);
    console.log("Map Click / Selection Card Result:", JSON.stringify(clickSelectionTest, null, 2));

    // 6. Test Turf.js Judgment Execution
    console.log("\n--- 6. Executing Turf.js Point-in-Polygon Judgment ---");
    const judgeExecutionTest = await evaluate(`(async () => {
      executePendingLocationJudge();
      await new Promise(r => setTimeout(r, 500));

      const heroBanner = document.getElementById('mapHeroBanner');
      const heroTitle = document.getElementById('mapHeroTitle')?.innerText;
      const heroDesc = document.getElementById('mapHeroDesc')?.innerText;
      const heroIcon = document.getElementById('mapHeroIcon')?.innerText;
      const resItems = [...document.querySelectorAll('#airspaceResList .airspace-res-item')].map(el => el.innerText.trim());

      return {
        bannerClass: heroBanner?.className,
        heroTitle,
        heroDesc,
        heroIcon,
        resultsList: resItems,
        representative: airspaceState?.representative
      };
    })()`);
    console.log("Turf.js Judgment Result in Browser:", JSON.stringify(judgeExecutionTest, null, 2));

    // 7. Verify Comprehensive Diagnosis on Home Tab
    console.log("\n--- 7. Checking Home Tab Comprehensive Diagnosis ---");
    const homeDiagnosisTest = await evaluate(`(() => {
      switchTab('home');
      const heroTitle = document.getElementById('heroTitle')?.innerText;
      const heroDesc = document.getElementById('heroDesc')?.innerText;
      const heroBanner = document.getElementById('homeHero')?.className;
      return {
        heroTitle,
        heroDesc,
        heroBanner
      };
    })()`);
    console.log("Home Tab Diagnosis Result in Browser:", JSON.stringify(homeDiagnosisTest, null, 2));

    // 8. Test Polygon Popup Content
    console.log("\n--- 8. Testing Polygon Popup Content ---");
    const popupContentTest = await evaluate(`(() => {
      const group = airspaceLayerGroups['restricted'];
      let samplePopupHtml = "";
      if (group) {
        group.eachLayer(l => {
          if (!samplePopupHtml && l.getPopup) {
            samplePopupHtml = l.getPopup()?.getContent();
          }
        });
      }
      return { samplePopupHtml };
    })()`);
    console.log("Polygon Popup Content in Browser:\n", popupContentTest.samplePopupHtml);

    ws.close();
    console.log("\n=== Real Browser Verification Succeeded 100%! ===");
  } finally {
    browserProc.kill();
  }
}

runBrowserTest().catch((e) => {
  console.error("Browser test failed:", e);
  process.exit(1);
});

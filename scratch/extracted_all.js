// Script 2

    // XSS 방지용 HTML 이스케이프 유틸리티
    function escapeHtml(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // ============================================================
    // 1. 공통 상수 및 안전 스토리지 / 타이머 유틸리티
    // ============================================================
    const PROXY_URL = "/api/wfs";
    const SEARCH_PROXY_URL = "/api/search";

    // 모바일 친화적 BBOX 최적화 범위 (약 10~15km 영역, 기능 정확도 보장)
    const LAT_RANGE = 0.14;
    const LNG_RANGE = 0.17;

    // 5개 레이어 스펙 (우선순위: 비행금지 > 임시금지 > 비행제한 > 관제권 > 초경량)
    const AIRSPACE_LAYERS = [
      {
        key: "prohibited",
        typename: "lt_c_aisprhc",
        name: "비행금지구역",
        icon: "🔴",
        color: "#ef4444",
        priority: 1,
        propFields: ["prh_lbl_1", "prh_lbl_2", "prh_lbl_3", "prh_lbl_4", "prh_typ"]
      },
      {
        key: "temporary",
        typename: "lt_c_aistemp",
        name: "임시비행금지공역",
        icon: "🟣",
        color: "#a855f7",
        priority: 2,
        propFields: ["tmp_lbl_1", "tmp_lbl_2", "tmp_lbl_3"]
      },
      {
        key: "restricted",
        typename: "lt_c_aisresc",
        name: "비행제한구역",
        icon: "🟠",
        color: "#f97316",
        priority: 3,
        propFields: ["res_lbl_1", "res_lbl_2", "res_lbl_3"]
      },
      {
        key: "control",
        typename: "lt_c_aisctrc",
        name: "관제권",
        icon: "🟡",
        color: "#eab308",
        priority: 4,
        propFields: ["ctr_lbl_1", "ctr_lbl_2", "ctr_lbl_3"]
      },
      {
        key: "uac",
        typename: "lt_c_aisuac",
        name: "초경량비행장치공역",
        icon: "🔵",
        color: "#2563eb",
        priority: 5,
        propFields: ["uac_lbl_1", "uac_lbl_2", "uac_lbl_3"]
      }
    ];

    // ============================================================
    // safeStorage 유틸리티 (JSON parse 실패 방어 및 예외 무시)
    // ============================================================
    function safeStorageGet(key, defaultVal) {
      try {
        const item = localStorage.getItem(key);
        if (item === null || item === undefined) return defaultVal;
        return JSON.parse(item);
      } catch (e) {
        console.warn(`[SafeStorage] getItem failed for "${key}":`, e.message);
        return defaultVal;
      }
    }

    function safeStorageSet(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch (e) {
        console.warn(`[SafeStorage] setItem failed for "${key}":`, e.message);
        return false;
      }
    }

    function safeStorageRemove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn(`[SafeStorage] removeItem failed for "${key}":`, e.message);
      }
    }

    // ============================================================
    // 통합 위치 상태 (Location State) 및 공역 상태 호환성 유지
    // ============================================================
    const locationState = {
      latitude: null,
      longitude: null,
      address: "",
      placeName: "",
      source: "", // 'gps' | 'search' | 'map' | 'manual' | 'preset'
      accuracy: null
    };

    // 기존 기능 호환을 위한 airspaceState (locationState와 실시간 동기화)
    const airspaceState = {
      loaded: false,
      partialFailure: false,
      failedLayers: [],
      lastCheckedAt: null,
      lastFetchedAt: null,
      hasLocation: false,
      isGps: false,
      locationMode: "preset", // 'gps' | 'search' | 'map_click' | 'manual' | 'preset'
      latitude: null,
      longitude: null,
      accuracy: null,
      center: null, // { latitude, longitude }
      bbox: null,   // { minLon, minLat, maxLon, maxLat, str }
      results: {}, // key -> { layer, isIncluded, matchedCount, features }
      representative: null
    };

    // 체크리스트 상태 객체 및 상태 계산 헬퍼
    const checklistState = {
      total: 6,
      completed: 0,
      remaining: 6,
      complete: false,
      status: "zero"
    };

    function getChecklistStatus() {
      const saved = safeStorageGet("drone_checklist", {});
      const completed = Object.values(saved).filter(Boolean).length;
      const total = typeof CHECK_ITEMS !== "undefined" ? CHECK_ITEMS.length : 6;
      const remaining = total - completed;
      const complete = (completed === total && total > 0);

      let status = "zero";
      if (complete) {
        status = "all";
      } else if (completed > 0) {
        status = "partial";
      } else {
        status = "zero";
      }

      checklistState.total = total;
      checklistState.completed = completed;
      checklistState.remaining = remaining;
      checklistState.complete = complete;
      checklistState.status = status;

      return checklistState;
    }

    // 날씨 상태 객체 및 요청 시퀀스 카운터 (경합 방지)
    let weatherRequestId = 0;
    const weatherState = {
      loaded: false,
      temp: null,
      wind: null,
      gust: null,
      hum: null,
      precip: null,
      level: "safe", // 'safe', 'warning', 'danger'
      statusText: "점검 대기"
    };

    // 지도 상태 객체
    let map = null;
    let airspaceLayerGroups = {}; // key -> L.geoJSON
    let airspaceDataStore = {};   // key -> GeoJSON raw data
    let currentMarker = null;      // 현재 검사 위치 마커
    let currentAccuracyCircle = null; // GPS 오차 범위 원
    let selectedMapMarker = null;  // 지도 클릭으로 선택한 핀 마커 (📌)
    let pendingLocation = null;    // 현재 대기 중인 위치 객체
    let highlightedLayers = [];   // 포함 하이라이트된 레이어 보관

    // ============================================================
    // BBOX 계산 및 거리 판정 유틸리티
    // ============================================================
    function calculateBBox(lat, lon) {
      const minLon = (lon - LNG_RANGE).toFixed(4);
      const minLat = (lat - LAT_RANGE).toFixed(4);
      const maxLon = (lon + LNG_RANGE).toFixed(4);
      const maxLat = (lat + LAT_RANGE).toFixed(4);
      return {
        minLon: parseFloat(minLon),
        minLat: parseFloat(minLat),
        maxLon: parseFloat(maxLon),
        maxLat: parseFloat(maxLat),
        str: `${minLon},${minLat},${maxLon},${maxLat}`
      };
    }

    // 두 좌표 간 거리 계산 (단위: km)
    function getDistanceKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }

    // 재조회 필요 여부 검사 (10km 초과 이동했거나 BBOX 밖인 경우 재조회)
    function shouldRefetchBBox(newLat, newLon) {
      if (!airspaceState.loaded || !airspaceState.center || !airspaceState.bbox) {
        return true;
      }
      const dist = getDistanceKm(airspaceState.center.latitude, airspaceState.center.longitude, newLat, newLon);
      const bbox = airspaceState.bbox;
      const isOutside = (newLon < bbox.minLon || newLon > bbox.maxLon || newLat < bbox.minLat || newLat > bbox.maxLat);
      return (dist > 10 || isOutside);
    }

    // ============================================================
    // 화면 전환 (Tab Navigation)
    // ============================================================
    function switchTab(tabId) {
      if (typeof cancelPreciseLocation === "function") {
        cancelPreciseLocation();
      }

      document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
      document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));

      if (tabId === "home") {
        document.getElementById("viewHome").classList.add("active");
        document.getElementById("tabHome").classList.add("active");
        updateComprehensiveDiagnosis();
      } else if (tabId === "map") {
        document.getElementById("viewMap").classList.add("active");
        document.getElementById("tabMap").classList.add("active");
        
        if (map) {
          setTimeout(() => map.invalidateSize(), 150);
        } else {
          initLeafletMap();
        }
      } else if (tabId === "permit") {
        document.getElementById("viewPermit").classList.add("active");
        document.getElementById("tabPermit").classList.add("active");
        if (typeof updatePermitView === "function") {
          updatePermitView();
        }
      } else if (tabId === "checklist") {
        document.getElementById("viewChecklist").classList.add("active");
        document.getElementById("tabChecklist").classList.add("active");
      } else if (tabId === "ai") {
        document.getElementById("viewAi").classList.add("active");
        document.getElementById("tabAi").classList.add("active");
      }
    }

    // Toast 표시 (전역 타이머 관리로 메시지 잘림 방지 및 aria-live="polite")
    let toastTimer = null;
    function showToast(msg) {
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.setAttribute("aria-live", "polite");
      toast.innerText = msg;
      toast.classList.add("show");
      toastTimer = setTimeout(() => {
        toast.classList.remove("show");
        toastTimer = null;
      }, 2500);
    }

    // ============================================================
    // Open-Meteo 날씨 기능 (요청 경합 방지 requestId 적용)
    // ============================================================
    async function fetchWeather(lat = locationState.latitude || airspaceState.latitude, lon = locationState.longitude || airspaceState.longitude) {
      if (!lat || !lon) return;

      const currentReqId = ++weatherRequestId;
      const wStatus = document.getElementById("weatherFetchStatus");
      if (wStatus) wStatus.innerText = "🌤 기상 정보 불러오는 중...";

      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("날씨 정보 조회 실패");
        const data = await res.json();

        // 오래된 이전 요청 응답이 최신 상태를 덮어쓰지 않도록 차단
        if (currentReqId !== weatherRequestId) {
          console.log(`[Weather] 이전 요청(#${currentReqId}) 응답 무시됨 (최신: #${weatherRequestId})`);
          return;
        }

        const cur = data.current;
        weatherState.loaded = true;
        weatherState.temp = cur.temperature_2m;
        weatherState.wind = cur.wind_speed_10m;
        weatherState.gust = cur.wind_gusts_10m;
        weatherState.hum = cur.relative_humidity_2m;
        weatherState.precip = cur.precipitation;

        const elTemp = document.getElementById("weatherTemp");
        const elWind = document.getElementById("weatherWind");
        const elGust = document.getElementById("weatherGust");
        const elHum = document.getElementById("weatherHum");
        const elPrecip = document.getElementById("weatherPrecip");

        if (elTemp) elTemp.innerText = `${cur.temperature_2m} °C`;
        if (elWind) elWind.innerText = `${cur.wind_speed_10m} m/s`;
        if (elGust) elGust.innerText = `${cur.wind_gusts_10m} m/s`;
        if (elHum) elHum.innerText = `${cur.relative_humidity_2m} %`;
        if (elPrecip) elPrecip.innerText = `${cur.precipitation} mm`;

        let modeBadge = "📍 현재 위치";
        if (locationState.source === "gps") modeBadge = "📍 GPS 위치";
        else if (locationState.source === "search") modeBadge = `🔍 검색 (${locationState.placeName || '장소'})`;
        else if (locationState.source === "map") modeBadge = "📌 지도 선택 위치";
        else if (locationState.source === "preset") modeBadge = "🧭 지역 프리셋";

        const elLocText = document.getElementById("weatherLocText");
        if (elLocText) {
          elLocText.innerText = `위치: 위도 ${lat.toFixed(6)}, 경도 ${lon.toFixed(6)} (${modeBadge})`;
        }

        // 풍속 및 강수 판정
        const windStatus = document.getElementById("weatherWindStatus");
        if (cur.wind_speed_10m <= 5 && cur.precipitation === 0) {
          weatherState.level = "safe";
          weatherState.statusText = "기상 양호";
          if (windStatus) {
            windStatus.innerText = "🟢 양호";
            windStatus.style.color = "var(--success)";
          }
        } else if (cur.wind_speed_10m <= 8 && cur.precipitation <= 1) {
          weatherState.level = "warning";
          weatherState.statusText = "기상 주의";
          if (windStatus) {
            windStatus.innerText = "🟡 주의";
            windStatus.style.color = "var(--warning)";
          }
        } else {
          weatherState.level = "danger";
          weatherState.statusText = "기상 위험";
          if (windStatus) {
            windStatus.innerText = "🔴 위험";
            windStatus.style.color = "var(--danger)";
          }
        }

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        if (wStatus) wStatus.innerText = `✅ 정상 조회 · 조회 시각 ${timeStr}`;

        updateComprehensiveDiagnosis();

      } catch (err) {
        if (currentReqId !== weatherRequestId) return;
        console.error("Weather fetch error:", err);
        if (wStatus) wStatus.innerText = "❌ 조회 실패";
        weatherState.loaded = false;
        weatherState.statusText = "조회 실패";
        updateComprehensiveDiagnosis();
      }
    }

    // ============================================================
    // VWorld WFS 5개 레이어 조회, 캐싱 및 중복/경합 방지
    // ============================================================
    let activeAirspaceBboxKey = null;
    let activeAirspaceController = null;
    let activeAirspacePromise = null;

    function initLeafletMap() {
      if (map) return;
      if (typeof L === "undefined") {
        setTimeout(initLeafletMap, 100);
        return;
      }

      const initialLat = locationState.latitude || airspaceState.latitude || 37.5400;
      const initialLon = locationState.longitude || airspaceState.longitude || 126.9800;

      map = L.map("map").setView([initialLat, initialLon], 11);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      map.on("click", onMapClick);

      // 위치가 설정되어 있다면 공역 데이터 로드
      if (locationState.latitude && locationState.longitude) {
        ensureAirspaceData(initialLat, initialLon);
      }
    }

    function reloadAirspaceCurrentArea() {
      const lat = locationState.latitude || airspaceState.latitude;
      const lon = locationState.longitude || airspaceState.longitude;
      if (!lat || !lon) {
        showToast("위치를 먼저 지정하세요.");
        return;
      }
      ensureAirspaceData(lat, lon, true);
    }

    // WFS 조회 (중복 요청 방지, Promise 재사용, AbortController, 실패 시 이전 지도 데이터 제거)
    async function ensureAirspaceData(lat, lon, forceReload = false) {
      if (!lat || !lon) return;

      const homeAirspaceStatusEl = document.getElementById("homeAirspaceFetchStatus");
      const needsRefetch = forceReload || shouldRefetchBBox(lat, lon);

      if (!needsRefetch) {
        const dist = getDistanceKm(airspaceState.center.latitude, airspaceState.center.longitude, lat, lon).toFixed(1);
        console.log(`[Airspace] 기존 데이터 재사용 여부 = true (이동 거리: ${dist}km <= 10km)`);
        showToast("기존 공역 데이터 재사용 (범위 내)");
        if (homeAirspaceStatusEl) {
          homeAirspaceStatusEl.innerText = "✅ 기존 데이터 재사용 (범위 내)";
        }
        judgeCoordinates(lat, lon, airspaceState.isGps, airspaceState.accuracy);
        return;
      }

      const bboxObj = calculateBBox(lat, lon);
      const bboxKey = bboxObj.str;

      // 동일한 BBOX 요청이 이미 진행 중이면 기존 Promise 재사용 (중복 요청 방지)
      if (activeAirspaceBboxKey === bboxKey && activeAirspacePromise && !forceReload) {
        console.log(`[Airspace] 동일 BBOX 요청 진행 중 -> 기존 Promise 재사용`);
        return activeAirspacePromise;
      }

      // 다른 위치가 새로 요청되면 이전 진행 중 요청 취소
      if (activeAirspaceController) {
        console.log(`[Airspace] 이전 WFS 요청 취소 (새 요청 시작)`);
        activeAirspaceController.abort();
      }

      activeAirspaceController = new AbortController();
      activeAirspaceBboxKey = bboxKey;
      const currentController = activeAirspaceController;

      activeAirspacePromise = (async () => {
        console.log(`[Airspace] 새 BBOX 조회 시작 = ${bboxKey}`);
        const connBadge = document.getElementById("wfsConnBadge");
        if (connBadge) {
          connBadge.innerText = "🗺 공역 데이터 불러오는 중...";
          connBadge.style.background = "#fef3c7";
          connBadge.style.color = "#b45309";
        }
        if (homeAirspaceStatusEl) homeAirspaceStatusEl.innerText = "🗺 공역 데이터 불러오는 중...";

        const totalStart = performance.now();
        const requests = AIRSPACE_LAYERS.map(layer => fetchAirspaceLayerBBox(layer, bboxKey, currentController.signal));
        const results = await Promise.all(requests);
        const totalElapsed = Math.round(performance.now() - totalStart);

        // 요청이 취소되었거나 다른 요청으로 교체된 경우 무시
        if (currentController.signal.aborted) {
          console.log(`[Airspace] WFS 요청이 취소되었습니다.`);
          return;
        }

        let successCount = 0;
        const failed = [];
        airspaceState.layerStatus = {};

        results.forEach(res => {
          airspaceState.layerStatus[res.layer.key] = {
            success: res.success,
            featureCount: res.featureCount,
            error: res.error || null
          };

          if (res.success) {
            successCount++;
            renderGeoJsonLayer(res.layer, res.data);
          } else {
            failed.push(res.layer.name);
            // 실패 시 지도에서 이전 레이어 제거 및 캐시 초기화 (오래된 잔여 데이터 제거)
            if (map && airspaceLayerGroups[res.layer.key]) {
              map.removeLayer(airspaceLayerGroups[res.layer.key]);
              delete airspaceLayerGroups[res.layer.key];
            }
            airspaceDataStore[res.layer.key] = null;
          }
        });

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const timeStrShort = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const fetchTimeEl = document.getElementById("wfsFetchTime");
        if (fetchTimeEl) fetchTimeEl.innerText = `조회 시각: ${timeStr}`;
        const failDetailEl = document.getElementById("wfsFailDetail");

        if (successCount === AIRSPACE_LAYERS.length) {
          airspaceState.loaded = true;
          airspaceState.center = { latitude: lat, longitude: lon };
          airspaceState.bbox = bboxObj;
          airspaceState.lastFetchedAt = Date.now();
          airspaceState.partialFailure = false;
          airspaceState.failedLayers = [];

          if (connBadge) {
            connBadge.innerText = "✅ 데이터 조회 완료";
            connBadge.style.background = "#d1fae5";
            connBadge.style.color = "#065f46";
          }
          if (failDetailEl) failDetailEl.style.display = "none";
          if (homeAirspaceStatusEl) homeAirspaceStatusEl.innerText = `✅ 5개 레이어 정상 조회 · 조회 시각 ${timeStrShort}`;
          showToast(`주변 공역 BBOX 갱신 완료 (${totalElapsed}ms)`);
        } else if (successCount > 0) {
          airspaceState.loaded = true;
          airspaceState.center = { latitude: lat, longitude: lon };
          airspaceState.bbox = bboxObj;
          airspaceState.lastFetchedAt = Date.now();
          airspaceState.partialFailure = true;
          airspaceState.failedLayers = failed;

          if (connBadge) {
            connBadge.innerText = "⚠️ 일부 공역 데이터 조회 실패";
            connBadge.style.background = "#fef3c7";
            connBadge.style.color = "#b45309";
          }
          if (failDetailEl) {
            failDetailEl.style.display = "block";
            failDetailEl.innerText = `실패 레이어: ${failed.join(", ")}`;
          }
          if (homeAirspaceStatusEl) homeAirspaceStatusEl.innerText = `⚠️ 일부 공역 조회 실패 (${successCount}/5)`;
          showToast(`⚠️ 일부 공역 데이터 조회 실패 (${failed.join(", ")})`);
        } else {
          airspaceState.loaded = false;
          airspaceState.partialFailure = true;
          airspaceState.failedLayers = AIRSPACE_LAYERS.map(l => l.name);

          if (connBadge) {
            connBadge.innerText = "🔴 공역 데이터 조회 실패";
            connBadge.style.background = "#fee2e2";
            connBadge.style.color = "#991b1b";
          }
          if (failDetailEl) {
            failDetailEl.style.display = "block";
            failDetailEl.innerText = "실패 레이어: 5개 전 공역 레이어 조회 실패";
          }
          if (homeAirspaceStatusEl) homeAirspaceStatusEl.innerText = `🔴 공역 데이터 조회 실패`;
          showToast("🔴 공역 데이터 조회가 실패했습니다.");
        }

        judgeCoordinates(lat, lon, airspaceState.isGps, airspaceState.accuracy);
      })();

      return activeAirspacePromise;
    }

    // 단일 레이어 BBOX 요청 (AbortController signal 및 실패 시 레이어 정리 지원)
    async function fetchAirspaceLayerBBox(layer, bboxStr, signal) {
      const params = new URLSearchParams({
        SERVICE: "WFS",
        VERSION: "1.1.0",
        REQUEST: "GetFeature",
        TYPENAME: layer.typename,
        OUTPUTFORMAT: "application/json",
        SRSNAME: "EPSG:4326",
        BBOX: bboxStr
      });

      const url = `${PROXY_URL}?${params.toString()}`;
      const startTime = performance.now();

      try {
        const response = await fetch(url, { signal });
        const elapsed = Math.round(performance.now() - startTime);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const featureCount = (data.features || []).length;

        airspaceDataStore[layer.key] = data;

        return {
          layer: layer,
          success: true,
          featureCount: featureCount,
          elapsed: elapsed,
          data: data
        };
      } catch (err) {
        // 실패 시 이전 데이터 무효화
        airspaceDataStore[layer.key] = null;
        if (map && airspaceLayerGroups[layer.key]) {
          map.removeLayer(airspaceLayerGroups[layer.key]);
          delete airspaceLayerGroups[layer.key];
        }

        return {
          layer: layer,
          success: false,
          featureCount: 0,
          elapsed: 0,
          error: err.message
        };
      }
    }

    // Leaflet GeoJSON 렌더링
    function renderGeoJsonLayer(layer, geojsonData) {
      if (!map) return;

      if (airspaceLayerGroups[layer.key] && map.hasLayer(airspaceLayerGroups[layer.key])) {
        map.removeLayer(airspaceLayerGroups[layer.key]);
      }

      if (!geojsonData || !geojsonData.features) return;

      const geoGroup = L.geoJSON(geojsonData, {
        style: function (feat) {
          return {
            color: layer.color,
            weight: 2,
            opacity: 0.85,
            fillColor: layer.color,
            fillOpacity: 0.22
          };
        },
        onEachFeature: function (feat, leafletLayer) {
          let popHtml = `<div style="font-weight:700; font-size:13px; margin-bottom:4px; border-bottom:1px solid #ddd; padding-bottom:3px;">${layer.icon} ${layer.name}</div>`;
          const p = feat.properties || {};
          let pCount = 0;

          layer.propFields.forEach(field => {
            if (p[field]) {
              popHtml += `<div style="font-size:12px;"><strong>${field}:</strong> ${p[field]}</div>`;
              pCount++;
            }
          });

          if (pCount === 0) {
            popHtml += `<div style="font-size:12px; color:#888;">정보 없음</div>`;
          }
          leafletLayer.bindPopup(popHtml);

          // STEP 3-18: 폴리곤 클릭 시 지도의 빈 영역 click 이벤트(위치 선택 마커 생성) 전파 방지
          leafletLayer.on('click', function (e) {
            L.DomEvent.stopPropagation(e);
          });
        }
      });

      airspaceLayerGroups[layer.key] = geoGroup;

      const chk = document.getElementById(`chk_${layer.key}`);
      if (chk && chk.checked) {
        geoGroup.addTo(map);
      }
    }

    // 레이어 ON/OFF 토글
    function toggleAirspaceLayer(key) {
      const chk = document.getElementById(`chk_${key}`);
      const group = airspaceLayerGroups[key];
      if (!group || !map) return;

      if (chk.checked) {
        if (!map.hasLayer(group)) map.addLayer(group);
      } else {
        if (map.hasLayer(group)) map.removeLayer(group);
      }
    }

    // ============================================================
    // 5. GPS 다중 샘플링 및 고정밀 최적 위치 획득 모듈
    // ============================================================
    let activeGpsWatcherId = null;
    let activeGpsTimerId = null;
    let activeGpsMinTimerId = null;
    let isGpsMeasuring = false;

    // 정확도 피드백 텍스트 헬퍼 (앱 UX용)
    function getAccuracyFeedback(acc) {
      const rounded = Math.round(acc);
      const warnSuffix = (acc > 15) ? " · ⚠️ 위치 오차가 공역 경계 판정에 영향을 줄 수 있습니다." : "";
      if (acc <= 15) {
        return { level: "good", tag: "정확도 좋음", color: "var(--success)", text: `정확도 약 ${rounded}m (정확도 좋음)` };
      } else if (acc <= 50) {
        return { level: "fair", tag: "정확도 양호", color: "var(--success)", text: `정확도 약 ${rounded}m (정확도 양호)${warnSuffix}` };
      } else if (acc <= 200) {
        return { level: "low", tag: "GPS 정확도가 낮습니다.", color: "var(--warning)", text: `정확도 약 ${rounded}m (GPS 정확도가 낮습니다.)${warnSuffix}` };
      } else {
        return { level: "very-low", tag: "GPS 정확도가 매우 낮습니다.", color: "var(--danger)", text: `정확도 약 ${rounded}m (GPS 정확도가 매우 낮습니다.)${warnSuffix}` };
      }
    }

    // 진행 중인 GPS Watcher 및 타이머 정리
    function cancelPreciseLocation() {
      isGpsMeasuring = false;
      if (activeGpsWatcherId !== null) {
        navigator.geolocation.clearWatch(activeGpsWatcherId);
        activeGpsWatcherId = null;
      }
      if (activeGpsTimerId !== null) {
        clearTimeout(activeGpsTimerId);
        activeGpsTimerId = null;
      }
      if (activeGpsMinTimerId !== null) {
        clearTimeout(activeGpsMinTimerId);
        activeGpsMinTimerId = null;
      }
    }

    // 고정밀 위치 다중 샘플링 수집기 (추후 Android 네이티브 GPS로 교체 용이하도록 독립 함수화)
    function requestPreciseLocation(callbacks = {}) {
      // 1. 기존 측정 진행 중인 경우 이전 watcher 정리
      cancelPreciseLocation();

      if (!navigator.geolocation) {
        if (callbacks.onError) callbacks.onError(new Error("Geolocation 미지원 브라우저"));
        return;
      }

      const samples = [];
      const startTime = Date.now();
      let isCompleted = false;
      let minTimeElapsed = false; // 최소 3초 경과 플래그

      const gpsOptions = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      };

      // 측정 완료 헬퍼
      const finishMeasurement = (reason = "normal") => {
        if (isCompleted) return;
        isCompleted = true;
        cancelPreciseLocation();

        if (samples.length === 0) {
          if (callbacks.onError) {
            callbacks.onError(new Error("유효한 GPS 위치 샘플을 획득하지 못했습니다."));
          }
          return;
        }

        // accuracy(오차 m)가 가장 작은 최적 샘플 선별
        samples.sort((a, b) => a.accuracy - b.accuracy);
        const bestSample = samples[0];
        console.log(`[GPS] 측정 완료 (${reason}) -> 총 ${samples.length}개 샘플 중 최적 accuracy: ${bestSample.accuracy}m`);

        if (callbacks.onSuccess) {
          callbacks.onSuccess(bestSample, samples);
        }
      };

      // 최소 측정 시간(3초) 타이머
      activeGpsMinTimerId = setTimeout(() => {
        minTimeElapsed = true;
        // 3초 경과 시점에 이미 accuracy <= 10m 인 샘플이 있다면 조기 종료
        if (samples.length > 0) {
          const currentBest = samples.reduce((min, s) => (s.accuracy < min.accuracy ? s : min), samples[0]);
          if (currentBest.accuracy <= 10) {
            console.log(`[GPS] 3초 경과 시점 고정밀 조건 충족 (${currentBest.accuracy}m <= 10m) -> 조기 종료`);
            finishMeasurement("early-exit-10m-at-3s");
          }
        }
      }, 3000);

      // 최대 측정 시간(5초) 타이머
      activeGpsTimerId = setTimeout(() => {
        console.log("[GPS] 최대 측정 시간(5초) 경과 -> 자동 종료");
        finishMeasurement("max-timeout-5s");
      }, 5000);

      // watchPosition 시작
      try {
        activeGpsWatcherId = navigator.geolocation.watchPosition(
          (pos) => {
            if (isCompleted) return;

            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const acc = pos.coords.accuracy;
            const now = Date.now();

            // 중복 샘플 체크 (위도, 경도, accuracy가 동일하면 무시)
            const isDup = samples.some(s => s.latitude === lat && s.longitude === lon && s.accuracy === acc);
            if (!isDup) {
              samples.push({
                latitude: lat,
                longitude: lon,
                accuracy: acc,
                timestamp: now
              });
            }

            const currentBest = samples.reduce((min, s) => (s.accuracy < min.accuracy ? s : min), samples[0]);
            const elapsedSec = Math.max(1, Math.round((now - startTime) / 1000));

            if (callbacks.onProgress) {
              callbacks.onProgress(currentBest, samples.length, elapsedSec);
            }

            // 최소 3초 경과 후 accuracy <= 10m인 경우 조기 종료
            if (minTimeElapsed && currentBest.accuracy <= 10) {
              console.log(`[GPS] 3초 이상 경과 중 고정밀 샘플 획득 (${currentBest.accuracy}m <= 10m) -> 조기 종료`);
              finishMeasurement("early-exit-10m");
            }
          },
          (err) => {
            if (samples.length === 0) {
              finishMeasurement("error");
              if (callbacks.onError) callbacks.onError(err);
            }
          },
          gpsOptions
        );
      } catch (e) {
        finishMeasurement("exception");
        if (callbacks.onError) callbacks.onError(e);
      }
    }

    // 위치 확인 액션 카드 UI 업데이트
    function showLocationActionCard(config) {
      const card = document.getElementById("locationActionCard");
      const title = document.getElementById("locActionTitle");
      const badge = document.getElementById("locActionBadge");
      const detail = document.getElementById("locActionDetail");
      const btnArea = document.getElementById("locActionBtnArea");
      const btn = document.getElementById("btnActionJudge");

      if (!card) return;

      title.innerText = config.title || "위치 정보";
      badge.innerText = config.badge || "안내";
      badge.style.background = config.badgeBg || "#e0f2fe";
      badge.style.color = config.badgeColor || "#0284c7";
      detail.innerHTML = config.detailHtml || "";

      if (config.btnText) {
        btn.innerText = config.btnText;
        btnArea.style.display = "block";
      } else {
        btnArea.style.display = "none";
      }
      card.style.display = "block";
    }

    // 지도 클릭 시 호출되는 핸들러 (STEP 3-18)
    function onMapClick(e) {
      const lat = e.latlng.lat;
      const lon = e.latlng.lng;
      handleMapClickSelection(lat, lon);
    }

    function handleMapClickSelection(lat, lon) {
      // 1. 기존 임시 선택 마커 정리 및 새 마커 생성
      if (selectedMapMarker && map) {
        map.removeLayer(selectedMapMarker);
      }

      selectedMapMarker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: "custom-map-pin",
          html: '<div style="font-size:26px; line-height:1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35)); cursor:pointer;">📌</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 24]
        })
      }).addTo(map).bindPopup(`<strong>📌 지도에서 선택한 위치</strong><br><span style="font-size:11px; color:#666;">위도: ${lat.toFixed(6)}<br>경도: ${lon.toFixed(6)}</span>`).openPopup();

      // 수동 입력창에 좌표 자동 동기화
      document.getElementById("manualLat").value = lat.toFixed(6);
      document.getElementById("manualLon").value = lon.toFixed(6);

      // 2. 대기 위치 저장
      pendingLocation = {
        lat: lat,
        lon: lon,
        mode: "map_click",
        accuracy: null,
        title: "📌 지도에서 선택한 위치"
      };

      // 3. 위치 확인 카드 업데이트
      showLocationActionCard({
        title: "📌 지도에서 선택한 위치",
        badge: "지도 직접 선택",
        badgeBg: "#fef3c7",
        badgeColor: "#b45309",
        detailHtml: `위도: <strong>${lat.toFixed(6)}</strong> · 경도: <strong>${lon.toFixed(6)}</strong><br><span style="color:var(--primary); font-size:11px;">지정한 위치의 공역 및 기상을 분석하려면 아래 버튼을 누르세요.</span>`,
        btnText: "🔍 이 위치로 공역 판정 실행"
      });

      showToast("📌 지도에서 위치가 선택되었습니다.");
    }

    // ============================================================
    // 통합 위치 설정 함수 (locationState -> airspaceState -> weather -> airspace -> map -> permit)
    // ============================================================
    function setLocation(lat, lon, source, meta = {}) {
      if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) return;

      // 1. locationState 업데이트
      locationState.latitude = lat;
      locationState.longitude = lon;
      locationState.source = source || "manual";
      locationState.accuracy = (meta.accuracy !== undefined) ? meta.accuracy : null;
      locationState.placeName = meta.placeName || (source === "gps" ? "GPS 현재 위치" : (source === "map" ? "지도 선택 위치" : (source === "preset" ? (meta.title || "지역 프리셋") : "수동 입력 좌표")));
      locationState.address = meta.address || "";

      // 2. airspaceState 동기화 (기존 코드 완벽 호환)
      airspaceState.hasLocation = true;
      airspaceState.latitude = lat;
      airspaceState.longitude = lon;
      airspaceState.isGps = (source === "gps");
      airspaceState.accuracy = locationState.accuracy;
      airspaceState.locationMode = (source === "map" ? "map_click" : source);

      // 3. weather 요청 (requestId로 오래된 응답 덮어쓰기 방지)
      fetchWeather(lat, lon);

      // 4. airspace WFS 요청 (15km BBOX, 요청 재사용 및 취소)
      ensureAirspaceData(lat, lon);

      // 5. map 중심 및 마커 갱신
      const mapTitle = meta.title || locationState.placeName;
      setMapLocation(lat, lon, mapTitle, locationState.accuracy || 0);

      // 6. 등록된 촬영장소 후보 탐지
      if (typeof checkCandidateFilmingSites === "function") {
        checkCandidateFilmingSites(lat, lon);
      }

      // 7. permit 승인준비 뷰 동기화
      if (typeof updatePermitView === "function") {
        updatePermitView();
      }

      // 8. 홈 종합 안전진단 갱신
      updateComprehensiveDiagnosis();
    }

    // 대기 중인 위치(GPS / 지도 선택 / 수동)의 공역 및 기상 판정 통합 실행
    function executePendingLocationJudge() {
      if (!pendingLocation) return;
      const { lat, lon, mode, accuracy, title } = pendingLocation;
      const source = (mode === "map_click" ? "map" : (mode === "gps" ? "gps" : (mode === "preset" ? "preset" : "manual")));
      setLocation(lat, lon, source, { accuracy: accuracy, title: title });

      const modeName = mode === "gps" ? "📍 GPS 위치" : (mode === "map_click" ? "📌 지도 선택 위치" : "🧭 수동 입력 좌표");
      showToast(`✅ ${modeName} 공역 판정 완료`);
    }

    // 지도 화면의 GPS 버튼 클릭 핸들러
    function fetchGpsOnMap() {
      if (isGpsMeasuring) {
        showToast("📍 이미 정밀 위치 측정이 진행 중입니다.");
        return;
      }
      isGpsMeasuring = true;

      const alertTxt = document.getElementById("gpsAlertText");
      alertTxt.style.color = "var(--primary)";
      alertTxt.innerText = "📍 정밀 위치 측정 중...";

      // 선택 마커가 있었다면 정리
      if (selectedMapMarker && map) {
        map.removeLayer(selectedMapMarker);
        selectedMapMarker = null;
      }

      requestPreciseLocation({
        onProgress: (bestSample, count, elapsedSec) => {
          alertTxt.style.color = "var(--primary)";
          alertTxt.innerText = `📍 정밀 위치 측정 중 · 현재 정확도 약 ${Math.round(bestSample.accuracy)}m`;
        },
        onSuccess: (bestSample, allSamples) => {
          isGpsMeasuring = false;
          const fb = getAccuracyFeedback(bestSample.accuracy);
          alertTxt.style.color = fb.color;
          alertTxt.innerText = `📍 위치 확인 완료 · ${fb.text}`;

          pendingLocation = {
            lat: bestSample.latitude,
            lon: bestSample.longitude,
            mode: "gps",
            accuracy: bestSample.accuracy,
            title: `현재 위치 (${fb.tag}, 오차 ±${Math.round(bestSample.accuracy)}m)`
          };

          // 위치 확인 액션 카드 표출
          showLocationActionCard({
            title: "📍 현재 GPS 위치 확인",
            badge: "GPS 모드",
            badgeBg: "#d1fae5",
            badgeColor: "#065f46",
            detailHtml: `위도: <strong>${bestSample.latitude.toFixed(6)}</strong> · 경도: <strong>${bestSample.longitude.toFixed(6)}</strong><br>정확도: <strong>약 ${Math.round(bestSample.accuracy)}m</strong> (${fb.tag})${bestSample.accuracy > 15 ? '<br><span style="color:var(--warning); font-size:11px;">⚠️ 위치 오차가 공역 경계 판정에 영향을 줄 수 있습니다.</span>' : ''}`,
            btnText: "✅ 이 위치로 공역 판정"
          });

          // 자동 1회 판정 수행
          executePendingLocationJudge();
        },
        onError: (err) => {
          isGpsMeasuring = false;
          alertTxt.style.color = "var(--danger)";
          alertTxt.innerText = `⚠️ 위치 확인 필요 (GPS 오류: ${err.message || '권한 거부 또는 측정 실패'}) → 지도 선택 또는 수동 좌표를 이용하세요.`;
          showToast("⚠️ GPS 위치를 가져올 수 없습니다. 지도를 직접 클릭하거나 수동 좌표를 입력하세요.");
        }
      });
    }

    function setPresetCoord(lat, lon) {
      document.getElementById("manualLat").value = lat.toFixed(6);
      document.getElementById("manualLon").value = lon.toFixed(6);
      airspaceState.locationMode = "preset";
      judgeManualCoordinate();
    }

    function judgeManualCoordinate() {
      const lat = parseFloat(document.getElementById("manualLat").value);
      const lon = parseFloat(document.getElementById("manualLon").value);

      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        alert("올바른 위도(-90~90) 및 경도(-180~180)를 입력하세요.");
        return;
      }

      if (selectedMapMarker && map) {
        map.removeLayer(selectedMapMarker);
        selectedMapMarker = null;
      }

      const mode = airspaceState.locationMode === "preset" ? "preset" : "manual";
      const title = mode === "preset" ? "🧭 검사 기준: 지역 프리셋" : "🧭 검사 기준: 수동 좌표";

      pendingLocation = {
        lat: lat,
        lon: lon,
        mode: mode,
        accuracy: null,
        title: title
      };

      showLocationActionCard({
        title: title,
        badge: mode === "preset" ? "지역 프리셋" : "수동 좌표",
        badgeBg: "#f1f5f9",
        badgeColor: "#475569",
        detailHtml: `위도: <strong>${lat.toFixed(6)}</strong> · 경도: <strong>${lon.toFixed(6)}</strong>`,
        btnText: "🔍 이 좌표로 공역 판정 실행"
      });

      executePendingLocationJudge();
    }

    function setMapLocation(lat, lon, title, accuracy = 0) {
      if (!map) return;

      map.flyTo([lat, lon], 12);

      if (currentMarker) map.removeLayer(currentMarker);
      if (currentAccuracyCircle) map.removeLayer(currentAccuracyCircle);

      currentMarker = L.marker([lat, lon]).addTo(map).bindPopup(title).openPopup();

      if (accuracy > 0) {
        currentAccuracyCircle = L.circle([lat, lon], {
          radius: accuracy,
          color: "var(--primary)",
          fillColor: "var(--primary)",
          fillOpacity: 0.15
        }).addTo(map);
      }
    }

    // ============================================================
    // 6. Turf.js Point-in-Polygon 공역 판정 및 하이라이트
    // ============================================================
    function judgeCoordinates(lat, lon, isGps = false, accuracy = null) {
      airspaceState.hasLocation = true;
      airspaceState.isGps = isGps;
      airspaceState.latitude = lat;
      airspaceState.longitude = lon;
      airspaceState.accuracy = accuracy;
      airspaceState.lastCheckedAt = new Date();

      let criteriaLabel = "📍 검사 기준: GPS 현재 위치";
      if (airspaceState.locationMode === "map_click") criteriaLabel = "📌 검사 기준: 지도에서 선택한 위치";
      else if (airspaceState.locationMode === "manual") criteriaLabel = "🧭 검사 기준: 수동 좌표";
      else if (airspaceState.locationMode === "preset") criteriaLabel = "🧭 검사 기준: 지역 프리셋";

      document.getElementById("judgeTargetCoord").innerText = `${lat.toFixed(6)}, ${lon.toFixed(6)} (${criteriaLabel})`;

      clearHighlights();

      const pt = turf.point([lon, lat]);
      const results = [];
      airspaceState.results = {};

      AIRSPACE_LAYERS.forEach(layer => {
        const status = (airspaceState.layerStatus && airspaceState.layerStatus[layer.key]) || {
          success: !!airspaceDataStore[layer.key],
          featureCount: (airspaceDataStore[layer.key]?.features || []).length
        };
        const data = airspaceDataStore[layer.key];
        const matched = [];

        if (status.success && data && data.features) {
          data.features.forEach(feat => {
            if (!feat.geometry) return;
            try {
              if (turf.booleanPointInPolygon(pt, feat)) {
                matched.push(feat);
                highlightFeature(layer, feat);
              }
            } catch (tErr) {
              console.error(`[Turf] ${layer.key} error:`, tErr);
            }
          });
        }

        const layerResult = {
          layer: layer,
          fetchSuccess: status.success,
          featureCount: status.featureCount || 0,
          isIncluded: matched.length > 0,
          matchedCount: matched.length,
          features: matched
        };

        results.push(layerResult);
        airspaceState.results[layer.key] = layerResult;
      });

      // 대표 판정 계산 (우선순위 순서)
      const included = results.filter(r => r.fetchSuccess && r.isIncluded).sort((a, b) => a.layer.priority - b.layer.priority);

      if (included.length > 0) {
        const top = included[0];
        if (top.layer.priority === 1) { // 비행금지구역
          airspaceState.representative = {
            priority: 1,
            name: top.layer.name,
            icon: "🔴",
            level: "danger",
            title: "비행 전 확인 필요",
            desc: "비행금지구역 또는 임시비행금지공역이 확인되었습니다."
          };
        } else if (top.layer.priority <= 3) { // 임시비행금지 / 비행제한
          airspaceState.representative = {
            priority: top.layer.priority,
            name: top.layer.name,
            icon: "🔴",
            level: "danger",
            title: "비행 전 확인 필요",
            desc: "비행금지구역 또는 임시비행금지공역이 확인되었습니다."
          };
        } else { // 관제권 / 초경량
          airspaceState.representative = {
            priority: top.layer.priority,
            name: top.layer.name,
            icon: "🟡",
            level: "warning",
            title: "비행 전 추가 확인",
            desc: "관제권 또는 기타 주의 요소가 확인되었습니다."
          };
        }
      } else {
        airspaceState.representative = {
          priority: 6,
          name: "주요 제한공역 미검출",
          icon: "🟢",
          level: "safe",
          title: "주요 제한공역 미검출",
          desc: "현재 확인된 주요 공역 데이터에서 제한공역이 검출되지 않았습니다."
        };
      }

      // 공역지도 탭 결과 갱신
      renderMapJudgeUI(results);

      // 홈 화면 종합 안전진단 갱신
      updateComprehensiveDiagnosis();

      // STEP 4: 승인준비 탭 자동 동기화
      if (typeof updatePermitView === "function") {
        updatePermitView();
      }
    }

    function highlightFeature(layer, feat) {
      const group = airspaceLayerGroups[layer.key];
      if (!group) return;

      group.eachLayer(l => {
        if (l.feature === feat) {
          l.setStyle({
            weight: 4,
            fillOpacity: 0.55
          });
          if (l.bringToFront) l.bringToFront();
          highlightedLayers.push(l);
        }
      });
    }

    function clearHighlights() {
      highlightedLayers.forEach(l => {
        const originalLayer = AIRSPACE_LAYERS.find(a => a.color === l.options.color);
        if (originalLayer) {
          l.setStyle({
            weight: 2,
            fillOpacity: 0.22
          });
        }
      });
      highlightedLayers = [];
    }

    // 공역 상태 뱃지 HTML 생성 헬퍼 (API 실패 vs 0개 vs 포함 vs 미포함 구분)
    function getLayerBadgeHtml(r) {
      if (r.fetchSuccess === false) {
        return `<span class="res-badge" style="background:#fee2e2; color:#991b1b;">❌ 조회 실패</span>`;
      }
      if (r.featureCount === 0) {
        return `<span class="res-badge" style="background:#f1f5f9; color:#475569;">✅ 정상 조회 · 0개</span>`;
      }
      if (r.isIncluded) {
        return `<span class="res-badge badge-included">🚫 포함 (${r.matchedCount}개)</span>`;
      }
      return `<span class="res-badge badge-excluded">✅ 정상 조회 · ${r.featureCount}개 (미포함)</span>`;
    }

    function renderMapJudgeUI(results) {
      const heroIcon = document.getElementById("mapHeroIcon");
      const heroTitle = document.getElementById("mapHeroTitle");
      const heroDesc = document.getElementById("mapHeroDesc");
      const heroBox = document.getElementById("mapHeroBanner");
      const list = document.getElementById("airspaceResList");

      const rep = airspaceState.representative;
      if (rep) {
        heroBox.className = `hero-banner hero-${rep.level}`;
        heroIcon.innerText = rep.icon;
        heroTitle.innerText = rep.title;

        let accNotice = "";
        if (airspaceState.isGps && airspaceState.accuracy) {
          if (airspaceState.accuracy > 200) {
            accNotice = " ⚠️ GPS 정확도가 매우 낮습니다. 위치 오차 범위 때문에 공역 경계 판정에 주의가 필요합니다. 비행 전 위치를 다시 확인하세요.";
          } else if (airspaceState.accuracy > 50) {
            accNotice = " ⚠️ GPS 정확도가 낮습니다. 위치 오차가 공역 경계 판정에 영향을 줄 수 있습니다. 비행 전 위치를 다시 확인하세요.";
          } else if (airspaceState.accuracy > 15) {
            accNotice = " ⚠️ 위치 오차가 공역 경계 판정에 영향을 줄 수 있습니다. 비행 전 위치를 다시 확인하세요.";
          }
        }
        heroDesc.innerText = `${rep.desc}${accNotice}`;
      }

      let html = "";
      results.forEach(r => {
        const l = r.layer;
        html += `
          <div class="airspace-res-item">
            <span>${l.icon} ${l.name}</span>
            ${getLayerBadgeHtml(r)}
          </div>
        `;
      });
      list.innerHTML = html;
    }

    // ============================================================
    // STEP 3-10 / STEP 3-11: 홈 화면 종합 안전 진단 업데이트
    // ============================================================
    // ============================================================
    // STEP 3-10 / STEP 3-11 / STEP 3-19: 홈 화면 종합 안전 진단 업데이트 (기상 + 공역 + 체크리스트)
    // ============================================================
    function updateComprehensiveDiagnosis() {
      const homeHero = document.getElementById("homeHero");
      const heroIcon = document.getElementById("heroIcon");
      const heroTitle = document.getElementById("heroTitle");
      const heroDesc = document.getElementById("heroDesc");

      const homeAirspaceHeader = document.getElementById("homeAirspaceHeader");
      const homeAirspaceDesc = document.getElementById("homeAirspaceDesc");
      const homeAirspaceList = document.getElementById("homeAirspaceList");

      // 1. 체크리스트 상태 확인 (STEP 3-19)
      const chk = getChecklistStatus();

      // 실시간 지표 6대 뱃지 엘리먼트
      const badgeLocation = document.getElementById("badgeLocation");
      const badgeWeather = document.getElementById("badgeWeather");
      const badgeAirspace = document.getElementById("badgeAirspace");
      const badgeDrone = document.getElementById("badgeDrone");
      const badgeChecklist = document.getElementById("badgeChecklist");
      const badgeSite = document.getElementById("badgeSite");

      // 브리핑 5대 카드 엘리먼트
      const elLocSummary = document.getElementById("briefingLocSummary");
      const elLocAcc = document.getElementById("briefingLocAccuracy");
      const elWeatherSummary = document.getElementById("briefingWeatherSummary");
      const elWeatherDetail = document.getElementById("briefingWeatherDetail");
      const elAirspaceSummary = document.getElementById("briefingAirspaceSummary");
      const elAirspaceDetail = document.getElementById("briefingAirspaceDetail");
      const elDroneSummary = document.getElementById("briefingDroneSummary");
      const elDroneDetail = document.getElementById("briefingDroneDetail");
      const elCheckSummary = document.getElementById("briefingCheckSummary");
      const elCheckDetail = document.getElementById("briefingCheckDetail");

      // 브리핑 판정 이유 상자 엘리먼트
      const reasonBoxTitle = document.getElementById("briefingReasonTitle");
      const reasonBoxList = document.getElementById("briefingReasonList");

      // 1) 위치 뱃지 및 카드 동기화
      let locModeLabel = "위치 미확인";
      if (locationState.source === "gps") locModeLabel = "📍 GPS 현재 위치";
      else if (locationState.source === "search") locModeLabel = "🔍 장소 검색";
      else if (locationState.source === "map" || locationState.source === "map_click") locModeLabel = "📌 지도 선택";
      else if (locationState.source === "preset") locModeLabel = "🧭 지역 프리셋";
      else if (locationState.source === "manual") locModeLabel = "🧭 수동 좌표";

      const hasLoc = (locationState.latitude !== null && locationState.longitude !== null);
      if (badgeLocation) {
        if (hasLoc) {
          badgeLocation.innerText = locModeLabel;
          badgeLocation.style.background = "rgba(16, 185, 129, 0.15)";
          badgeLocation.style.color = "#065f46";
        } else {
          badgeLocation.innerText = "📍 위치 미확인";
          badgeLocation.style.background = "rgba(0,0,0,0.06)";
          badgeLocation.style.color = "var(--muted)";
        }
      }

      if (elLocSummary) {
        elLocSummary.innerText = hasLoc ? (locationState.placeName || locModeLabel) : "위치 미확인";
      }
      if (elLocAcc) {
        if (hasLoc && locationState.source === "gps" && locationState.accuracy) {
          const fb = getAccuracyFeedback(locationState.accuracy);
          elLocAcc.innerText = `약 ${Math.round(locationState.accuracy)}m (${fb.tag})`;
        } else if (hasLoc && locationState.latitude && locationState.longitude) {
          elLocAcc.innerText = `${locationState.latitude.toFixed(4)}, ${locationState.longitude.toFixed(4)}`;
        } else {
          elLocAcc.innerText = "상단 또는 지도에서 선택";
        }
      }

      // 2) 기상 뱃지 및 카드 동기화 (참고용 기상 상태 안내)
      if (badgeWeather) {
        if (!weatherState.loaded) {
          badgeWeather.innerText = "🌤️ 기상 점검 중";
          badgeWeather.style.background = "rgba(0,0,0,0.06)";
          badgeWeather.style.color = "var(--muted)";
        } else if (weatherState.level === "safe") {
          badgeWeather.innerText = `🟢 기상 참고 양호 (${weatherState.wind || '-'}m/s)`;
          badgeWeather.style.background = "rgba(16, 185, 129, 0.15)";
          badgeWeather.style.color = "#065f46";
        } else if (weatherState.level === "warning") {
          badgeWeather.innerText = `🟡 기상 추가 확인 (${weatherState.wind || '-'}m/s)`;
          badgeWeather.style.background = "rgba(245, 158, 11, 0.15)";
          badgeWeather.style.color = "#92400e";
        } else {
          badgeWeather.innerText = `🔴 기상 주의 (${weatherState.wind || '-'}m/s)`;
          badgeWeather.style.background = "rgba(239, 68, 68, 0.15)";
          badgeWeather.style.color = "#991b1b";
        }
      }

      if (elWeatherSummary) {
        if (!weatherState.loaded) {
          elWeatherSummary.innerText = "점검 대기";
        } else if (weatherState.wind !== null) {
          const wIcon = weatherState.wind <= 5 ? "🟢" : (weatherState.wind <= 8 ? "🟡" : "🔴");
          elWeatherSummary.innerText = `풍속 ${weatherState.wind}m/s ${wIcon}`;
        } else {
          elWeatherSummary.innerText = "기상 정보 확인됨";
        }
      }
      if (elWeatherDetail) {
        if (weatherState.loaded) {
          const gIcon = (weatherState.gust !== null && weatherState.gust <= 8) ? "🟢" : "🟡";
          const pIcon = (weatherState.precip !== null && weatherState.precip === 0) ? "🟢" : "🟡";
          elWeatherDetail.innerText = `돌풍 ${weatherState.gust || 0}m/s ${gIcon} · 강수 ${weatherState.precip || 0}mm ${pIcon}`;
        } else {
          elWeatherDetail.innerText = "풍속/돌풍/강수 (참고용)";
        }
      }

      // 3) 기체 뱃지 및 카드 동기화
      const currentDrone = (typeof droneProfile !== "undefined") ? droneProfile : null;
      if (badgeDrone) {
        if (!currentDrone || !currentDrone.model) {
          badgeDrone.innerText = "🚁 기체 미지정";
          badgeDrone.style.background = "rgba(0,0,0,0.06)";
          badgeDrone.style.color = "var(--muted)";
        } else if (currentDrone.verificationStatus === "verified") {
          badgeDrone.innerText = "✅ 기체 공식확인";
          badgeDrone.style.background = "rgba(16, 185, 129, 0.15)";
          badgeDrone.style.color = "#065f46";
        } else if (currentDrone.verificationStatus === "user_input") {
          badgeDrone.innerText = "⚠️ 기체 사용자입력";
          badgeDrone.style.background = "rgba(245, 158, 11, 0.15)";
          badgeDrone.style.color = "#92400e";
        } else {
          badgeDrone.innerText = "❓ 기체 확인필요";
          badgeDrone.style.background = "rgba(0,0,0,0.06)";
          badgeDrone.style.color = "var(--muted)";
        }
      }

      if (elDroneSummary) {
        elDroneSummary.innerText = (currentDrone && currentDrone.model) ? currentDrone.model : "기체 미지정";
      }
      if (elDroneDetail) {
        if (currentDrone && currentDrone.model) {
          const acw = currentDrone.aircraftWeightKg;
          const acwStr = (acw !== null) ? (acw >= 1 ? `${acw}kg` : `${Math.round(acw * 1000)}g`) : "-";
          const mtowStr = (currentDrone.maxTakeoffWeightKg !== null) ? `MTOW: ${currentDrone.maxTakeoffWeightKg}kg` : "MTOW: 미확인";
          const statusText = (currentDrone.verificationStatus === "verified") ? "공식확인" : ((currentDrone.verificationStatus === "user_input") ? "직접입력" : "확인필요");
          elDroneDetail.innerText = `표기: ${acwStr} · ${mtowStr} (${statusText})`;
        } else {
          elDroneDetail.innerText = "승인준비 탭에서 기체 검색/입력";
        }
      }

      // 4) 체크리스트 뱃지 및 카드 동기화
      if (badgeChecklist) {
        if (chk.complete) {
          badgeChecklist.innerText = `✅ 체크리스트 ${chk.completed}/${chk.total}`;
          badgeChecklist.style.background = "rgba(16, 185, 129, 0.15)";
          badgeChecklist.style.color = "#065f46";
        } else if (chk.completed > 0) {
          badgeChecklist.innerText = `⚠️ 체크리스트 ${chk.completed}/${chk.total}`;
          badgeChecklist.style.background = "rgba(245, 158, 11, 0.15)";
          badgeChecklist.style.color = "#92400e";
        } else {
          badgeChecklist.innerText = `❌ 체크리스트 0/${chk.total}`;
          badgeChecklist.style.background = "rgba(239, 68, 68, 0.15)";
          badgeChecklist.style.color = "#991b1b";
        }
      }

      if (badgeSite) {
        if (selectedFilmingSite) {
          badgeSite.innerText = `🏛️ ${selectedFilmingSite.name} (확인됨)`;
          badgeSite.style.background = "rgba(16, 185, 129, 0.15)";
          badgeSite.style.color = "#065f46";
        } else if (candidateFilmingSite) {
          badgeSite.innerText = `🏛️ ${candidateFilmingSite.site.name} 후보 감지`;
          badgeSite.style.background = "rgba(245, 158, 11, 0.15)";
          badgeSite.style.color = "#92400e";
        } else {
          badgeSite.innerText = "🏛️ 시설 허가 확인 대기";
          badgeSite.style.background = "rgba(0,0,0,0.06)";
          badgeSite.style.color = "var(--muted)";
        }
      }

      if (elCheckSummary) {
        elCheckSummary.innerText = `${chk.completed}/${chk.total} ${chk.complete ? '✅' : (chk.completed > 0 ? '⚠️' : '❌')}`;
      }
      if (elCheckDetail) {
        elCheckDetail.innerText = chk.complete ? "모든 항목 점검 완료" : `${chk.remaining}개 미완료 항목 존재`;
      }

      // 2. 위치 확인 전인 경우
      if (!hasLoc) {
        homeHero.className = "hero-banner hero-warning";
        heroIcon.innerText = "📍";
        heroTitle.innerText = "위치 확인 필요";
        heroDesc.innerText = "비행 예정 위치를 지정하면 공역, 기상, 행정 준비 정보를 일괄 확인할 수 있습니다.";

        if (badgeAirspace) {
          badgeAirspace.innerText = "🗺️ 공역 미확인";
          badgeAirspace.style.background = "rgba(0,0,0,0.06)";
          badgeAirspace.style.color = "var(--muted)";
        }

        if (elAirspaceSummary) elAirspaceSummary.innerText = "공역 미확인";
        if (elAirspaceDetail) elAirspaceDetail.innerText = "5개 공역 공간 검사 대기";

        homeAirspaceHeader.innerText = "📍 위치 확인 필요";
        homeAirspaceDesc.innerText = "현재 위치를 확인한 후 공역을 판정할 수 있습니다.";
        renderHomeAirspaceItems([]);

        if (reasonBoxTitle) reasonBoxTitle.innerText = "현재 확인할 사항";
        if (reasonBoxList) {
          reasonBoxList.innerHTML = `
            <div>현재 비행 예정 위치가 지정되지 않았습니다.</div>
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(0,0,0,0.12); font-size: 11px;">
              <strong>🔎 현재 확인할 사항:</strong> [공역지도] 또는 [승인준비] 탭에서 GPS 위치를 측정하거나 장소를 검색하세요.
            </div>
          `;
        }
        return;
      }

      // 3. 공역 WFS 데이터 실패 처리 (전체 실패 or 일부 실패)
      if (airspaceState.partialFailure) {
        const isAllFailed = (airspaceState.failedLayers && airspaceState.failedLayers.length >= AIRSPACE_LAYERS.length);
        homeHero.className = isAllFailed ? "hero-banner hero-danger" : "hero-banner hero-warning";
        heroIcon.innerText = isAllFailed ? "🔴" : "⚠️";
        heroTitle.innerText = isAllFailed ? "🔴 공역 데이터 조회 실패" : "⚠️ 일부 공역 데이터 조회 실패";
        heroDesc.innerText = `실패한 레이어: [${airspaceState.failedLayers.join(', ')}]. 공역 데이터를 완전히 불러오지 못했으므로 드론원스톱에서 공식 비행 승인 대상 여부를 확인하세요.`;

        if (badgeAirspace) {
          badgeAirspace.innerText = isAllFailed ? "🔴 공역 조회 실패" : "⚠️ 공역 일부 실패";
          badgeAirspace.style.background = isAllFailed ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)";
          badgeAirspace.style.color = isAllFailed ? "#991b1b" : "#92400e";
        }

        if (elAirspaceSummary) elAirspaceSummary.innerText = isAllFailed ? "공역 실패 🔴" : "일부 공역 실패 ⚠️";
        if (elAirspaceDetail) elAirspaceDetail.innerText = `실패: ${airspaceState.failedLayers.join(', ')}`;

        homeAirspaceHeader.innerText = isAllFailed ? "🔴 공역 데이터 조회 실패" : "⚠️ 일부 공역 데이터 조회 실패";
        homeAirspaceDesc.innerText = `실패 공역: ${airspaceState.failedLayers.join(', ')} (드론원스톱 공식 확인 권장)`;
        renderHomeAirspaceItems(AIRSPACE_LAYERS.map(l => airspaceState.results[l.key] || { layer: l, fetchSuccess: false, featureCount: 0, isIncluded: false, matchedCount: 0 }));

        if (reasonBoxTitle) reasonBoxTitle.innerText = "주요 원인 및 확인할 사항";
        if (reasonBoxList) {
          reasonBoxList.innerHTML = `
            <div style="margin-bottom:4px;"><strong>주요 원인:</strong></div>
            <ul style="margin: 0 0 6px 16px; padding: 0; display: flex; flex-direction: column; gap: 2px;">
              <li>🗺️ 공역 데이터 ${isAllFailed ? '전체' : '일부'} 조회 실패 (${airspaceState.failedLayers.join(', ')}) ⚠️</li>
              <li>📋 체크리스트 ${chk.completed}/${chk.total} ${chk.complete ? '완료 ✅' : '미완료 ⚠️'}</li>
            </ul>
            <div style="padding-top: 4px; border-top: 1px dashed rgba(0,0,0,0.12); font-size: 11px;">
              <strong>🔎 현재 확인할 사항:</strong> VWorld 공역 데이터를 정상 수신하지 못했습니다. 실제 비행 승인 대상 여부는 공식 드론원스톱에서 확인하세요.
            </div>
          `;
        }
        return;
      }

      // 4. 정상 공역 판정 결과 반영
      const rep = airspaceState.representative || {
        priority: 6,
        name: "주요 제한공역 미검출",
        icon: "🟢",
        level: "safe",
        title: "주요 제한공역 미검출",
        desc: "현재 확인된 주요 공역 데이터에서 제한공역이 검출되지 않았습니다."
      };
      const resultsArray = AIRSPACE_LAYERS.map(l => airspaceState.results[l.key] || { layer: l, fetchSuccess: true, featureCount: 0, isIncluded: false, matchedCount: 0 });

      renderHomeAirspaceItems(resultsArray);

      let accNotice = "";
      if (locationState.source === "gps" && locationState.accuracy) {
        if (locationState.accuracy > 200) {
          accNotice = " ⚠️ GPS 정확도가 매우 낮습니다. 위치 오차 범위 때문에 공역 경계 판정에 주의가 필요합니다. 비행 전 위치를 다시 확인하세요.";
        } else if (locationState.accuracy > 50) {
          accNotice = " ⚠️ GPS 정확도가 낮습니다. 위치 오차가 공역 경계 판정에 영향을 줄 수 있습니다. 비행 전 위치를 다시 확인하세요.";
        } else if (locationState.accuracy > 15) {
          accNotice = " ⚠️ 위치 오차가 공역 경계 판정에 영향을 줄 수 있습니다. 비행 전 위치를 다시 확인하세요.";
        }
      }

      homeAirspaceHeader.innerText = `${rep.icon} ${rep.title}`;
      homeAirspaceDesc.innerText = `${rep.desc}${accNotice}`;

      // 공역 뱃지 동기화
      if (badgeAirspace) {
        if (rep.level === "danger") {
          badgeAirspace.innerText = `🔴 ${rep.name} 확인`;
          badgeAirspace.style.background = "rgba(239, 68, 68, 0.15)";
          badgeAirspace.style.color = "#991b1b";
        } else if (rep.level === "warning") {
          badgeAirspace.innerText = `🟡 ${rep.name} 확인`;
          badgeAirspace.style.background = "rgba(245, 158, 11, 0.15)";
          badgeAirspace.style.color = "#92400e";
        } else {
          badgeAirspace.innerText = "🟢 제한공역 미검출";
          badgeAirspace.style.background = "rgba(16, 185, 129, 0.15)";
          badgeAirspace.style.color = "#065f46";
        }
      }

      // 공역 브리핑 카드 동기화
      if (elAirspaceSummary) {
        if (rep.level !== "safe") {
          elAirspaceSummary.innerText = `${rep.name} ${rep.icon}`;
        } else {
          elAirspaceSummary.innerText = "제한공역 미검출 🟢";
        }
      }
      if (elAirspaceDetail) {
        if (rep.level === "danger") {
          elAirspaceDetail.innerText = "비행 전 승인·허가 대상 여부 확인 🔴";
        } else if (rep.level === "warning") {
          elAirspaceDetail.innerText = "관제권 등 공식 비행 조건 확인 🟡";
        } else {
          elAirspaceDetail.innerText = "5개 주요 제한공역 미검출 (참고용) 🟢";
        }
      }

      // 5. 종합 브리핑 상태 구성 (Section 36: 단정적 "안전" 금지, 근거 중심 안내)
      let overallLevel = "safe";
      let overallTitle = "비행 전 준비 상태 확인";
      let overallDesc = "";
      let overallIcon = "🟢";

      const chkGuideText = chk.complete 
        ? `체크리스트(${chk.completed}/${chk.total}) 완료`
        : `체크리스트(${chk.completed}/${chk.total}) 미완료`;

      if (rep.level === "danger" || weatherState.level === "danger") {
        overallLevel = "danger";
        overallIcon = "🔴";
        overallTitle = "비행 전 확인 필요";
        if (rep.level === "danger") {
          overallDesc = `비행금지구역 또는 임시비행금지공역(${rep.name})이 확인되었습니다. 관할 기관 승인 대상 여부를 공식 확인하세요. · ${chkGuideText}.${accNotice}`;
        } else {
          overallDesc = `기상 주의 요소(강풍/강수 등)가 확인되었습니다. 기체 운용 한계를 확인하세요. · ${chkGuideText}.${accNotice}`;
        }
      } else if (rep.level === "warning" || weatherState.level === "warning") {
        overallLevel = "warning";
        overallIcon = "🟡";
        overallTitle = "비행 전 추가 확인 필요";
        if (rep.level === "warning") {
          overallDesc = `관제권 또는 주의 요소(${rep.name})가 확인되었습니다. 관제 승인 요건을 확인하세요. · ${chkGuideText}.${accNotice}`;
        } else {
          overallDesc = `기상 주의 상태입니다. (풍속: ${weatherState.wind || '-'}m/s) 기체 제조사 한계와 실제 비행 현장 상황을 함께 확인하세요. · ${chkGuideText}.${accNotice}`;
        }
      } else {
        if (!chk.complete) {
          overallLevel = "warning";
          overallIcon = "🟡";
          overallTitle = "비행 전 추가 확인 필요";
          overallDesc = `현재 확인된 주요 공역 데이터에서 제한공역이 미검출되었으나, 비행 전 체크리스트(${chk.completed}/${chk.total})가 완료되지 않았습니다.${accNotice}`;
        } else {
          overallLevel = "safe";
          overallIcon = "🟢";
          overallTitle = "비행 전 준비 완료 (확인 필요)";
          overallDesc = `현재 확인된 데이터를 기준으로 비행 준비에 필요한 항목을 표시했습니다. 최종 비행·촬영 가능 여부와 승인 대상 여부는 공식 기관 및 드론원스톱에서 확인하세요.${accNotice}`;
        }
      }

      homeHero.className = `hero-banner hero-${overallLevel}`;
      heroIcon.innerText = overallIcon;
      heroTitle.innerText = overallTitle;
      heroDesc.innerText = overallDesc;

      // 6. 판정 이유(reasons) 리스트 및 확인할 사항(actionItem) 구성
      const reasons = [];
      let actionItem = "";

      // 공역 원인
      if (rep.level === "danger") {
        reasons.push(`🗺️ ${rep.name} 포함 🔴 (공식 승인 여부 확인 필요)`);
        actionItem = `${rep.name} 관련 비행 승인 및 허가 여부를 공식 드론원스톱에서 확인하세요.`;
      } else if (rep.level === "warning") {
        reasons.push(`🗺️ ${rep.name} 포함 🟡 (관제 승인 조건 확인 필요)`);
        actionItem = `${rep.name} 관련 공식 비행 조건 및 관제 승인 요건을 확인하세요.`;
      } else {
        reasons.push(`🗺️ 주요 5개 제한공역 미검출 🟢 (군사시설 등 기타 제한은 현장 확인 필요)`);
      }

      // 기상 원인 (Section 31: 참고용 상태 안내)
      if (weatherState.loaded) {
        if (weatherState.wind !== null) {
          if (weatherState.wind > 8) {
            reasons.push(`💨 풍속 ${weatherState.wind}m/s 🔴 (기상 주의 - 기체 제어 한계 확인 필요)`);
            if (!actionItem) actionItem = "풍속이 다소 강하므로 기체 제조사의 운용 한계와 현장 기상 상태를 반드시 확인하세요.";
          } else if (weatherState.wind > 5) {
            reasons.push(`💨 풍속 ${weatherState.wind}m/s 🟡 (기상 주의 - 기체 흔들림 유의)`);
            if (!actionItem) actionItem = "비행 중 돌풍 발생 및 기체 흔들림에 유의하세요.";
          } else {
            reasons.push(`💨 풍속 ${weatherState.wind}m/s 🟢 (기상 참고 양호)`);
          }
        }
        if (weatherState.gust && weatherState.gust > 8) {
          reasons.push(`💨 순간 돌풍 ${weatherState.gust}m/s 🟡 (기상 주의)`);
          if (!actionItem) actionItem = "순간 돌풍에 유의하고 비행 현장 안전거리를 확보하세요.";
        }
        if (weatherState.precip && weatherState.precip > 0) {
          reasons.push(`🌧️ 강수 ${weatherState.precip}mm 🟡 (기상 주의)`);
          if (!actionItem) actionItem = "기체 방수 사양 및 안전을 위해 우천 시 비행 주의가 필요합니다.";
        }
      }

      // 기체 원인
      if (currentDrone && currentDrone.model) {
        if (currentDrone.verificationStatus === "verified" && currentDrone.maxTakeoffWeightKg !== null) {
          reasons.push(`🚁 기체: ${currentDrone.model} (공식 MTOW ${currentDrone.maxTakeoffWeightKg}kg 확인) 🟢`);
        } else if (currentDrone.verificationStatus === "user_input") {
          reasons.push(`🚁 기체: ${currentDrone.model} (사용자 직접 입력 - 공식 제원 확인 권장) 🟡`);
        } else {
          reasons.push(`🚁 기체: ${currentDrone.model} (법령상 최대이륙중량 MTOW 확인 필요) ❓`);
        }
      } else {
        reasons.push(`🚁 기체: 미지정 (승인준비 탭에서 기체 정보 확인 필요) ❓`);
      }

      // 체크리스트 원인
      if (chk.complete) {
        reasons.push(`📋 체크리스트 ${chk.completed}/${chk.total} 완료 🟢`);
      } else {
        reasons.push(`📋 체크리스트 ${chk.completed}/${chk.total} (미완료 항목 존재) 🟡`);
        if (!actionItem) actionItem = "비행 전 필수 안전 점검 체크리스트 항목을 완료하세요.";
      }

      // 시설 자체 촬영허가 원인
      if (selectedFilmingSite) {
        reasons.push(`🏛️ 시설 촬영허가: ${selectedFilmingSite.name} (${selectedFilmingSite.institutionPermission || '사전 문의 필요'}) 📞`);
      } else if (candidateFilmingSite) {
        reasons.push(`🏛️ 시설 촬영허가: ${candidateFilmingSite.site.name} (후보 감지 범위 - 장소 확인 필요) 🟡`);
      } else {
        reasons.push(`🏛️ 시설 촬영허가: 일반/미지정 (공공·문화 시설 등은 사전 유선 문의 권장) ℹ️`);
      }

      // GPS 정확도 원인
      if (locationState.source === "gps" && locationState.accuracy) {
        if (locationState.accuracy > 50) {
          reasons.push(`📍 GPS 오차 약 ${Math.round(locationState.accuracy)}m 🟡 (정밀도 낮음)`);
        }
      }

      if (!actionItem) {
        actionItem = "최종 비행·촬영 가능 여부와 승인 대상 여부는 공식 기관 및 드론원스톱에서 확인하세요.";
      }

      if (reasonBoxTitle) {
        reasonBoxTitle.innerText = "항목별 확인 상태 및 주요 안내";
      }
      if (reasonBoxList) {
        let rHtml = `<div style="margin-bottom:3px;"><strong>확인 항목:</strong></div>`;
        rHtml += `<ul style="margin: 0 0 6px 16px; padding: 0; display: flex; flex-direction: column; gap: 2px;">`;
        reasons.forEach(r => {
          rHtml += `<li>${r}</li>`;
        });
        rHtml += `</ul>`;
        rHtml += `<div style="padding-top: 4px; border-top: 1px dashed rgba(0,0,0,0.12); font-size: 11px;">`;
        rHtml += `<strong>🔎 안내:</strong> ${actionItem}`;
        rHtml += `</div>`;
        reasonBoxList.innerHTML = rHtml;
      }
    }

    function renderHomeAirspaceItems(results) {
      const list = document.getElementById("homeAirspaceList");
      if (!results || results.length === 0) {
        list.innerHTML = `
          <div style="font-size:12px; color:var(--muted); text-align:center; padding:8px 0;">
            공역 데이터를 로드하거나 위치를 검사하면 5개 공역 상태가 표시됩니다.
          </div>
        `;
        return;
      }

      let html = "";
      results.forEach(r => {
        const l = r.layer;
        html += `
          <div class="airspace-res-item">
            <span>${l.icon} ${l.name}</span>
            ${getLayerBadgeHtml(r)}
          </div>
        `;
      });
      list.innerHTML = html;
    }

    // ============================================================
    // 7. 체크리스트 기능 (localStorage)
    // ============================================================
    const CHECK_ITEMS = [
      { id: "c1", title: "배터리 충전 상태 확인", desc: "기체 및 조종기 배터리 잔량 충분 여부 육안 확인" },
      { id: "c2", title: "프로펠러 및 기체 외관 점검", desc: "체결 상태, 균열 및 손상 여부 육안 점검" },
      { id: "c3", title: "비행 구역 및 공역 확인", desc: "공식 드론원스톱 비행 승인 및 공역 제한 여부 검토" },
      { id: "c4", title: "풍속 및 기상 환경 확인", desc: "현재 기체 제조사가 안내하는 운용조건과 현장 기상상태 확인" },
      { id: "c5", title: "GPS 위성 수신 확인", desc: "안정적인 비행을 위한 충분한 GPS 위성 신호 수신 확인" },
      { id: "c6", title: "비상 착륙 장소 확보", desc: "안전한 이착륙을 위한 반경 내 장애물 및 인파 부재 확인" }
    ];

    function initChecklist() {
      const container = document.getElementById("checklistContainer");
      const saved = safeStorageGet("drone_checklist", {});

      container.innerHTML = "";
      CHECK_ITEMS.forEach(item => {
        const isDone = !!saved[item.id];
        const el = document.createElement("div");
        el.className = `check-item ${isDone ? "done" : ""}`;
        el.id = `item_${item.id}`;
        el.innerHTML = `
          <input type="checkbox" ${isDone ? "checked" : ""} onchange="toggleCheck('${item.id}')">
          <div>
            <div class="check-text">${item.title}</div>
            <div class="check-desc">${item.desc}</div>
          </div>
        `;
        container.appendChild(el);
      });

      updateCheckProgress();
    }

    function toggleCheck(id) {
      const saved = safeStorageGet("drone_checklist", {});
      saved[id] = !saved[id];
      safeStorageSet("drone_checklist", saved);

      const el = document.getElementById(`item_${id}`);
      if (saved[id]) {
        el.classList.add("done");
      } else {
        el.classList.remove("done");
      }

      updateCheckProgress();
    }

    function resetChecklist() {
      if (confirm("체크리스트를 초기화하시겠습니까?")) {
        safeStorageRemove("drone_checklist");
        initChecklist();
        showToast("체크리스트가 초기화되었습니다.");
      }
    }

    function updateCheckProgress() {
      const chk = getChecklistStatus();
      const pct = Math.round((chk.completed / chk.total) * 100);

      document.getElementById("homeCheckProgress").innerText = `${pct}% (${chk.completed}/${chk.total})`;
      document.getElementById("homeProgressBar").style.width = `${pct}%`;

      const statusTextEl = document.getElementById("homeCheckStatusText");
      if (statusTextEl) {
        if (chk.complete) {
          statusTextEl.innerText = "🟢 점검 완료";
          statusTextEl.style.color = "var(--success)";
        } else if (chk.completed > 0) {
          statusTextEl.innerText = `🟡 점검 중 (${chk.completed}/${chk.total})`;
          statusTextEl.style.color = "var(--warning)";
        } else {
          statusTextEl.innerText = "🔴 미점검";
          statusTextEl.style.color = "var(--danger)";
        }
      }

      // 홈 화면 종합 안전진단 실시간 동기화 (기상/WFS/GPS 재호출 없이 UI만 갱신)
      updateComprehensiveDiagnosis();
    }

    // ============================================================
    // 8. 드론 안전 가이드 (규칙 기반 참고 안내 & 공식 출처 링크)
    // ============================================================
    const AI_RESPONSES = {
      "비행 금지 구역": "비행금지구역(P) 및 임시비행금지공역은 국가 안보 및 시설 보호를 위해 비행 승인이 요구될 수 있는 구역입니다. 앱에서 최종 확정하지 않으므로, 국방부/수방사 등 관할 기관의 승인 대상 여부를 드론원스톱(drone.onestop.go.kr)에서 공식 확인하세요.\n\n📌 공식 기준 참고:\n- 드론원스톱 민원서비스 (drone.onestop.go.kr)\n- 국가법령정보센터 항공안전법 (law.go.kr)",
      "풍속": "기상청/예보 데이터의 풍속 수치는 참고 정보입니다. 비행 가능 여부는 법정 단일 숫자로 결정되지 않으며, 조종하시는 기체 제조사의 제원상 최대 풍속 저항 한계와 실제 비행 현장의 돌풍 상태를 반드시 함께 확인하셔야 합니다.\n\n📌 안내: 제조사 공식 매뉴얼의 운용 환경 한계를 확인하세요.",
      "승인": "드론 비행승인 및 항공촬영 허가는 관할 기관 및 공역 구분에 따라 신청 요건이 다릅니다. 비행 예정일 전 여유를 두고 공식 포털인 드론원스톱(drone.onestop.go.kr)에서 대상 여부를 확인하고 신청하세요. [승인준비] 탭에서 신청 정보를 일괄 정리할 수 있습니다.\n\n📌 공식 창구: 드론원스톱 (drone.onestop.go.kr)",
      "자격": "조종자 증명은 최대이륙중량에 따라 1~4종으로 구분됩니다 (250g 이하 제외). 단순 무게만으로 법적 의무 전체를 확정할 수 없으므로, TS한국교통안전공단 배움터 및 항공안전법 시행규칙을 확인하세요.\n\n📌 공식 기준: 한국교통안전공단 배움터 (edu.kotsa.or.kr)",
      "촬영": "항공촬영은 공역 비행승인과 별개로 국방부의 항공촬영 허가 대상 여부를 검토해야 하며, 특정 공공시설이나 문화재의 경우 해당 시설 자체의 촬영허가도 별도로 필요합니다.\n\n📌 공식 창구: 드론원스톱 항공촬영 신청 및 해당 시설 관리부서 문의"
    };

    function sendAiMessage() {
      const input = document.getElementById("aiInput");
      const text = input.value.trim();
      if (!text) return;

      appendChatMessage(text, "user");
      input.value = "";

      setTimeout(() => {
        let answer = "드론 비행 및 촬영 전 비행 승인 대상 여부, 150m 이상 비행 시 비행승인 대상 여부 확인, 인구 밀집 지역 안전 수칙을 준수하세요. 본 앱은 비행 가능 여부를 최종 확정하지 않으므로 공식 기관 및 드론원스톱(drone.onestop.go.kr)에서 확인하시기 바랍니다.";
        for (let key in AI_RESPONSES) {
          if (text.includes(key)) {
            answer = AI_RESPONSES[key];
            break;
          }
        }
        appendChatMessage(answer, "bot");
      }, 300);
    }

    function askPreset(q) {
      document.getElementById("aiInput").value = q;
      sendAiMessage();
    }

    function appendChatMessage(msg, sender) {
      const box = document.getElementById("aiChatBox");
      const div = document.createElement("div");
      div.className = `chat-msg ${sender === "user" ? "chat-user" : "chat-bot"}`;
      div.innerText = msg;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    }

    // ============================================================
    // 9. 공식 출처 기반 검증 기체 DB (VERIFIED_DRONE_MODELS)
    // ============================================================
    // ※ [최종 엄격 감사 및 검증 원칙]:
    // 1. 항공안전법상 조종자 증명 1~4종 분류 기준은 반드시 공식 '최대이륙중량(MTOW)'만 사용합니다.
    // 2. 제조사 공식 제원의 'Takeoff Weight'는 단순 기본 이륙중량이며 법령상 '최대이륙중량'으로 자동 치환하지 않습니다.
    // 3. 제조사 공식 기술사양/매뉴얼에서 'Maximum Takeoff Weight'가 명시되지 않은 모델은 maxTakeoffWeightKg: null 처리하고 'needs_review'로 관리합니다.
    // 4. 배터리 구성이나 장비 탈부착에 따라 중량이 달라질 수 있는 모델은 조건과 경고를 함께 명시합니다.
    // 5. verifiedAt은 실제 verified 상태 기체에만 부여하며, needs_review는 lastReviewedAt으로 관리합니다.
    // 6. 원문의 부등호나 근사치('< 249 g', '약 377 g')는 takeoffWeightKg: null 처리하여 false precision을 제거합니다.
    const VERIFIED_DRONE_MODELS = [
      {
        manufacturer: "DJI",
        model: "DJI Mini 4 Pro",
        aliases: ["Mini 4 Pro", "Mini4Pro", "Mini 4", "Mini4", "미니4", "미니 4", "미니4프로", "미니 4 프로", "DJI 미니 4", "매빅 미니 4"],
        aircraftWeightKg: null,
        takeoffWeightKg: null, // 공식 기술사양에 '< 249 g'만 명시되어 false precision 방지를 위해 null 처리
        maxTakeoffWeightKg: null, // 공식 기술사양에 법령상 '최대이륙중량(MTOW)' 별도 미명시
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "< 249 g",
        sourceCondition: "표준 인텔리전트 플라이트 배터리, 프로펠러, microSD 카드 포함 기준",
        weightDescription: "표준 구성의 공식 표기 중량은 249g 미만(< 249 g)이며, 특정 배터리 구성에서는 249g을 초과할 수 있음.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/mini-4-pro/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: true,
        conditionalNotice: "⚠️ 구성에 따라 중량 기준이 달라질 수 있습니다. (표준 배터리는 <249g이나 대용량 플러스 배터리 장착 시 250g을 초과하여 4종 자격 및 기체 신고 대상이 될 수 있습니다)"
      },
      {
        manufacturer: "DJI",
        model: "DJI Mini 3 Pro",
        aliases: ["Mini 3 Pro", "Mini3Pro", "Mini 3", "Mini3", "미니3", "미니 3", "미니3프로", "미니 3 프로", "DJI 미니 3"],
        aircraftWeightKg: null,
        takeoffWeightKg: null, // 공식 기술사양에 '< 249 g'만 명시되어 false precision 방지를 위해 null 처리
        maxTakeoffWeightKg: null, // 공식 기술사양에 '최대이륙중량(MTOW)' 별도 미명시
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "< 249 g",
        sourceCondition: "표준 인텔리전트 플라이트 배터리, 프로펠러, microSD 카드 포함 기준",
        weightDescription: "표준 구성의 공식 표기 중량은 249g 미만(< 249 g)이며, 특정 배터리 구성에서는 249g을 초과할 수 있음.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/mini-3-pro/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: true,
        conditionalNotice: "⚠️ 구성에 따라 중량 기준이 달라질 수 있습니다. (표준 배터리는 <249g이나 플러스 배터리 장착 시 약 290g으로 250g을 초과하여 4종 자격 필요)"
      },
      {
        manufacturer: "DJI",
        model: "DJI Mini 2 SE",
        aliases: ["Mini 2 SE", "Mini2SE", "Mini 2", "Mini2", "미니2", "미니 2", "미니2SE", "미니 2 SE", "DJI 미니 2"],
        aircraftWeightKg: null,
        takeoffWeightKg: 0.246,
        maxTakeoffWeightKg: 0.246, // 공식 매뉴얼 제원상 'Maximum Take-Off Weight: 246 g' 명시 확인
        selfWeightKg: null,
        sourceFieldLabel: "Maximum Take-Off Weight",
        sourceValueText: "246 g",
        sourceCondition: "배터리, 프로펠러 및 microSD 카드 포함 기준",
        weightDescription: "DJI 공식 사용자 매뉴얼 제원상 'Maximum Take-Off Weight: 246 g' 명시 확인됨. 최대이륙중량 250g 이하로 1~4종 조종자 증명 대상 제외 범위에 해당함.",
        sourceType: "manufacturer",
        sourceName: "DJI Mini 2 SE 공식 사용자 매뉴얼 (User Manual v1.0, p.51)",
        sourceUrl: "https://dl.djicdn.com/downloads/DJI_Mini_2_SE/20230209/DJI_Mini_2_SE_User_Manual_v1.0_ko.pdf",
        verifiedAt: "2026-09-17",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "verified",
        hasConditionalWeight: true,
        conditionalNotice: "공식 제원상 최대이륙중량은 246g이나 프로펠러 가드 등 추가 액세서리 장착 시 250g을 초과할 수 있으므로 장착 장비를 확인하세요."
      },
      {
        manufacturer: "DJI",
        model: "DJI Air 3",
        aliases: ["Air 3", "Air3", "에어3", "에어 3", "DJI 에어 3", "에어3 드론"],
        aircraftWeightKg: null,
        takeoffWeightKg: 0.720,
        maxTakeoffWeightKg: null, // 공식 제원에 'Takeoff Weight: 720g'만 명시, MTOW 별도 미명시
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "720 g",
        sourceCondition: "프로펠러 및 배터리 포함 기준",
        weightDescription: "DJI 공식 기술사양 원문에 'Takeoff Weight: 720g'으로만 명시되어 있으며, Maximum Takeoff Weight는 별도 명시되지 않아 법령상 최대이륙중량 공식 확인 필요.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/air-3/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 표기 이륙중량 720g(Takeoff Weight)이나 공식 기술사양에 최대이륙중량(MTOW)이 별도 기재되지 않았습니다."
      },
      {
        manufacturer: "DJI",
        model: "DJI Air 2S",
        aliases: ["Air 2S", "Air2S", "에어2s", "에어 2s", "Air 2", "Air2", "에어2", "에어 2", "DJI 에어 2S"],
        aircraftWeightKg: null,
        takeoffWeightKg: 0.595,
        maxTakeoffWeightKg: null, // 공식 기술사양에 'Takeoff Weight: 595g'만 명시, MTOW 별도 미제공
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "595 g",
        sourceCondition: "프로펠러 및 배터리 포함 기준",
        weightDescription: "제조사 공식 기술사양에 '이륙 중량(Takeoff Weight): 595g' 표기. 공식 제원에 최대이륙중량(MTOW) 별도 미명시.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/air-2s/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 표기 이륙중량 595g(Takeoff Weight)이며 공식 최대이륙중량(MTOW)은 미명시 상태입니다."
      },
      {
        manufacturer: "DJI",
        model: "DJI Mavic 3 Pro",
        aliases: ["Mavic 3 Pro", "Mavic3Pro", "Mavic 3", "Mavic3", "매빅3", "매빅 3", "매빅3프로", "매빅 3 프로", "Mavic 3 Cine", "DJI 매빅 3"],
        aircraftWeightKg: null,
        takeoffWeightKg: null, // Cine 모델(963g) 상이하므로 false precision 방지 위해 null 처리
        maxTakeoffWeightKg: null, // 공식 제원에 별도 MTOW 미제공
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "958 g (Cine 모델 963 g)",
        sourceCondition: "프로펠러, 배터리 및 microSD 카드 포함 기준",
        weightDescription: "공식 이륙중량 Mavic 3 Pro 958g, Mavic 3 Pro Cine 963g 표기. 공식 제원에 별도 최대이륙중량(MTOW) 미명시.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/mavic-3-pro/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: true,
        conditionalNotice: "기본 모델 958g, Cine 모델 963g으로 세부 모델에 따라 기본 이륙중량이 다릅니다. 최대이륙중량(MTOW)은 별도 확인 필요."
      },
      {
        manufacturer: "DJI",
        model: "DJI Avata 2",
        aliases: ["Avata 2", "Avata2", "아바타2", "아바타 2", "DJI 아바타 2"],
        aircraftWeightKg: null,
        takeoffWeightKg: null, // '약 377 g' 근사치이므로 false precision 방지 위해 null 처리
        maxTakeoffWeightKg: null, // 공식 제원에 별도 MTOW 미제공
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "약 377 g",
        sourceCondition: "프로펠러 및 배터리 포함 기준",
        weightDescription: "제조사 공식 기술사양에 '이륙 중량(Takeoff Weight): 약 377g' 표기. 공식 제원에 별도 최대이륙중량(MTOW) 미명시.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/avata-2/specs",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 표기 이륙중량 약 377g(Takeoff Weight)이며 공식 최대이륙중량(MTOW)은 미명시 상태입니다."
      },
      {
        manufacturer: "DJI",
        model: "DJI Inspire 3",
        aliases: ["Inspire 3", "Inspire3", "인스파이어3", "인스파이어 3", "DJI 인스파이어 3"],
        aircraftWeightKg: 3.995,
        takeoffWeightKg: null,
        maxTakeoffWeightKg: 4.310, // 공식 제원에 'Max Takeoff Weight: Approx. 4,310 g' 명시 확인
        selfWeightKg: 3.995,
        sourceFieldLabel: "Weight / Max Takeoff Weight",
        sourceValueText: "Weight: Approx. 3,995 g / Max Takeoff Weight: Approx. 4,310 g",
        sourceCondition: "짐벌 카메라, 렌즈 1개, 배터리 2개, 프로펠러 4개, microSD 카드 포함 기준",
        weightDescription: "공식 제원상 기체 중량(Weight) 약 3,995g, 공식 최대이륙중량(Max Takeoff Weight) 약 4,310g(4.31kg) 분리 명시 확인. 3종(2kg 초과 ~ 7kg 이하) 해당.",
        sourceType: "manufacturer",
        sourceName: "DJI 공식 기술 사양 (Specs)",
        sourceUrl: "https://www.dji.com/kr/inspire-3/specs",
        verifiedAt: "2026-09-17",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "verified",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 공식 제원에서 기체 중량(3,995g)과 최대이륙중량(4,310g)이 분리 명시되어 공식 확인되었습니다."
      },
      {
        manufacturer: "Autel Robotics",
        model: "Autel EVO Lite+",
        aliases: ["EVO Lite+", "EVOLite+", "EVO Lite", "EVOLite", "Evo Lite Plus", "오텔 에보 라이트", "에보 라이트", "에보라이트"],
        aircraftWeightKg: 0.835,
        takeoffWeightKg: null,
        maxTakeoffWeightKg: 0.866, // 공식 제원에 Aircraft Weight: 835g, Maximum Takeoff Weight (MTOW): 866g 분리 명시 확인
        selfWeightKg: null,
        sourceFieldLabel: "Aircraft Weight / Maximum takeoff weight",
        sourceValueText: "Aircraft Weight: 835 g / MTOW: 866 g",
        sourceCondition: "배터리, 프로펠러, 짐벌 커버 포함 기준",
        weightDescription: "공식 제원상 기체 중량(Aircraft Weight) 835g, 공식 최대이륙중량(Maximum takeoff weight) 866g 분리 명시 확인. 4종(250g 초과 ~ 2kg 이하) 해당.",
        sourceType: "manufacturer",
        sourceName: "Autel Robotics 공식 제품 사양 (Specs)",
        sourceUrl: "https://www.autelrobotics.com/productdetail/24.html",
        verifiedAt: "2026-09-17",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "verified",
        hasConditionalWeight: false,
        conditionalNotice: "제조사 공식 제원에서 기체 중량(835g)과 최대이륙중량 MTOW(866g)가 명확히 구분되어 확인되었습니다."
      },
      {
        manufacturer: "Autel Robotics",
        model: "Autel EVO Nano+",
        aliases: ["EVO Nano+", "EVONano+", "EVO Nano", "EVONano", "Evo Nano Plus", "오텔 에보 나노", "에보 나노", "에보나노"],
        aircraftWeightKg: null,
        takeoffWeightKg: 0.249,
        maxTakeoffWeightKg: null, // 공식 기술사양에 'Takeoff Weight: 249 g'만 명시, MTOW 별도 미제공
        selfWeightKg: null,
        sourceFieldLabel: "Takeoff Weight",
        sourceValueText: "249 g",
        sourceCondition: "배터리, 프로펠러 및 microSD 카드 포함 기준",
        weightDescription: "제조사 공식 제원에 '이륙 중량(Takeoff Weight): 249g' 표기. 공식 제원에 별도 최대이륙중량(MTOW) 미명시.",
        sourceType: "manufacturer",
        sourceName: "Autel Robotics 공식 제품 사양 (Specs)",
        sourceUrl: "https://www.autelrobotics.com/productdetail/25.html",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: false,
        conditionalNotice: "공식 제원상 Takeoff Weight 249g으로 표기되어 있으며 법령상 최대이륙중량(MTOW)은 미명시 상태입니다."
      },
      {
        manufacturer: "DJI",
        model: "DJI Agras T40",
        aliases: ["Agras T40", "AgrasT40", "T40", "Agras", "아그라스", "아그라스 T40", "아그라스T40", "농업용 드론 T40", "DJI T40"],
        aircraftWeightKg: 50.0, // 배터리 포함 기체중량
        takeoffWeightKg: null,
        maxTakeoffWeightKg: null, // 살포(90kg)/분제(101kg) 조건별 상이하므로 단일 숫자로 단순화하지 않고 verified_conditional 처리
        selfWeightKg: 38.0, // 배터리 제외 자체중량
        sourceFieldLabel: "Total Weight / Max Takeoff Weight for spraying & spreading",
        sourceValueText: "배터리 제외 38kg, 배터리 포함 50kg / 살포 MTOW 90kg, 분제 MTOW 101kg",
        sourceCondition: "해수면 기준 운용 제원",
        weightDescription: "배터리 제외 자체중량 38kg, 배터리 포함 기본 중량 50kg. 액제 살포 시 최대이륙중량 90kg, 입제 살포 시 최대이륙중량 101kg. 운용 조건에 따라 상이하므로 운용 조건 확인 필요.",
        sourceType: "manufacturer",
        sourceName: "DJI Agriculture 공식 기술 사양 (Specs)",
        sourceUrl: "https://ag.dji.com/t40/specs",
        verifiedAt: "2026-09-17",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "verified_conditional",
        hasConditionalWeight: true,
        conditionalNotice: "운용 조건에 따라 최대이륙중량이 다릅니다: 액제 살포(spraying) 90kg / 입제 살포(spreading) 101kg. 자체중량은 배터리 제외 38kg입니다. (운용 조건 확인 필요)",
        maxTakeoffWeightConditions: [
          { condition: "spraying", label: "액제 살포 (spraying)", maxTakeoffWeightKg: 90.0 },
          { condition: "spreading", label: "입제 살포 (spreading)", maxTakeoffWeightKg: 101.0 }
        ]
      },
      {
        manufacturer: "Custom / 자작",
        model: "Custom 5-inch FPV",
        aliases: ["5-inch FPV", "5인치 FPV", "FPV", "Custom FPV", "자작 FPV", "레이싱 드론", "5인치 드론"],
        aircraftWeightKg: null,
        takeoffWeightKg: null,
        maxTakeoffWeightKg: null,
        selfWeightKg: null,
        sourceFieldLabel: "미확인 (개별 조립)",
        sourceValueText: "미확인",
        sourceCondition: "조립 부품 및 배터리 용량에 따라 상이",
        weightDescription: "자작 FPV 기체는 장착 모터, 배터리(4S~6S), 액션캠 유무에 따라 중량이 크게 달라지므로 공식 표준 제원이 존재하지 않습니다. 실측 후 직접 입력 필요.",
        sourceType: "unknown",
        sourceName: "공식 제원 미확인 (개별 조립 기체)",
        sourceUrl: "",
        verifiedAt: "",
        lastReviewedAt: "2026-09-17",
        verificationStatus: "needs_review",
        hasConditionalWeight: true,
        conditionalNotice: "자작 및 커스텀 기체는 사용 배터리와 탑재 장비에 따라 중량이 가변적이므로 반드시 저울로 실측하여 입력해야 합니다."
      }
    ];

    // ============================================================
    // 10. 기체 데이터 구조 및 조종자 증명 기준 자동 분류
    // ============================================================
    // Section 1: 신규 사용자 초기 상태는 빈 문자열, null, unknown으로 초기화
    let droneProfile = {
      model: "",
      manufacturer: "",
      aircraftWeightKg: null,
      takeoffWeightKg: null,
      maxTakeoffWeightKg: null,
      selfWeightKg: null,
      selfWeightSource: "none",
      sourceFieldLabel: "",
      sourceValueText: "",
      sourceCondition: "",
      weightDescription: "",
      sourceType: "unknown",
      sourceName: "",
      sourceUrl: "",
      verifiedAt: "",
      lastReviewedAt: "",
      verificationStatus: "unknown",
      qualificationClass: "unknown",
      classificationBasis: "unknown",
      hasConditionalWeight: false,
      conditionalNotice: "",
      maxTakeoffWeightConditions: [],
      legacyWeightCategory: null
    };

    // 법적 분류 함수: 공식 확인된 MTOW 및 25kg 초과 시 자체중량 필수 검증 (Section 4 & 5)
    function calculateQualificationClass(mtowKg, selfWeightKg, verificationStatus = "unknown", hasConditionalWeight = false) {
      // 1) 조건부 분류 판정:
      // verified_conditional이거나, MTOW 자체가 미확인(null/<=0)이면서 hasConditionalWeight인 경우에만 조건부 분류 적용
      // hasConditionalWeight가 단순 액세서리/구성 경고인 경우(예: DJI Mini 2 SE 등)는 공식 MTOW 분류를 막지 않음
      const isConditionalClassification = (verificationStatus === "verified_conditional") ||
        (hasConditionalWeight && (mtowKg === null || mtowKg === undefined || isNaN(mtowKg) || mtowKg <= 0));

      if (isConditionalClassification) {
        return {
          code: "conditional",
          name: "운용조건 확인 필요",
          classificationBasis: "conditional",
          badgeText: "⚠️ 운용조건별 MTOW 상이",
          badgeClass: "status-conditional",
          rangeText: "운용 조건별 상이 (살포 90kg / 분제 101kg 등)",
          legalNotice: "제조사 공식 제원에 운용 조건별(살포/분제 등)로 최대이륙중량이 상이하게 명시되어 있어 단일 조종자 증명 종을 사전 확정할 수 없습니다. 실제 운용 모드 및 탑재 중량에 따른 최대이륙중량을 확인하세요.",
          requiresSelfWeight: true,
          hasConditionalWarning: true,
          isConfirmed: false
        };
      }

      // 2) MTOW 미확인
      if (mtowKg === null || mtowKg === undefined || isNaN(mtowKg) || mtowKg <= 0) {
        return {
          code: "unknown",
          name: "조종자 증명 분류 확인 필요",
          classificationBasis: "unknown",
          badgeText: "❓ 최대이륙중량 확인 필요",
          badgeClass: "status-none",
          rangeText: "공식 최대이륙중량(MTOW) 미확인",
          legalNotice: "제조사 공식 제원에서 법령상 '최대이륙중량(MTOW)'이 확인되지 않아 1~4종 자격 기준을 자동 분류할 수 없습니다. 제조사 단순 표기 중량(Takeoff Weight)을 법령상 최대이륙중량으로 자동 복사하지 않습니다. 실제 운용 최대이륙중량을 공식 매뉴얼 또는 한국교통안전공단(TS)을 통해 확인하세요.",
          requiresSelfWeight: false,
          hasConditionalWarning: !!hasConditionalWeight,
          isConfirmed: false
        };
      }

      // 3) MTOW가 확인된 경우:
      // hasConditionalWeight가 단순 액세서리/구성 경고인 경우 공식 MTOW 분류를 막지 않고 정상 분류
      let basis = "unknown";
      if (verificationStatus === "verified") {
        basis = "official_verified";
      } else if (verificationStatus === "user_input") {
        basis = "user_input";
      } else {
        basis = "user_input";
      }

      const isUserInput = (basis === "user_input");

      // MTOW <= 250g
      if (mtowKg <= 0.250) {
        return {
          code: "none_or_not_applicable",
          name: isUserInput ? "입력값 기준 조종자 증명 대상 제외" : "조종자 증명 대상 제외 범위",
          classificationBasis: basis,
          badgeText: isUserInput ? "🟢 입력값: 250g 이하 (초소형)" : "🟢 250g 이하 (초소형)",
          badgeClass: "status-confirmed",
          rangeText: "최대이륙중량 250g 이하",
          legalNotice: "최대이륙중량 250g 이하 기체는 항공안전법상 1~4종 조종자 증명 취득 대상에서 제외됩니다. (단, 배터리/액세서리 변경으로 250g 초과 시 4종 대상이 되며, 150m 이상 비행 시 비행승인 대상 여부 확인 및 비행금지구역 비행 승인 등 준수사항은 동일 적용)",
          requiresSelfWeight: false,
          hasConditionalWarning: !!hasConditionalWeight,
          isConfirmed: true
        };
      } else if (mtowKg <= 2.0) {
        // 4종: 250g 초과 ~ 2kg 이하
        return {
          code: "class4",
          name: isUserInput ? "입력값 기준 4종" : "4종 조종자 증명 기준",
          classificationBasis: basis,
          badgeText: isUserInput ? "🟢 입력값: 2kg 이하 (4종)" : "🟢 2kg 이하 (4종)",
          badgeClass: "status-confirmed",
          rangeText: "최대이륙중량 250g 초과 ~ 2kg 이하",
          legalNotice: "만 10세 이상, 한국교통안전공단(TS) 배움터(edu.kotsa.or.kr) 온라인 교육(6시간) 이수 증명 필요 (실기시험 없음. 비사업용 기체신고 면제 대상 여부 확인). 최신 세부 응시요건은 TS국가자격시험에서 확인.",
          requiresSelfWeight: false,
          hasConditionalWarning: !!hasConditionalWeight,
          isConfirmed: true
        };
      } else if (mtowKg <= 7.0) {
        // 3종: 2kg 초과 ~ 7kg 이하
        return {
          code: "class3",
          name: isUserInput ? "입력값 기준 3종" : "3종 조종자 증명 기준",
          classificationBasis: basis,
          badgeText: isUserInput ? "🟡 입력값: 7kg 이하 (3종)" : "🟡 7kg 이하 (3종)",
          badgeClass: "status-conditional",
          rangeText: "최대이륙중량 2kg 초과 ~ 7kg 이하",
          legalNotice: "만 14세 이상, 비행경력 및 학과시험(필기) 합격 필요 (실기시험 없음. 최신 응시요건 및 세부 비행경력은 TS국가자격시험에서 공식 확인). 초경량비행장치 기체 신고 의무 대상.",
          requiresSelfWeight: false,
          hasConditionalWarning: !!hasConditionalWeight,
          isConfirmed: true
        };
      } else if (mtowKg <= 25.0) {
        // 2종: 7kg 초과 ~ 25kg 이하
        return {
          code: "class2",
          name: isUserInput ? "입력값 기준 2종" : "2종 조종자 증명 기준",
          classificationBasis: basis,
          badgeText: isUserInput ? "🟡 입력값: 25kg 이하 (2종)" : "🟡 25kg 이하 (2종)",
          badgeClass: "status-conditional",
          rangeText: "최대이륙중량 7kg 초과 ~ 25kg 이하",
          legalNotice: "만 14세 이상, 비행경력, 학과시험 및 실기시험 합격 필요 (최신 응시요건 및 세부 비행경력은 TS국가자격시험에서 공식 확인). 드론원스톱 기체 신고 의무 대상.",
          requiresSelfWeight: false,
          hasConditionalWarning: !!hasConditionalWeight,
          isConfirmed: true
        };
      } else {
        // MTOW > 25kg (1종 분류 로직 정밀 검증 - Section 4)
        if (selfWeightKg === null || isNaN(selfWeightKg)) {
          // B. MTOW > 25kg + selfWeightKg == null
          return {
            code: "unknown",
            name: "1종 여부 확인 필요",
            classificationBasis: isUserInput ? "user_input" : basis,
            badgeText: "❓ 1종 여부 확인 필요 (자체중량 미확인)",
            badgeClass: "status-none",
            rangeText: "최대이륙중량 25kg 초과 (자체중량 미확인)",
            legalNotice: "최대이륙중량이 25kg을 초과하므로 1종 조종자 증명 해당 여부를 판단하기 위해 연료/배터리를 제외한 자체중량(150kg 이하 여부)을 반드시 확인해야 합니다. 자체중량 미확인 상태에서는 1종으로 확정하지 않습니다.",
            requiresSelfWeight: true,
            hasConditionalWarning: !!hasConditionalWeight,
            isConfirmed: false
          };
        } else if (selfWeightKg <= 150) {
          // C. MTOW > 25kg + selfWeightKg <= 150
          return {
            code: "class1",
            name: isUserInput ? "입력값 기준 1종" : "1종 조종자 증명 기준",
            classificationBasis: isUserInput ? "user_input" : basis,
            badgeText: isUserInput ? "🔴 입력값: 1종 조종자 증명 기준" : "🔴 1종 조종자 증명 기준",
            badgeClass: "status-inquiry",
            rangeText: "최대이륙중량 25kg 초과 (자체중량 " + selfWeightKg + "kg 확인)",
            legalNotice: "최대이륙중량 25kg 초과 및 자체중량 " + selfWeightKg + "kg(150kg 이하 초경량비행장치 범위) 확인. 만 14세 이상, 비행경력, 학과시험 및 실기시험 합격 필요. 항공안전기술원(KIAST) 안전성인증 및 관할 지방항공청 비행승인 필수 대상.",
            requiresSelfWeight: true,
            hasConditionalWarning: !!hasConditionalWeight,
            isConfirmed: true
          };
        } else {
          // D. MTOW > 25kg + selfWeightKg > 150
          return {
            code: "unknown",
            name: "적용 범위 확인 필요",
            classificationBasis: isUserInput ? "user_input" : basis,
            badgeText: "⚠️ 적용 범위 확인 필요 (자체중량 150kg 초과)",
            badgeClass: "status-none",
            rangeText: "자체중량 " + selfWeightKg + "kg (150kg 초과)",
            legalNotice: "자체중량이 150kg을 초과하는 무인비행장치는 항공안전법상 초경량비행장치 범위를 벗어나 무인항공기 등 별도의 항공기 기준이 적용될 수 있으므로 국토교통부 항공정책실에 적용 법령을 직접 확인해야 합니다.",
            requiresSelfWeight: true,
            hasConditionalWarning: !!hasConditionalWeight,
            isConfirmed: false
          };
        }
      }
    }

    // ============================================================
    // 11. 기체 검색어 정규화 및 검색 엔진
    // ============================================================
    // 검색어 정규화: 문자열 변환, 트림, 소문자화, 공백/하이픈/언더바 제거
    function normalizeDroneSearchText(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .trim()
        .toLowerCase()
        .replace(/[\s\-_]+/g, "");
    }

    function executeDroneSearch() {
      const input = document.getElementById("droneSearchKeywordInput");
      const listEl = document.getElementById("droneSearchResultsList");
      const statusEl = document.getElementById("droneSearchStatusText");
      if (!input || !listEl) return;

      const rawKeyword = (input.value || "").trim();
      const qNorm = normalizeDroneSearchText(rawKeyword);

      // 검색어가 너무 짧은 경우 (2글자 미만) 안내 후 조기 반환
      if (!qNorm || qNorm.length < 2) {
        showToast("기체명을 2글자 이상 입력해주세요.");
        input.focus();
        return;
      }

      // 기체별 검색 매칭 및 관련도 우선순위 점수 산정
      const scoredResults = [];

      VERIFIED_DRONE_MODELS.forEach((d) => {
        const modelNorm = normalizeDroneSearchText(d.model);
        const mfrNorm = normalizeDroneSearchText(d.manufacturer);
        // 제조사명을 제외한 모델명 정규화 (예: 'DJI Mini 4 Pro' -> 'mini4pro')
        const shortModelNorm = normalizeDroneSearchText(
          d.model.replace(new RegExp('^' + (d.manufacturer || '') + '\\s*', 'i'), '')
        );
        const aliasesNorm = (Array.isArray(d.aliases) ? d.aliases : []).map(a => normalizeDroneSearchText(a)).filter(Boolean);

        let priority = 0;

        // 1순위: 정규화된 전체 모델명 / 제조사 제외 모델명 / alias 정확 일치
        if (shortModelNorm === qNorm) {
          priority = 100;
        } else if (modelNorm === qNorm) {
          priority = 98;
        } else if (aliasesNorm.some(a => a === qNorm)) {
          priority = 95;
        }
        // 2순위: 모델명 또는 alias 시작 부분 일치
        else if (shortModelNorm.startsWith(qNorm)) {
          priority = 85;
        } else if (modelNorm.startsWith(qNorm)) {
          priority = 80;
        } else if (aliasesNorm.some(a => a.startsWith(qNorm))) {
          priority = 75;
        }
        // 3순위: 모델명 또는 alias 중간 부분 포함
        else if (shortModelNorm.includes(qNorm)) {
          priority = 65;
        } else if (modelNorm.includes(qNorm)) {
          priority = 60;
        } else if (aliasesNorm.some(a => a.includes(qNorm))) {
          priority = 55;
        }
        // 4순위: 제조사명 일치
        else if (mfrNorm.includes(qNorm)) {
          priority = 30;
        }

        if (priority > 0) {
          scoredResults.push({
            drone: d,
            priority: priority,
            originalIndex: VERIFIED_DRONE_MODELS.indexOf(d)
          });
        }
      });

      // 관련도 우선순위 정렬 (점수 높은 순, 동일 시 DB 등록 순서 유지)
      scoredResults.sort((a, b) => b.priority - a.priority);

      listEl.style.display = "flex";
      if (statusEl) {
        statusEl.style.display = "block";
        statusEl.innerText = "검색 결과: " + scoredResults.length + "건";
      }

      if (scoredResults.length === 0) {
        listEl.innerHTML = '<div style="padding:14px 12px; background:#f8fafc; border-radius:8px; font-size:12px; color:var(--muted); text-align:center; border:1px dashed #cbd5e1; line-height:1.6;">' +
          '<strong style="color:var(--text); font-size:13px;">검색 결과가 없습니다.</strong><br>' +
          '<span style="font-size:11px; color:#64748b; margin-top:4px; display:inline-block;">입력 검색어: "<strong>' + escapeHtml(rawKeyword) + '</strong>"</span>' +
          '<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #e2e8f0; font-size:11px; color:#475569;">' +
            '💡 <strong>검색 예시:</strong> Mini 4 Pro / Mini 4 / Air 3 / Mavic 3 / 미니4<br>' +
            '<span style="color:var(--muted); font-size:10.5px; margin-top:3px; display:inline-block;">등록되지 않은 기체는 아래에서 직접 모델명과 최대이륙중량(MTOW)을 입력하세요.</span>' +
          '</div>' +
        '</div>';
        return;
      }

      let html = "";
      scoredResults.forEach(({ drone: d, originalIndex: idx }) => {
        const qInfo = calculateQualificationClass(d.maxTakeoffWeightKg, d.selfWeightKg, d.verificationStatus, d.hasConditionalWeight);

        let statusBadge = "";
        if (d.verificationStatus === "verified") {
          statusBadge = '<span style="font-size:10px; font-weight:700; color:#065f46; background:#d1fae5; padding:2px 6px; border-radius:4px;">✅ MTOW 공식확인</span>';
        } else if (d.verificationStatus === "verified_conditional") {
          statusBadge = '<span style="font-size:10px; font-weight:700; color:#065f46; background:#d1fae5; padding:2px 6px; border-radius:4px;">✅ 공식 제원 확인 · MTOW 조건 확인 필요</span>';
        } else {
          statusBadge = '<span style="font-size:10px; font-weight:700; color:#92400e; background:#fef3c7; padding:2px 6px; border-radius:4px;">❓ 법령 MTOW 확인필요</span>';
        }

        const aircraftWeightText = (d.aircraftWeightKg !== null) ? (d.aircraftWeightKg >= 1 ? d.aircraftWeightKg + 'kg' : Math.round(d.aircraftWeightKg * 1000) + 'g') : (d.takeoffWeightKg !== null ? (d.takeoffWeightKg >= 1 ? d.takeoffWeightKg + 'kg' : Math.round(d.takeoffWeightKg * 1000) + 'g') : (d.sourceValueText || '미확인'));
        const mtowText = (d.maxTakeoffWeightKg !== null) ? d.maxTakeoffWeightKg + 'kg' : (d.verificationStatus === "verified_conditional" ? '조건별 상이' : '공식 미명시');
        const dateText = d.verifiedAt ? '확인일: ' + d.verifiedAt : (d.lastReviewedAt ? '최근검토: ' + d.lastReviewedAt : '');

        html += '<div class="drone-result-item" data-index="' + idx + '">' +
          '<div>' +
            '<div class="drone-result-name">' + escapeHtml(d.manufacturer) + ' · ' + escapeHtml(d.model) + ' ' + statusBadge + '</div>' +
            '<div class="drone-result-meta">' +
              '표기중량: ' + escapeHtml(aircraftWeightText) + ' (' + escapeHtml(d.sourceFieldLabel || 'Takeoff Weight') + ') · 최대이륙중량: ' + escapeHtml(mtowText) + ' ' +
              (d.selfWeightKg !== null ? '· 자체중량: ' + d.selfWeightKg + 'kg ' : '') +
              '· 분류: <strong>' + escapeHtml(qInfo.badgeText) + '</strong>' +
            '</div>' +
            (d.hasConditionalWeight && d.conditionalNotice ? '<div style="font-size:10px; color:#b45309; margin-top:2px;">⚠️ 조건부 안내: ' + escapeHtml(d.conditionalNotice) + '</div>' : '') +
            '<div style="font-size:10px; color:var(--muted); margin-top:2px;">출처: ' + escapeHtml(d.sourceName) + ' ' + (dateText ? '(' + escapeHtml(dateText) + ')' : '') + '</div>' +
          '</div>' +
          '<button type="button" class="btn-primary btn-sm btn-select-drone" data-index="' + idx + '" style="padding:4px 8px; font-size:11px; white-space:nowrap;">이 기체 사용</button>' +
        '</div>';
      });
      listEl.innerHTML = html;

      // Event delegation (Section 15)
      listEl.onclick = (e) => {
        const itemEl = e.target.closest('.drone-result-item');
        if (!itemEl) return;
        const targetIdx = parseInt(itemEl.dataset.index, 10);
        if (!isNaN(targetIdx)) {
          selectVerifiedDrone(targetIdx);
        }
      };
    }

    function selectVerifiedDrone(idx) {
      const d = VERIFIED_DRONE_MODELS[idx];
      if (!d) return;

      droneProfile.manufacturer = d.manufacturer;
      droneProfile.model = d.model;
      droneProfile.aircraftWeightKg = d.aircraftWeightKg;
      droneProfile.takeoffWeightKg = d.takeoffWeightKg;
      droneProfile.maxTakeoffWeightKg = d.maxTakeoffWeightKg;
      droneProfile.selfWeightKg = d.selfWeightKg;
      droneProfile.selfWeightSource = d.selfWeightKg ? "official" : "none";
      droneProfile.sourceFieldLabel = d.sourceFieldLabel || "";
      droneProfile.sourceValueText = d.sourceValueText || "";
      droneProfile.sourceCondition = d.sourceCondition || "";
      droneProfile.weightDescription = d.weightDescription || "";
      droneProfile.sourceType = d.sourceType || "manufacturer";
      droneProfile.sourceName = d.sourceName;
      droneProfile.sourceUrl = d.sourceUrl;
      droneProfile.verifiedAt = d.verifiedAt || "";
      droneProfile.lastReviewedAt = d.lastReviewedAt || "";
      droneProfile.verificationStatus = d.verificationStatus;
      droneProfile.hasConditionalWeight = !!d.hasConditionalWeight;
      droneProfile.conditionalNotice = d.conditionalNotice || "";
      droneProfile.maxTakeoffWeightConditions = d.maxTakeoffWeightConditions || [];

      // 입력 폼에 값 동기화
      const elModel = document.getElementById("permitDroneModel");
      const elMfr = document.getElementById("permitManufacturer");
      const elWeight = document.getElementById("permitWeightKg");
      const elSelfWeight = document.getElementById("permitSelfWeightKg");

      if (elModel) elModel.value = d.model;
      if (elMfr) elMfr.value = d.manufacturer;
      if (elWeight) elWeight.value = (d.maxTakeoffWeightKg !== null) ? d.maxTakeoffWeightKg : "";
      if (elSelfWeight) elSelfWeight.value = (d.selfWeightKg !== null) ? d.selfWeightKg : "";

      // 검색 결과 접기
      const listEl = document.getElementById("droneSearchResultsList");
      if (listEl) listEl.style.display = "none";

      const searchInput = document.getElementById("droneSearchKeywordInput");
      if (searchInput) searchInput.value = d.model;

      renderDroneProfileUI();
      savePermitProfile();
      updatePermitView();
      updateComprehensiveDiagnosis();

      showToast('🚁 "' + d.model + '" 기체 정보가 적용되었습니다.');
    }

    // Section 6: 사용자 직접 입력 시 이전 기체 데이터 완전 제거
    function onDroneManualInput() {
      const elModel = document.getElementById("permitDroneModel");
      const elMfr = document.getElementById("permitManufacturer");
      const elWeight = document.getElementById("permitWeightKg");
      const elSelfWeight = document.getElementById("permitSelfWeightKg");

      const modelVal = elModel ? elModel.value.trim() : "";
      const mfrVal = elMfr ? elMfr.value.trim() : "";

      const matched = VERIFIED_DRONE_MODELS.find(d => d.model.toLowerCase() === modelVal.toLowerCase());

      if (matched) {
        droneProfile.manufacturer = matched.manufacturer;
        droneProfile.model = matched.model;
        droneProfile.aircraftWeightKg = matched.aircraftWeightKg;
        droneProfile.takeoffWeightKg = matched.takeoffWeightKg;
        droneProfile.maxTakeoffWeightKg = matched.maxTakeoffWeightKg;
        droneProfile.selfWeightKg = matched.selfWeightKg;
        droneProfile.selfWeightSource = matched.selfWeightKg ? "official" : "none";
        droneProfile.sourceFieldLabel = matched.sourceFieldLabel || "";
        droneProfile.sourceValueText = matched.sourceValueText || "";
        droneProfile.sourceCondition = matched.sourceCondition || "";
        droneProfile.weightDescription = matched.weightDescription || "";
        droneProfile.sourceType = matched.sourceType || "manufacturer";
        droneProfile.sourceName = matched.sourceName;
        droneProfile.sourceUrl = matched.sourceUrl;
        droneProfile.verifiedAt = matched.verifiedAt || "";
        droneProfile.lastReviewedAt = matched.lastReviewedAt || "";
        droneProfile.verificationStatus = matched.verificationStatus;
        droneProfile.hasConditionalWeight = !!matched.hasConditionalWeight;
        droneProfile.conditionalNotice = matched.conditionalNotice || "";
        droneProfile.maxTakeoffWeightConditions = matched.maxTakeoffWeightConditions || [];

        if (elMfr && !mfrVal) elMfr.value = matched.manufacturer;
        if (elWeight) elWeight.value = (matched.maxTakeoffWeightKg !== null) ? matched.maxTakeoffWeightKg : "";
        if (elSelfWeight) elSelfWeight.value = (matched.selfWeightKg !== null) ? matched.selfWeightKg : "";
      } else {
        // 이전 기체 데이터 누출 방지 완전 제거
        droneProfile.model = modelVal;
        droneProfile.manufacturer = mfrVal;
        droneProfile.aircraftWeightKg = null;
        droneProfile.takeoffWeightKg = null;
        droneProfile.maxTakeoffWeightKg = null;
        droneProfile.selfWeightKg = null;
        droneProfile.sourceType = "user_input";
        droneProfile.sourceName = "사용자 직접 입력";
        droneProfile.sourceUrl = "";
        droneProfile.sourceFieldLabel = "사용자 직접 입력";
        droneProfile.sourceValueText = "";
        droneProfile.sourceCondition = "";
        droneProfile.weightDescription = "사용자가 직접 입력한 기체 제원 정보입니다.";
        droneProfile.verifiedAt = "";
        droneProfile.lastReviewedAt = "";
        droneProfile.verificationStatus = modelVal ? "user_input" : "unknown";
        droneProfile.qualificationClass = "unknown";
        droneProfile.classificationBasis = modelVal ? "user_input" : "unknown";
        droneProfile.selfWeightSource = "user_input";
        droneProfile.hasConditionalWeight = false;
        droneProfile.conditionalNotice = "";
        droneProfile.maxTakeoffWeightConditions = [];

        if (elWeight) elWeight.value = "";
        if (elSelfWeight) elSelfWeight.value = "";
      }

      renderDroneProfileUI();
      savePermitProfile();
      updatePermitView();
      updateComprehensiveDiagnosis();
    }

    function onDroneWeightInput(save = true) {
      const elWeight = document.getElementById("permitWeightKg");
      const rawVal = elWeight ? elWeight.value.trim() : "";
      const val = rawVal ? parseFloat(rawVal) : null;
      const kg = (val !== null && !isNaN(val)) ? Math.max(0.001, val) : null;

      droneProfile.maxTakeoffWeightKg = kg;

      // 사용자가 입력창을 직접 수정한 경우 공식 DB 값과 숫자가 같더라도
      // verificationStatus="user_input", classificationBasis="user_input"으로 처리
      droneProfile.sourceType = "user_input";
      droneProfile.verificationStatus = "user_input";
      droneProfile.classificationBasis = "user_input";
      droneProfile.sourceName = "사용자 직접 입력";
      droneProfile.sourceUrl = "";
      droneProfile.sourceFieldLabel = "사용자 직접 입력";
      droneProfile.sourceValueText = kg !== null ? (kg + "kg") : "미입력";
      droneProfile.verifiedAt = "";

      renderDroneProfileUI();

      if (save) {
        savePermitProfile();
        updatePermitView();
        updateComprehensiveDiagnosis();
      }
    }

    // Section 7: 자체중량 직접 변경 시 검증 상태 수정
    function onDroneSelfWeightInput() {
      const elSelfWeight = document.getElementById("permitSelfWeightKg");
      const rawVal = elSelfWeight ? elSelfWeight.value.trim() : "";
      const val = rawVal ? parseFloat(rawVal) : null;
      droneProfile.selfWeightKg = (val !== null && !isNaN(val)) ? Math.max(0, val) : null;
      droneProfile.selfWeightSource = "user_input";

      renderDroneProfileUI();
      savePermitProfile();
      updatePermitView();
      updateComprehensiveDiagnosis();
    }

    function setPresetWeight(kg) {
      const elWeight = document.getElementById("permitWeightKg");
      if (elWeight) elWeight.value = kg;
      onDroneWeightInput(true);
    }

    function renderDroneProfileUI() {
      const mtow = droneProfile.maxTakeoffWeightKg;
      const sw = droneProfile.selfWeightKg;
      const q = calculateQualificationClass(mtow, sw, droneProfile.verificationStatus, droneProfile.hasConditionalWeight);
      droneProfile.qualificationClass = q.code;
      droneProfile.classificationBasis = q.classificationBasis;

      const isModelEmpty = !droneProfile.model;

      // 1) 4-Box 상세 비교 그리드 동기화
      const elDispAcw = document.getElementById("displayAircraftWeight");
      const elDispAcwSub = document.getElementById("displayAircraftWeightSub");
      const elDispLabel = document.getElementById("displaySourceFieldLabel");
      const elDispMtow = document.getElementById("displayMaxTakeoffWeight");
      const elDispMtowStatus = document.getElementById("displayMtowStatus");
      const elDispSw = document.getElementById("displaySelfWeight");
      const elDispQ = document.getElementById("displayQualificationClass");
      const elDispQSub = document.getElementById("displayQualificationSub");

      const acw = droneProfile.aircraftWeightKg;
      const tow = droneProfile.takeoffWeightKg;

      if (elDispAcw) {
        if (isModelEmpty) {
          elDispAcw.innerText = "기체 미지정";
        } else if (acw !== null && !isNaN(acw) && acw > 0) {
          elDispAcw.innerText = acw >= 1 ? (acw + " kg") : (Math.round(acw * 1000) + " g");
        } else if (tow !== null && !isNaN(tow) && tow > 0) {
          elDispAcw.innerText = tow >= 1 ? (tow + " kg") : (Math.round(tow * 1000) + " g");
        } else if (droneProfile.sourceValueText) {
          elDispAcw.innerText = droneProfile.sourceValueText;
        } else {
          elDispAcw.innerText = "미확인";
        }
      }
      if (elDispAcwSub) {
        elDispAcwSub.innerText = isModelEmpty ? "승인준비에서 기체 선택" : (droneProfile.sourceCondition ? (droneProfile.sourceCondition.slice(0, 20) + "...") : "제조사 표기 중량");
      }
      if (elDispLabel) {
        elDispLabel.innerText = isModelEmpty ? "" : (droneProfile.sourceFieldLabel ? ("(" + droneProfile.sourceFieldLabel + ")") : "(항목 미확인)");
      }

      if (elDispMtow) {
        if (isModelEmpty) {
          elDispMtow.innerText = "기체 미지정";
          elDispMtow.style.color = "var(--muted)";
        } else if (mtow !== null && !isNaN(mtow) && mtow > 0) {
          elDispMtow.innerText = mtow + " kg";
          elDispMtow.style.color = "var(--text)";
        } else {
          elDispMtow.innerText = (droneProfile.verificationStatus === "verified_conditional") ? "운용조건별 확인 필요" : "확인되지 않음";
          elDispMtow.style.color = "#b45309";
        }
      }
      if (elDispMtowStatus) {
        if (isModelEmpty) {
          elDispMtowStatus.innerText = "기체 미지정";
          elDispMtowStatus.style.color = "var(--muted)";
        } else if (droneProfile.verificationStatus === "verified" && mtow !== null) {
          elDispMtowStatus.innerText = "공식 확인됨";
          elDispMtowStatus.style.color = "var(--success)";
        } else if (droneProfile.verificationStatus === "verified_conditional") {
          elDispMtowStatus.innerText = "운용조건별 상이 (확인필요)";
          elDispMtowStatus.style.color = "#b45309";
        } else if (droneProfile.verificationStatus === "user_input") {
          elDispMtowStatus.innerText = "사용자 직접 입력";
          elDispMtowStatus.style.color = "#b45309";
        } else {
          elDispMtowStatus.innerText = "공식 미명시 (확인필요)";
          elDispMtowStatus.style.color = "#b45309";
        }
      }

      if (elDispSw) {
        if (isModelEmpty) {
          elDispSw.innerText = "기체 미지정";
        } else if (sw !== null && !isNaN(sw) && sw > 0) {
          const swSourceText = (droneProfile.selfWeightSource === "user_input") ? " (자체중량 사용자 입력)" : " (공식)";
          elDispSw.innerText = sw + " kg" + swSourceText;
        } else {
          elDispSw.innerText = "해당없음 / 미확인";
        }
      }

      if (elDispQ) {
        if (isModelEmpty) {
          elDispQ.innerText = "🚁 기체 미지정";
          elDispQ.style.color = "var(--muted)";
        } else {
          elDispQ.innerText = q.name;
          elDispQ.style.color = q.isConfirmed ? "#15803d" : "#b45309";
        }
      }
      if (elDispQSub) {
        elDispQSub.innerText = isModelEmpty ? "승인준비 탭에서 기체를 검색하거나 직접 입력하세요." : q.rangeText;
        elDispQSub.style.color = q.isConfirmed ? "#166534" : "#92400e";
      }

      // 2) 기체 조건 경고 상자 동기화
      const alertBox = document.getElementById("droneConditionAlert");
      const alertDesc = document.getElementById("droneConditionAlertDesc");
      if (alertBox && alertDesc) {
        if (!isModelEmpty && droneProfile.hasConditionalWeight && droneProfile.conditionalNotice) {
          alertBox.style.display = "block";
          alertDesc.innerHTML = '<strong>⚠️ 구성 및 운용 조건 주의:</strong> ' + escapeHtml(droneProfile.conditionalNotice) + '<br><span style="font-size:10.5px; color:#b45309;">※ 사용 중인 실제 배터리와 장착 액세서리를 제조사 제원과 함께 반드시 확인하세요.</span>';
        } else {
          alertBox.style.display = "none";
        }
      }

      // 3) 상단 뱃지 및 안내문구 갱신
      const badge = document.getElementById("weightCategoryBadge");
      const notice = document.getElementById("weightLawNotice");
      if (badge) {
        if (isModelEmpty) {
          badge.innerText = "🚁 기체 미지정";
          badge.style.color = "var(--muted)";
        } else {
          badge.innerText = q.badgeText;
          if (q.badgeClass === "status-confirmed") {
            badge.style.color = "var(--success)";
          } else if (q.badgeClass === "status-conditional") {
            badge.style.color = "#b45309";
          } else if (q.badgeClass === "status-inquiry") {
            badge.style.color = "var(--danger)";
          } else {
            badge.style.color = "var(--muted)";
          }
        }
      }
      if (notice) {
        if (isModelEmpty) {
          notice.innerText = "※ 기체가 지정되지 않았습니다. 승인준비 탭에서 기체를 검색하거나 직접 입력하세요.";
        } else {
          notice.innerText = "※ " + q.legalNotice;
        }
      }

      // 4) 자체중량 입력 영역 표시 조건 (25kg 초과 시 표출)
      const selfWeightGroup = document.getElementById("selfWeightGroup");
      if (selfWeightGroup) {
        selfWeightGroup.style.display = (mtow !== null && mtow > 25) ? "block" : "none";
      }

      // 5) 출처 안내 배너 갱신 (Section 8, 9, 14 XSS 방지)
      const banner = document.getElementById("droneSourceBanner");
      const bannerText = document.getElementById("droneSourceBannerText");
      const btnUrl = document.getElementById("btnDroneSourceUrl");

      if (banner && bannerText && btnUrl) {
        if (isModelEmpty) {
          banner.className = "drone-source-banner drone-source-none";
          bannerText.innerHTML = '<strong>🚁 기체 미지정</strong><br><span style="font-size:11px;">승인준비 탭에서 기체를 검색하여 선택하거나 직접 입력하세요.</span>';
          btnUrl.style.display = "none";
        } else if (droneProfile.verificationStatus === "verified") {
          banner.className = "drone-source-banner drone-source-verified";
          bannerText.innerHTML = '<strong>✅ 공식 MTOW 확인</strong>: ' + escapeHtml(droneProfile.model) + '<br><span style="font-size:11px;">출처: ' + escapeHtml(droneProfile.sourceName || '공식 기술 사양') + ' (' + escapeHtml(droneProfile.verifiedAt) + ') · 항목: "' + escapeHtml(droneProfile.sourceFieldLabel || 'Max Takeoff Weight') + '" · 최대이륙중량: ' + (mtow !== null ? mtow + 'kg' : '미확인') + '</span>';
          if (droneProfile.sourceUrl) {
            btnUrl.href = droneProfile.sourceUrl;
            btnUrl.style.display = "inline-flex";
          } else {
            btnUrl.style.display = "none";
          }
        } else if (droneProfile.verificationStatus === "verified_conditional") {
          banner.className = "drone-source-banner drone-source-conditional";
          bannerText.innerHTML = '<strong>✅ 공식 제원 확인</strong>: ' + escapeHtml(droneProfile.model) + '<br><span style="font-size:11px;">⚠️ 최대이륙중량은 운용조건별 확인 필요 (출처: ' + escapeHtml(droneProfile.sourceName || '공식 기술 사양') + ')</span>';
          if (droneProfile.sourceUrl) {
            btnUrl.href = droneProfile.sourceUrl;
            btnUrl.style.display = "inline-flex";
          } else {
            btnUrl.style.display = "none";
          }
        } else if (droneProfile.verificationStatus === "user_input") {
          banner.className = "drone-source-banner drone-source-user";
          bannerText.innerHTML = '<strong>⚠️ 사용자 입력 정보</strong>: 최대이륙중량 ' + (mtow !== null ? mtow + 'kg' : '미입력') + '<br><span style="font-size:11px;">사용자 직접 입력 값입니다. 제조사 공식 기술사양(Specs)으로 최대이륙중량(MTOW)을 다시 확인하세요.</span>';
          btnUrl.style.display = "none";
        } else {
          banner.className = "drone-source-banner drone-source-review";
          const displayAcwText = (acw !== null ? (acw >= 1 ? acw + 'kg' : Math.round(acw * 1000) + 'g') : (droneProfile.sourceValueText || '확인'));
          bannerText.innerHTML = '<strong>❓ 법령상 최대이륙중량(MTOW) 별도 확인 필요</strong><br><span style="font-size:11px;">제조사 공식 자료에서 \'Takeoff Weight\'(' + escapeHtml(displayAcwText) + ')만 제공되고 \'최대이륙중량(MTOW)\'이 별도 명시되지 않아 조종자 증명 분류를 자동 확정하지 않습니다.</span>';
          if (droneProfile.sourceUrl) {
            btnUrl.href = droneProfile.sourceUrl;
            btnUrl.style.display = "inline-flex";
          } else {
            btnUrl.style.display = "none";
          }
        }
      }

      // 6) 1~4종 기준 안내 카드 하이라이트
      const cardMap = {
        class1: document.getElementById("classCard1"),
        class2: document.getElementById("classCard2"),
        class3: document.getElementById("classCard3"),
        class4: document.getElementById("classCard4"),
        none_or_not_applicable: document.getElementById("classCardNone")
      };
      Object.keys(cardMap).forEach(k => {
        if (cardMap[k]) {
          if (q.isConfirmed && k === q.code && !isModelEmpty) {
            cardMap[k].classList.add("active");
          } else {
            cardMap[k].classList.remove("active");
          }
        }
      });
    }

    // ============================================================
    // 11. 공식 확인된 촬영장소 규칙 데이터 (filmingSiteRules)
    // ============================================================
    // ※ [규칙]: detectionRadius는 시설의 실제 행정/관리구역 경계가 아닌 "촬영장소 후보 감지용 반경"입니다.
    const filmingSiteRules = [
      {
        id: "independence_hall",
        name: "독립기념관",
        institutionName: "독립기념관",
        department: "고객소통부",
        address: "충청남도 천안시 동남구 목천읍 독립기념관로 1",
        latitude: 36.7836,
        longitude: 127.2232,
        detectionRadius: 1500, // 1.5km (촬영장소 후보 감지용 반경)
        sourceType: "official",
        source: "독립기념관 공식 촬영허가 안내",
        verifiedAt: "2026-09-17",
        institutionPermission: "사전 허가 필요",
        tel: "041-560-0241",
        phone: "041-560-0241",
        email: "itemdori@i815.or.kr",
        officialUrl: "https://i815.or.kr/2018/news/news.do?mode=V&no=995391",
        deadline: "촬영일 기준 5일 전까지 신청",
        notes: "독립기념관 경내 촬영 시 촬영일 기준 5일 전까지 시설관리 부서(고객소통부) 사전 신청서 및 서약서 제출 필요. 드론 촬영은 관계기관 사전 승인 및 기관 자체 협의가 필요합니다.",
        documents: [
          { id: "doc_ind_1", name: "독립기념관 시설촬영 신청서", requiredStatus: "확인됨", formats: "HWP, PDF", sourceUrl: "https://i815.or.kr/2018/news/news.do?mode=V&no=995391", verifiedAt: "2026-09-17" },
          { id: "doc_ind_2", name: "촬영 준수사항 서약서", requiredStatus: "확인됨", formats: "HWP, PDF", sourceUrl: "https://i815.or.kr/2018/news/news.do?mode=V&no=995391", verifiedAt: "2026-09-17" },
          { id: "doc_ind_3", name: "드론원스톱 관련 승인/신청 자료 (해당 시, 기관 확인 필요)", requiredStatus: "기관 확인 필요", formats: "PDF, JPG", sourceUrl: "https://drone.onestop.go.kr", verifiedAt: "2026-09-17" }
        ]
      },
      {
        id: "war_memorial",
        name: "전쟁기념관",
        institutionName: "전쟁기념사업회",
        department: "확인 필요",
        address: "서울특별시 용산구 이태원로 29",
        latitude: 37.5366,
        longitude: 126.9772,
        detectionRadius: 1000, // 1km (촬영장소 후보 감지용 반경)
        sourceType: "official",
        source: "전쟁기념사업회 공식 안내",
        verifiedAt: "2026-09-17",
        institutionPermission: "기관 사전 문의 필요",
        tel: "02-709-3114",
        phone: "02-709-3114",
        email: null, // 공식 확인되지 않은 이메일 임의 생성 금지
        officialUrl: "https://www.warmemo.or.kr",
        deadline: null, // 공식 신청기한 미공시
        notes: "용산 비행제한/금지공역 인접 및 국가 안보 관련 기념시설입니다. 전용 드론 촬영 신청서 양식 및 공식 이메일 접수처가 공시되지 않았으므로 비행·촬영 전 기관 대표번호(02-709-3114)로 사전 문의가 필수적입니다.",
        documents: [
          { id: "doc_war_1", name: "시설 사용/촬영 허가 신청서 (기관 문의)", requiredStatus: "기관 문의", formats: "기관 문의", sourceUrl: "https://www.warmemo.or.kr", verifiedAt: "2026-09-17" },
          { id: "doc_war_2", name: "드론원스톱 관련 승인/신청 자료 (해당 시, 기관 확인 필요)", requiredStatus: "기관 확인 필요", formats: "PDF, JPG", sourceUrl: "https://drone.onestop.go.kr", verifiedAt: "2026-09-17" }
        ]
      }
    ];

    // ============================================================
    // 12. 비행승인·항공촬영 승인 준비 도우미 모듈
    // ============================================================
    const PERMIT_STORAGE_KEY = "drone_permit_profile";

    let selectedFilmingSite = null; // 사용자가 확정한 장소 규칙 객체
    let candidateFilmingSite = null; // 감지된 반경 내 장소 후보 { site, dist }
    let userDocuments = []; // 사용자 등록 서류 (브라우저 메모리 관리, 서버 미전송)
    let isSearchingLocation = false; // 검색 중복 방지 플래그

    // Section 3: permitProfile.weightKg 중복 상태 제거
    let permitProfile = {
      droneModel: "",
      altitude: 50,
      purpose: "촬영",
      isAerialPhoto: true
    };

    // 프로필 초기 로드 및 UI 반영 (Section 1: 신규 사용자 기본 기체 제거, Section 2: legacy migration 수정)
    function initPermitProfile() {
      const saved = safeStorageGet(PERMIT_STORAGE_KEY, {});

      let legacyWeightCategory = null;
      let legacyNotice = "";
      if (saved.weightCategory) {
        legacyWeightCategory = saved.weightCategory;
      }

      let initialMtow = null;
      if (saved.maxTakeoffWeightKg !== undefined && saved.maxTakeoffWeightKg !== null && !isNaN(saved.maxTakeoffWeightKg)) {
        initialMtow = Number(saved.maxTakeoffWeightKg);
      } else if (saved.weightCategory === "under25" || saved.weightCategory === "over25") {
        // Section 2: over25 -> 26kg, under25 -> 0.249kg 자동변환 금지!
        initialMtow = null;
        legacyNotice = "기존 저장정보에서 정확한 최대이륙중량을 확인할 수 없습니다. 실제 공식 제원 확인 후 다시 입력하세요.";
      } else if (saved.weightKg !== undefined && saved.weightKg !== null && !isNaN(saved.weightKg)) {
        if (!saved.model && !saved.droneModel && (saved.weightKg === 0.249 || saved.weightKg === 26.0)) {
          initialMtow = null;
        } else {
          initialMtow = Number(saved.weightKg);
        }
      }

      droneProfile.legacyWeightCategory = legacyWeightCategory;

      const hasSavedModel = !!(saved.droneModel || saved.model);

      if (hasSavedModel) {
        droneProfile.model = saved.droneModel || saved.model || "";
        droneProfile.manufacturer = saved.manufacturer || "";
        droneProfile.aircraftWeightKg = (saved.aircraftWeightKg !== undefined) ? saved.aircraftWeightKg : null;
        droneProfile.takeoffWeightKg = (saved.takeoffWeightKg !== undefined) ? saved.takeoffWeightKg : null;
        droneProfile.maxTakeoffWeightKg = initialMtow;
        droneProfile.selfWeightKg = (saved.selfWeightKg !== undefined) ? saved.selfWeightKg : null;
        droneProfile.selfWeightSource = saved.selfWeightSource || (saved.selfWeightKg ? "user_input" : "none");
        droneProfile.sourceFieldLabel = saved.sourceFieldLabel || "";
        droneProfile.sourceValueText = saved.sourceValueText || "";
        droneProfile.sourceCondition = saved.sourceCondition || "";
        droneProfile.weightDescription = saved.weightDescription || "";
        droneProfile.sourceType = saved.sourceType || "user_input";
        droneProfile.sourceName = saved.sourceName || "";
        droneProfile.sourceUrl = saved.sourceUrl || "";
        droneProfile.verifiedAt = saved.verifiedAt || "";
        droneProfile.lastReviewedAt = saved.lastReviewedAt || "";
        droneProfile.verificationStatus = saved.verificationStatus || "user_input";
        droneProfile.hasConditionalWeight = !!saved.hasConditionalWeight;
        droneProfile.conditionalNotice = saved.conditionalNotice || "";
        droneProfile.maxTakeoffWeightConditions = saved.maxTakeoffWeightConditions || [];

        const matched = VERIFIED_DRONE_MODELS.find(d => d.model.toLowerCase() === droneProfile.model.toLowerCase());
        if (matched && (droneProfile.verificationStatus === "verified" || droneProfile.verificationStatus === "verified_conditional" || droneProfile.verificationStatus === "needs_review" || !saved.sourceName)) {
          droneProfile.manufacturer = matched.manufacturer;
          droneProfile.model = matched.model;
          droneProfile.aircraftWeightKg = matched.aircraftWeightKg;
          droneProfile.takeoffWeightKg = matched.takeoffWeightKg;
          droneProfile.maxTakeoffWeightKg = matched.maxTakeoffWeightKg;
          droneProfile.selfWeightKg = matched.selfWeightKg;
          droneProfile.selfWeightSource = matched.selfWeightKg ? "official" : "none";
          droneProfile.sourceFieldLabel = matched.sourceFieldLabel || "";
          droneProfile.sourceValueText = matched.sourceValueText || "";
          droneProfile.sourceCondition = matched.sourceCondition || "";
          droneProfile.weightDescription = matched.weightDescription || "";
          droneProfile.sourceType = matched.sourceType || "manufacturer";
          droneProfile.sourceName = matched.sourceName;
          droneProfile.sourceUrl = matched.sourceUrl;
          droneProfile.verifiedAt = matched.verifiedAt || "";
          droneProfile.lastReviewedAt = matched.lastReviewedAt || "";
          droneProfile.verificationStatus = matched.verificationStatus;
          droneProfile.hasConditionalWeight = !!matched.hasConditionalWeight;
          droneProfile.conditionalNotice = matched.conditionalNotice || "";
          droneProfile.maxTakeoffWeightConditions = matched.maxTakeoffWeightConditions || [];
        }
      } else {
        // Section 1: 신규 사용자 초기 상태 (모두 빈값 / null / unknown)
        droneProfile.model = "";
        droneProfile.manufacturer = "";
        droneProfile.aircraftWeightKg = null;
        droneProfile.takeoffWeightKg = null;
        droneProfile.maxTakeoffWeightKg = null;
        droneProfile.selfWeightKg = null;
        droneProfile.selfWeightSource = "none";
        droneProfile.qualificationClass = "unknown";
        droneProfile.classificationBasis = "unknown";
        droneProfile.verificationStatus = "unknown";
        droneProfile.sourceType = "unknown";
        droneProfile.sourceName = "";
        droneProfile.sourceUrl = "";
        droneProfile.verifiedAt = "";
        droneProfile.lastReviewedAt = "";
        droneProfile.hasConditionalWeight = false;
        droneProfile.conditionalNotice = "";
        droneProfile.maxTakeoffWeightConditions = [];
      }

      permitProfile.droneModel = droneProfile.model;
      permitProfile.altitude = (saved.altitude !== undefined) ? (Number(saved.altitude) || 50) : 50;
      permitProfile.purpose = saved.purpose || "촬영";
      permitProfile.isAerialPhoto = (saved.isAerialPhoto !== undefined) ? !!saved.isAerialPhoto : true;

      // DOM 요소에 값 반영
      const elModel = document.getElementById("permitDroneModel");
      const elMfr = document.getElementById("permitManufacturer");
      const elWeight = document.getElementById("permitWeightKg");
      const elSelfWeight = document.getElementById("permitSelfWeightKg");
      const elAlt = document.getElementById("permitAltitude");
      const elPurpose = document.getElementById("permitPurpose");
      const elPhoto = document.getElementById("permitAerialPhoto");

      if (elModel) elModel.value = droneProfile.model;
      if (elMfr) elMfr.value = droneProfile.manufacturer;
      if (elWeight) elWeight.value = (droneProfile.maxTakeoffWeightKg !== null) ? droneProfile.maxTakeoffWeightKg : "";
      if (elSelfWeight) elSelfWeight.value = (droneProfile.selfWeightKg !== null) ? droneProfile.selfWeightKg : "";
      if (elAlt) elAlt.value = permitProfile.altitude;
      if (elPurpose) elPurpose.value = permitProfile.purpose;
      if (elPhoto) elPhoto.checked = permitProfile.isAerialPhoto;

      const photoArea = document.getElementById("aerialPhotoDatesArea");
      if (photoArea) {
        photoArea.style.display = permitProfile.isAerialPhoto ? "block" : "none";
      }

      renderDroneProfileUI();

      if (legacyNotice) {
        const noticeBox = document.getElementById("weightLawNotice");
        if (noticeBox) {
          noticeBox.innerText = "※ " + legacyNotice;
          noticeBox.style.color = "#b45309";
        }
      }

      // 비행 예정일 및 촬영 기간 기본값 설정
      const elFlightDate = document.getElementById("permitFlightDate");
      const elPhotoStart = document.getElementById("permitPhotoStartDate");
      const elPhotoEnd = document.getElementById("permitPhotoEndDate");

      const today = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const todayStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());

      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthStr = nextMonth.getFullYear() + "-" + pad(nextMonth.getMonth() + 1) + "-" + pad(nextMonth.getDate());

      if (elFlightDate && !elFlightDate.value) elFlightDate.value = todayStr;
      if (elPhotoStart && !elPhotoStart.value) elPhotoStart.value = todayStr;
      if (elPhotoEnd && !elPhotoEnd.value) elPhotoEnd.value = nextMonthStr;

      updatePermitView();
      updateComprehensiveDiagnosis();
    }

    // 프로필 입력 필드 변경 핸들러
    function onPermitProfileChange() {
      const elAlt = document.getElementById("permitAltitude");
      const elPurpose = document.getElementById("permitPurpose");
      const elPhoto = document.getElementById("permitAerialPhoto");

      permitProfile.altitude = elAlt ? (parseFloat(elAlt.value) || 0) : 50;
      permitProfile.purpose = elPurpose ? elPurpose.value : "촬영";
      permitProfile.isAerialPhoto = elPhoto ? elPhoto.checked : false;

      const photoArea = document.getElementById("aerialPhotoDatesArea");
      if (photoArea) {
        photoArea.style.display = permitProfile.isAerialPhoto ? "block" : "none";
      }

      savePermitProfile();
      updatePermitView();
    }

    function onPermitInputChange() {
      updatePermitView();
    }

    function savePermitProfile() {
      const payload = {
        droneModel: droneProfile.model,
        manufacturer: droneProfile.manufacturer,
        aircraftWeightKg: droneProfile.aircraftWeightKg,
        takeoffWeightKg: droneProfile.takeoffWeightKg,
        maxTakeoffWeightKg: droneProfile.maxTakeoffWeightKg,
        selfWeightKg: droneProfile.selfWeightKg,
        selfWeightSource: droneProfile.selfWeightSource,
        sourceFieldLabel: droneProfile.sourceFieldLabel,
        sourceValueText: droneProfile.sourceValueText,
        sourceCondition: droneProfile.sourceCondition,
        weightDescription: droneProfile.weightDescription,
        sourceType: droneProfile.sourceType,
        sourceName: droneProfile.sourceName,
        sourceUrl: droneProfile.sourceUrl,
        verifiedAt: droneProfile.verifiedAt,
        lastReviewedAt: droneProfile.lastReviewedAt,
        verificationStatus: droneProfile.verificationStatus,
        hasConditionalWeight: droneProfile.hasConditionalWeight,
        conditionalNotice: droneProfile.conditionalNotice,
        maxTakeoffWeightConditions: droneProfile.maxTakeoffWeightConditions,
        altitude: permitProfile.altitude,
        purpose: permitProfile.purpose,
        isAerialPhoto: permitProfile.isAerialPhoto
      };
      safeStorageSet(PERMIT_STORAGE_KEY, payload);
    }

    // ============================================================
    // 11. VWorld 장소/주소 검색 연동 (Section 13, 14, 15 개선)
    // ============================================================
    let currentSearchResults = [];

    async function executeLocationSearch() {
      const input = document.getElementById("searchKeywordInput");
      const statusEl = document.getElementById("searchStatusText");
      const listEl = document.getElementById("searchResultsList");

      if (!input) return;
      const keyword = input.value.trim();
      if (!keyword) {
        showToast("장소명 또는 주소를 입력하세요.");
        input.focus();
        return;
      }
      if (keyword.length < 2) {
        showToast("검색어를 2글자 이상 입력하세요.");
        return;
      }

      if (isSearchingLocation) return;
      isSearchingLocation = true;

      statusEl.style.display = "block";
      statusEl.innerText = '🔍 "' + keyword + '" 검색 중...';
      listEl.innerHTML = "";
      listEl.style.display = "none";

      try {
        let response = await fetch("/api/search?query=" + encodeURIComponent(keyword) + "&type=place");
        let data = await response.json();
        let items = [];

        if (data && data.response && data.response.status === "OK" && data.response.result && data.response.result.items) {
          items = data.response.result.items;
        }

        if (items.length === 0) {
          const addrResp = await fetch("/api/search?query=" + encodeURIComponent(keyword) + "&type=address");
          const addrData = await addrResp.json();
          if (addrData && addrData.response && addrData.response.status === "OK" && addrData.response.result && addrData.response.result.items) {
            items = addrData.response.result.items;
          }
        }

        isSearchingLocation = false;

        if (items.length === 0) {
          statusEl.innerText = '검색 결과가 없습니다: "' + keyword + '"';
          return;
        }

        const topItems = items.slice(0, 5);
        currentSearchResults = topItems.map(item => ({
          title: item.title || keyword,
          displayAddr: item.address?.road || item.address?.parcel || "주소 정보 없음",
          lon: parseFloat(item.point.x),
          lat: parseFloat(item.point.y)
        }));

        statusEl.innerText = "검색 결과 " + topItems.length + "건 (터치하여 위치 선택):";
        listEl.style.display = "flex";

        let html = "";
        currentSearchResults.forEach((item, idx) => {
          html += '<div class="search-item" data-idx="' + idx + '">' +
            '<div class="search-item-name">📍 ' + escapeHtml(item.title) + '</div>' +
            '<div class="search-item-addr">' + escapeHtml(item.displayAddr) + '</div>' +
          '</div>';
        });
        listEl.innerHTML = html;

        listEl.onclick = (e) => {
          const itemEl = e.target.closest('.search-item');
          if (!itemEl) return;
          const idx = parseInt(itemEl.dataset.idx, 10);
          const target = currentSearchResults[idx];
          if (target) {
            selectSearchResult(target.lat, target.lon, target.title, target.displayAddr);
          }
        };

      } catch (err) {
        isSearchingLocation = false;
        console.error("[Search Error]", err);
        statusEl.innerText = "⚠️ 검색 요청 중 오류가 발생했습니다. 다시 시도하세요.";
      }
    }

    // Section 13: 문자열 비교로 장소 규칙 자동 확정 금지 (좌표 반경 기반으로 후보 탐지)
    function selectSearchResult(lat, lon, title, address) {
      const listEl = document.getElementById("searchResultsList");
      const statusEl = document.getElementById("searchStatusText");
      if (listEl) listEl.style.display = "none";
      if (statusEl) statusEl.innerText = "선택된 장소: " + title;

      const input = document.getElementById("searchKeywordInput");
      if (input) input.value = title;

      // 장소 규칙은 거리 기반 후보 감지 후 사용자 확인으로만 확정하도록 초기화
      selectedFilmingSite = null;

      setLocation(lat, lon, "search", {
        placeName: title,
        address: address,
        title: "🔍 " + title
      });

      showToast('📍 "' + title + '" 위치가 선택되었습니다.');
    }

    // ============================================================
    // 12. 등록된 촬영장소 후보 탐지 (checkCandidateFilmingSites)
    // ============================================================
    // Section 12: 이전 장소 상태 stale 방지
    function checkCandidateFilmingSites(lat, lon) {
      const banner = document.getElementById("candidateBanner");
      const nameEl = document.getElementById("candidateSiteName");
      const distEl = document.getElementById("candidateSiteDist");

      if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        if (banner) banner.style.display = "none";
        candidateFilmingSite = null;
        selectedFilmingSite = null;
        return;
      }

      // 새 위치가 기존 선택 장소 반경 밖이면 selectedFilmingSite 초기화
      if (selectedFilmingSite) {
        const distFromSelectedKm = getDistanceKm(lat, lon, selectedFilmingSite.latitude, selectedFilmingSite.longitude);
        const distFromSelectedM = distFromSelectedKm * 1000;
        if (distFromSelectedM > selectedFilmingSite.detectionRadius) {
          selectedFilmingSite = null;
        }
      }

      let closest = null;
      let minDistanceM = Infinity;

      filmingSiteRules.forEach(site => {
        const distKm = getDistanceKm(lat, lon, site.latitude, site.longitude);
        const distM = distKm * 1000;
        if (distM <= site.detectionRadius && distM < minDistanceM) {
          minDistanceM = distM;
          closest = site;
        }
      });

      if (closest) {
        candidateFilmingSite = { site: closest, dist: minDistanceM };
        if (banner && nameEl && distEl) {
          nameEl.innerText = closest.name;
          distEl.innerText = Math.round(minDistanceM);
          banner.style.display = "flex";
        }
      } else {
        candidateFilmingSite = null;
        if (banner) banner.style.display = "none";
      }

      renderFilmingSiteDetails();
    }

    // 사용자가 후보 배너에서 [장소 확인]을 누른 경우에만 확정
    function applyCandidateSite() {
      if (!candidateFilmingSite) return;
      selectedFilmingSite = candidateFilmingSite.site;

      const banner = document.getElementById("candidateBanner");
      if (banner) banner.style.display = "none";

      locationState.placeName = selectedFilmingSite.name;
      locationState.address = selectedFilmingSite.address;

      renderFilmingSiteDetails();
      updatePermitView();
      showToast('🏛️ ' + selectedFilmingSite.name + ' 시설 규정이 적용되었습니다.');
    }

    // ============================================================
    // 13. 촬영장소 기관 및 서류 안내 UI 렌더링
    // ============================================================
    function renderFilmingSiteDetails() {
      const siteBadge = document.getElementById("siteStatusBadge");
      const emptyNotice = document.getElementById("siteEmptyNotice");
      const activeBox = document.getElementById("siteActiveBox");

      if (!siteBadge || !emptyNotice || !activeBox) return;

      if (!selectedFilmingSite) {
        siteBadge.innerText = candidateFilmingSite ? "후보 감지됨 (확인 필요)" : "장소 확인 대기";
        siteBadge.style.background = candidateFilmingSite ? "#fef3c7" : "#f1f5f9";
        siteBadge.style.color = candidateFilmingSite ? "#b45309" : "#475569";
        emptyNotice.style.display = "block";
        activeBox.style.display = "none";
        return;
      }

      const site = selectedFilmingSite;
      siteBadge.innerText = '🏛️ ' + site.name + ' 확인됨';
      siteBadge.style.background = "#d1fae5";
      siteBadge.style.color = "#065f46";

      emptyNotice.style.display = "none";
      activeBox.style.display = "block";

      document.getElementById("siteBoxName").innerText = site.name + " 시설 촬영 정보";
      document.getElementById("siteBoxPermission").innerText = site.institutionPermission;
      document.getElementById("siteBoxDept").innerText = site.department || "담당 부서 문의";
      document.getElementById("siteBoxContact").innerText = site.tel || "유선 문의 필요";
      document.getElementById("siteBoxEmail").innerText = site.email || "🟡 기관 사전 문의 필요 (공식 이메일 미확인)";
      document.getElementById("siteBoxDeadline").innerText = site.deadline || "기관 사전 확인 필요";

      const btnCall = document.getElementById("btnCallAuth");
      if (btnCall) {
        if (site.tel) {
          btnCall.href = "tel:" + site.tel.replace(/[^0-9]/g, '');
          btnCall.style.display = "inline-flex";
        } else {
          btnCall.style.display = "none";
        }
      }

      const btnUrl = document.getElementById("btnUrlAuth");
      if (btnUrl) {
        btnUrl.href = site.officialUrl || "#";
      }

      const inquiryBox = document.getElementById("inquiryPreviewBox");
      if (inquiryBox) {
        inquiryBox.innerText = generateInquiryQuestions(site);
      }

      renderDocumentRequirements(site.documents || []);

      const footer = document.getElementById("siteMetaFooter");
      if (footer) {
        footer.innerText = "출처: " + site.source + " · 확인일: " + site.verifiedAt;
      }
    }

    function generateInquiryQuestions(site) {
      const sName = site ? site.name : (locationState.placeName || "촬영 예정 시설");
      return "[" + sName + " 드론 비행 및 촬영 관련 사전 문의사항]\n" +
"1. 드론 비행 및 촬영 가능 여부\n" +
"2. 별도 시설 촬영허가 필요 여부\n" +
"3. 필요한 신청서 및 서약서 양식\n" +
"4. 제출방법 (이메일/공문/현장접수 등)\n" +
"5. 신청기한 (촬영 며칠 전까지 접수해야 하는지)\n" +
"6. 장소사용료 및 부대비용 발생 여부\n" +
"7. 드론원스톱 비행·촬영승인 외 별도 협의 필요 여부";
    }

    function copyInquiryText() {
      const text = generateInquiryQuestions(selectedFilmingSite);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showToast("📋 7대 기관 문의사항이 복사되었습니다.");
        }).catch(() => {
          fallbackCopyText(text);
        });
      } else {
        fallbackCopyText(text);
      }
    }

    function handleAuthEmailAction() {
      if (!selectedFilmingSite || !selectedFilmingSite.email) {
        showToast("🟡 공식 이메일 주소가 확인되지 않았습니다. 기관 대표 전화로 문의하세요.");
        return;
      }
      const email = selectedFilmingSite.email;
      const subject = encodeURIComponent("[드론 촬영 문의] " + selectedFilmingSite.name + " 드론 비행 및 촬영 절차 확인 요청");
      const body = encodeURIComponent(generateInquiryQuestions(selectedFilmingSite));
      window.location.href = "mailto:" + email + "?subject=" + subject + "&body=" + body;
      showToast("✉ 이메일 작성 창이 열렸습니다 (" + email + ")");
    }

    function renderDocumentRequirements(docs) {
      const container = document.getElementById("documentRequirementsList");
      if (!container) return;

      if (!docs || docs.length === 0) {
        container.innerHTML = '<div style="font-size:11px; color:var(--muted); padding:4px 0;">등록된 지정 서류가 없습니다. 기관에 문의하세요.</div>';
        return;
      }

      let html = "";
      docs.forEach(doc => {
        let badgeClass = "status-none";
        let badgeText = "⚪ 정보 없음";

        if (doc.requiredStatus === "확인됨") {
          badgeClass = "status-confirmed";
          badgeText = "🟢 확인됨";
        } else if (doc.requiredStatus === "해당 시") {
          badgeClass = "status-conditional";
          badgeText = "🟡 해당 시";
        } else if (doc.requiredStatus === "기관 문의") {
          badgeClass = "status-inquiry";
          badgeText = "🔵 기관 문의";
        } else if (doc.requiredStatus === "기관 확인 필요") {
          badgeClass = "status-conditional";
          badgeText = "🟡 기관 확인 필요";
        }

        html += '<div class="doc-item">' +
          '<div>' +
            '<div style="font-weight:700; color:var(--text);">' + escapeHtml(doc.name) + '</div>' +
            '<div style="font-size:11px; color:var(--muted);">지원 형식: ' + escapeHtml(doc.formats) + ' · <a href="' + escapeHtml(doc.sourceUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:none;">공식 페이지</a></div>' +
          '</div>' +
          '<span class="doc-status-badge ' + badgeClass + '">' + badgeText + '</span>' +
        '</div>';
      });
      container.innerHTML = html;
    }

    // ============================================================
    // 14. 사용자 서류 파일 등록 (Section 16: 확장자 검증, Section 17: XSS 방지)
    // ============================================================
    const ALLOWED_DOCUMENT_EXTS = [".pdf", ".jpg", ".jpeg", ".png", ".hwp"];

    function handleUserFilesUpload(event) {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const MAX_TOTAL_FILES = 5;
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      let addedCount = 0;

      for (let i = 0; i < files.length; i++) {
        if (userDocuments.length >= MAX_TOTAL_FILES) {
          showToast("⚠️ 서류 파일은 최대 " + MAX_TOTAL_FILES + "개까지만 등록 가능합니다.");
          break;
        }

        const file = files[i];
        const extMatch = file.name.match(/\.[^.]+$/);
        const ext = extMatch ? extMatch[0].toLowerCase() : "";

        // Section 16: 확장자 검증
        if (!ALLOWED_DOCUMENT_EXTS.includes(ext)) {
          showToast('⚠️ "' + file.name + '": 허용되지 않는 파일 형식입니다. (.pdf, .jpg, .jpeg, .png, .hwp 만 허용)');
          continue;
        }

        // Section 16: 파일 크기 10MB 이하
        if (file.size > MAX_SIZE) {
          showToast('⚠️ "' + file.name + '" 크기가 10MB를 초과하여 제외되었습니다.');
          continue;
        }

        let previewUrl = null;
        if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".pdf") {
          try {
            previewUrl = URL.createObjectURL(file);
          } catch (e) {
            console.warn("createObjectURL error:", e);
          }
        }

        userDocuments.push({
          id: "doc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
          fileName: file.name,
          size: (file.size / 1024).toFixed(1) + " KB",
          type: ext,
          previewUrl: previewUrl,
          addedAt: new Date().toLocaleTimeString()
        });
        addedCount++;
      }

      event.target.value = "";
      renderUserFilesList();

      if (addedCount > 0) {
        showToast("📎 서류 파일 " + addedCount + "건이 등록되었습니다. (서버 미전송 / 현재 세션 유지)");
        updatePermitView();
      }
    }

    function removeUserFile(docId) {
      const idx = userDocuments.findIndex(d => d.id === docId);
      if (idx !== -1) {
        if (userDocuments[idx].previewUrl) {
          try { URL.revokeObjectURL(userDocuments[idx].previewUrl); } catch (e) {}
        }
        userDocuments.splice(idx, 1);
        renderUserFilesList();
        updatePermitView();
        showToast("서류 파일이 목록에서 제거되었습니다.");
      }
    }

    function previewUserFile(docId) {
      const doc = userDocuments.find(d => d.id === docId);
      if (doc && doc.previewUrl) {
        window.open(doc.previewUrl, "_blank");
      } else {
        showToast("HWP 파일은 브라우저 미리보기를 지원하지 않습니다.");
      }
    }

    function renderUserFilesList() {
      const container = document.getElementById("userFilesList");
      if (!container) return;

      if (userDocuments.length === 0) {
        container.innerHTML = '<div style="font-size:11px; color:var(--muted); text-align:center; padding:4px 0;">등록된 서류 파일이 없습니다.</div>';
        return;
      }

      let html = "";
      userDocuments.forEach(doc => {
        let icon = "📄";
        if (doc.type === ".pdf") icon = "📕";
        else if (doc.type === ".png" || doc.type === ".jpg" || doc.type === ".jpeg") icon = "🖼️";
        else if (doc.type === ".hwp") icon = "📝";

        // Section 17: 파일명 XSS 방지 (escapeHtml 적용)
        html += '<div class="user-file-item">' +
          '<div class="user-file-info">' +
            '<div class="user-file-thumb">' + icon + '</div>' +
            '<div>' +
              '<div class="user-file-name" title="' + escapeHtml(doc.fileName) + '">' + escapeHtml(doc.fileName) + '</div>' +
              '<div class="user-file-size">' + escapeHtml(doc.size) + ' · 등록: ' + escapeHtml(doc.addedAt) + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display: flex; gap: 4px; align-items: center;">' +
            (doc.previewUrl ? '<button type="button" class="btn-secondary btn-sm btn-preview-doc" data-id="' + escapeHtml(doc.id) + '">미리보기</button>' : '') +
            '<button type="button" class="btn-secondary btn-sm btn-remove-doc" style="color:var(--danger); border-color:#fecaca;" data-id="' + escapeHtml(doc.id) + '">삭제</button>' +
          '</div>' +
        '</div>';
      });
      container.innerHTML = html;

      // Section 15: 이벤트 위임 처리
      container.onclick = (e) => {
        const previewBtn = e.target.closest('.btn-preview-doc');
        if (previewBtn) {
          previewUserFile(previewBtn.dataset.id);
          return;
        }
        const removeBtn = e.target.closest('.btn-remove-doc');
        if (removeBtn) {
          removeUserFile(removeBtn.dataset.id);
          return;
        }
      };
    }

    // ============================================================
    // 15. 승인준비 전용 GPS 갱신 함수
    // ============================================================
    function fetchGpsForPermit() {
      if (isGpsMeasuring) {
        showToast("📍 이미 정밀 위치 측정이 진행 중입니다.");
        return;
      }
      isGpsMeasuring = true;
      showToast("📍 현재 GPS 위치를 측정 중입니다...");

      requestPreciseLocation({
        onProgress: (bestSample, count, elapsedSec) => {},
        onSuccess: (bestSample) => {
          isGpsMeasuring = false;
          setLocation(bestSample.latitude, bestSample.longitude, "gps", {
            accuracy: bestSample.accuracy,
            title: "현재 GPS 위치"
          });
          showToast("✅ GPS 위치가 승인준비에 반영되었습니다.");
        },
        onError: (err) => {
          isGpsMeasuring = false;
          showToast("⚠️ GPS 위치 획득 실패: " + (err.message || '권한 거부 또는 측정 불가'));
        }
      });
    }

    // ============================================================
    // 16. 승인준비 뷰 종합 렌더링
    // ============================================================
    function updatePermitView() {
      const badgeLoc = document.getElementById("permitLocModeBadge");
      const textPlace = document.getElementById("permitPlaceNameText");
      const textCoord = document.getElementById("permitLocCoordText");
      const textAddr = document.getElementById("permitLocAddressText");

      const hasLoc = (locationState.latitude !== null && locationState.longitude !== null);
      const lat = hasLoc ? locationState.latitude : null;
      const lon = hasLoc ? locationState.longitude : null;

      let modeName = "위치 미확인";
      if (locationState.source === "gps") modeName = "📍 GPS 현재 위치";
      else if (locationState.source === "search") modeName = "🔍 장소 검색";
      else if (locationState.source === "map") modeName = "📌 지도 직접 선택";
      else if (locationState.source === "preset") modeName = "🧭 지역 프리셋";
      else if (locationState.source === "manual") modeName = "🧭 수동 좌표";

      if (badgeLoc) {
        badgeLoc.innerText = modeName;
        badgeLoc.style.background = hasLoc ? "#d1fae5" : "#f1f5f9";
        badgeLoc.style.color = hasLoc ? "#065f46" : "#475569";
      }

      if (textPlace) {
        textPlace.innerText = locationState.placeName ? ("장소명: " + locationState.placeName) : (hasLoc ? "장소명: (지정된 좌표)" : "장소명: -");
      }
      if (textCoord) {
        textCoord.innerText = hasLoc ? ("위도: " + lat.toFixed(6) + ", 경도: " + lon.toFixed(6)) : "위도: -, 경도: -";
      }
      if (textAddr) {
        if (locationState.address) {
          textAddr.innerText = "주소: " + locationState.address;
        } else if (hasLoc) {
          const accStr = (locationState.source === "gps" && locationState.accuracy) ? (" (오차 약 ±" + Math.round(locationState.accuracy) + "m)") : "";
          textAddr.innerText = "확인 방식: " + modeName + accStr;
        } else {
          textAddr.innerText = "장소를 검색하거나 GPS 또는 지도를 이용해 위치를 지정하세요.";
        }
      }

      renderFilmingSiteDetails();
      renderComprehensiveReview();
    }

    // ============================================================
    // 17. 6단계 종합 검토 결과 렌더링 (Section 18, 19, 20, 21 정밀 준수)
    // ============================================================
    function renderComprehensiveReview() {
      const container = document.getElementById("permitComprehensiveReviewList");
      if (!container) return;

      const hasLoc = (locationState.latitude !== null && locationState.longitude !== null);
      const altitude = permitProfile.altitude || 50;
      const isAerial = permitProfile.isAerialPhoto;
      const mtow = droneProfile.maxTakeoffWeightKg;
      const sw = droneProfile.selfWeightKg;
      const qClass = calculateQualificationClass(mtow, sw, droneProfile.verificationStatus, droneProfile.hasConditionalWeight);

      const items = [];

      // ① 공역 확인 (5개 레이어)
      const resProhibited = airspaceState.results ? airspaceState.results["prohibited"] : null;
      const resTemporary = airspaceState.results ? airspaceState.results["temporary"] : null;
      const resRestricted = airspaceState.results ? airspaceState.results["restricted"] : null;
      const resControl = airspaceState.results ? airspaceState.results["control"] : null;
      const resUac = airspaceState.results ? airspaceState.results["uac"] : null;

      if (!hasLoc) {
        items.push({
          step: "① 공역 확인",
          type: "neutral",
          title: "비행 위치 확인 필요",
          desc: "위치가 지정되지 않아 공역 공간 판정을 진행할 수 없습니다. 상단에서 장소를 검색하거나 GPS를 누르세요."
        });
      } else if (airspaceState.partialFailure) {
        items.push({
          step: "① 공역 확인",
          type: "warning",
          title: "일부 공역 데이터 조회 실패",
          desc: "공역 데이터 [" + (airspaceState.failedLayers || []).join(', ') + "] 수신에 실패했습니다. 최신 제한 여부는 드론원스톱에서 공식 확인하세요."
        });
      } else {
        const detected = [];
        if (resProhibited && resProhibited.isIncluded) detected.push("비행금지구역(P)");
        if (resTemporary && resTemporary.isIncluded) detected.push("임시비행금지공역");
        if (resRestricted && resRestricted.isIncluded) detected.push("비행제한구역(R)");
        if (resControl && resControl.isIncluded) detected.push("관제권");
        if (resUac && resUac.isIncluded) detected.push("초경량비행장치공역(UAC)");

        if (detected.length > 0) {
          const isDanger = (resProhibited?.isIncluded || resTemporary?.isIncluded);
          items.push({
            step: "① 공역 확인",
            type: isDanger ? "danger" : "warning",
            title: isDanger ? "🔴 제한·금지공역 포함 (사전 승인 확인 필요)" : "🟡 관제권·제한공역 포함 (비행승인 확인 필요)",
            desc: "현재 위치에서 [" + detected.join(', ') + "] 공역이 검출되었습니다. 해당 관할 지방항공청 또는 군부대 승인 대상 여부를 확인하세요."
          });
        } else {
          // Section 21: 공역 결과 표현 재점검 (참고용 안내 유지)
          items.push({
            step: "① 공역 확인",
            type: "info",
            title: "🟢 주요 5대 제한공역 미검출 (참고용 - 드론원스톱 최종 확인)",
            desc: "현재 VWorld 5대 공역 기준 주요 제한구역은 미검출되었습니다. (참고용 안내이며, 전체 항공·군사·시설·지자체 규정을 모두 포함하지 않을 수 있으므로 비행 전 공식 드론원스톱에서 최종 확인하세요.)"
          });
        }
      }

      // ② 비행 조건 확인 (Section 18: 150m 문구, Section 19: 야간/비가시권 문구, Section 20: '충족' 표현 제거)
      const condWarnings = [];

      if (altitude >= 150) {
        condWarnings.push("예정 비행 고도(" + altitude + "m): 150m 이상 비행 시 비행승인 대상 여부 확인 필요");
      }
      if (!droneProfile.model) {
        condWarnings.push("기체 미지정: 승인준비 탭에서 기체 검색 또는 입력 필요");
      } else if (mtow === null) {
        condWarnings.push("최대이륙중량(MTOW) 미확인: 조종자 증명 분류 확인 필요");
      } else if (mtow > 25) {
        condWarnings.push("최대이륙중량(" + mtow + "kg) 25kg 초과: 1종 여부 확인 및 자체중량 조건(" + (sw !== null ? sw + 'kg' : '미확인') + ") 확인, 안전성인증 및 비행승인 대상 여부 확인 필요");
      }

      if (droneProfile.hasConditionalWeight && droneProfile.conditionalNotice) {
        condWarnings.push("기체 조건: " + droneProfile.conditionalNotice);
      }

      const nightVLOSNotice = "야간 또는 육안으로 확인할 수 없는 범위에서 비행하려면 특별비행승인 여부를 확인하세요. (항공안전법 시행규칙 제312조의2)";

      if (condWarnings.length > 0 || !qClass.isConfirmed) {
        items.push({
          step: "② 비행 조건 확인",
          type: "warning",
          title: "⚠️ 현재 입력조건 기준 확인사항",
          desc: condWarnings.join(" / ") + " · 분류 안내: " + qClass.name + " (" + qClass.rangeText + ") · " + nightVLOSNotice
        });
      } else {
        items.push({
          step: "② 비행 조건 확인",
          type: "info",
          title: "ℹ️ 현재 입력조건 기준 확인사항 (" + qClass.name + ")",
          desc: "고도 " + altitude + "m, 최대이륙중량 " + (mtow !== null ? mtow + 'kg' : '미확인') + " (" + qClass.rangeText + ") 조건입니다. (" + nightVLOSNotice + ")"
        });
      }

      // ③ 항공촬영 확인
      if (isAerial) {
        const photoStart = document.getElementById("permitPhotoStartDate")?.value || "시작일";
        const photoEnd = document.getElementById("permitPhotoEndDate")?.value || "종료일";
        items.push({
          step: "③ 항공촬영 확인",
          type: "warning",
          title: "⚠️ 항공촬영 신청 확인 필요 (근무일 기준 4일 전)",
          desc: "개활지 등 촬영금지시설이 명백히 없는 경우를 제외하고 국가보안시설 촬영 여부 확인을 위해 국방부 항공촬영 허가 신청이 필요할 수 있습니다. (신청 예정기간: " + photoStart + " ~ " + photoEnd + ")"
        });
      } else {
        items.push({
          step: "③ 항공촬영 확인",
          type: "neutral",
          title: "📷 항공촬영 미선택 (단순 비행)",
          desc: "촬영 장치를 사용하지 않는 일반 비행으로 설정되었습니다."
        });
      }

      // ④ 촬영장소 확인
      if (selectedFilmingSite) {
        items.push({
          step: "④ 촬영장소 확인",
          type: "warning",
          title: "🏛️ " + selectedFilmingSite.name + " 시설 규정 확인 필요",
          desc: selectedFilmingSite.institutionPermission + ": " + selectedFilmingSite.notes
        });
      } else {
        items.push({
          step: "④ 촬영장소 확인",
          type: "neutral",
          title: "📍 일반 장소 (개별 시설물 규정 확인 권장)",
          desc: "별도 등록된 공공 기념시설 외 일반 토지/시설물의 경우 해당 소유자 및 관리주체의 이용 규정을 사전 확인하세요."
        });
      }

      // ⑤ 기관 확인
      if (selectedFilmingSite) {
        const contactStr = selectedFilmingSite.tel ? ("전화: " + selectedFilmingSite.tel) : "유선 문의 필요";
        const emailStr = selectedFilmingSite.email ? ("이메일: " + selectedFilmingSite.email) : "이메일 미확인";
        items.push({
          step: "⑤ 기관 확인",
          type: "info",
          title: "🏢 담당기관: " + selectedFilmingSite.name + " (" + (selectedFilmingSite.department || '관리부서') + ")",
          desc: contactStr + " · " + emailStr + " (드론원스톱 공역 승인과 별도로 시설관리부서와 협의)"
        });
      } else {
        items.push({
          step: "⑤ 기관 확인",
          type: "info",
          title: "🏢 정부 포털: 국토교통부 지방항공청 및 국방부",
          desc: "드론원스톱(drone.onestop.go.kr)을 통해 비행승인 및 항공촬영 허가를 일괄 접수할 수 있습니다."
        });
      }

      // ⑥ 준비서류 확인
      const docCount = userDocuments.length;
      if (selectedFilmingSite) {
        items.push({
          step: "⑥ 준비서류 확인",
          type: docCount > 0 ? "info" : "warning",
          title: "📁 시설 신청 서류 준비 (" + docCount + "개 등록됨)",
          desc: "필수 제출 서류 목록(신청서/서약서 등)을 확인하고 파일을 등록하세요. (등록된 서류: " + docCount + "건)"
        });
      } else {
        items.push({
          step: "⑥ 준비서류 확인",
          type: "neutral",
          title: "📁 준비서류 (" + docCount + "개 등록됨)",
          desc: "기체 제원표, 조종자 증명서, 비행계획서 등 필요 서류를 등록하여 일괄 관리할 수 있습니다."
        });
      }

      // HTML 렌더링 (Section 14: escapeHtml 적용)
      let html = "";
      items.forEach(it => {
        html += '<div class="review-item review-' + it.type + '">' +
          '<div class="review-title">' +
            '<span>' + escapeHtml(it.step) + ':</span> ' + escapeHtml(it.title) +
          '</div>' +
          '<div>' + escapeHtml(it.desc) + '</div>' +
        '</div>';
      });
      container.innerHTML = html;
    }

    // ============================================================
    // 18. 신청 준비정보 복사 (Section 22 완벽 준수)
    // ============================================================
    function copyPermitInfo() {
      const lat = (locationState.latitude !== null) ? locationState.latitude.toFixed(6) : "미확인";
      const lon = (locationState.longitude !== null) ? locationState.longitude.toFixed(6) : "미확인";
      const placeName = locationState.placeName || "미확인";
      const address = locationState.address || "미확인";

      let modeName = "미확인";
      if (locationState.source === "gps") modeName = "GPS 현재 위치";
      else if (locationState.source === "search") modeName = "장소 검색";
      else if (locationState.source === "map" || locationState.source === "map_click") modeName = "지도 직접 선택";
      else if (locationState.source === "preset") modeName = "지역 프리셋";
      else if (locationState.source === "manual") modeName = "수동 좌표 입력";

      const flightDate = document.getElementById("permitFlightDate")?.value || "미확인";
      const startTime = document.getElementById("permitStartTime")?.value || "미확인";
      const endTime = document.getElementById("permitEndTime")?.value || "미확인";

      const isAerial = permitProfile.isAerialPhoto;
      const photoStart = document.getElementById("permitPhotoStartDate")?.value || "미확인";
      const photoEnd = document.getElementById("permitPhotoEndDate")?.value || "미확인";

      const mfr = droneProfile.manufacturer || "미확인";
      const model = droneProfile.model || "미확인";
      const sourceField = droneProfile.sourceFieldLabel || "미확인";
      const sourceVal = droneProfile.sourceValueText || "미확인";
      const sourceCond = droneProfile.sourceCondition || "미확인";
      const acw = (droneProfile.aircraftWeightKg !== null) ? (droneProfile.aircraftWeightKg + "kg") : "미확인";
      const tow = (droneProfile.takeoffWeightKg !== null) ? (droneProfile.takeoffWeightKg + "kg") : "미확인";
      const mtow = (droneProfile.maxTakeoffWeightKg !== null) ? (droneProfile.maxTakeoffWeightKg + "kg") : "미확인";
      const selfWeight = (droneProfile.selfWeightKg !== null) ? (droneProfile.selfWeightKg + "kg") : "미확인";

      const qClass = calculateQualificationClass(droneProfile.maxTakeoffWeightKg, droneProfile.selfWeightKg, droneProfile.verificationStatus, droneProfile.hasConditionalWeight);
      const qCode = qClass.code || "unknown";
      const qBasis = qClass.classificationBasis || "unknown";
      const vStatus = droneProfile.verificationStatus || "unknown";

      const altitude = permitProfile.altitude ? (permitProfile.altitude + "m") : "미확인";
      const purpose = permitProfile.purpose || "미확인";

      const airspaceLines = [];
      AIRSPACE_LAYERS.forEach(l => {
        const r = airspaceState.results ? airspaceState.results[l.key] : null;
        const inc = r ? r.isIncluded : false;
        const cnt = r ? (r.matchedCount || 0) : 0;
        const fetchSuccess = r ? r.fetchSuccess : airspaceState.loaded;
        if (!fetchSuccess) {
          airspaceLines.push("- " + l.name + ": 조회 실패 (드론원스톱 공식 확인 필요)");
        } else {
          airspaceLines.push("- " + l.name + ": " + (inc ? ("포함 (" + cnt + "개 구역 검출 - 승인 대상 여부 확인 필요)") : "미포함 (주요 제한 미검출)"));
        }
      });

      let filmingInst = "미확인 (일반 장소 / 사전 협의 권장)";
      let filmingDept = "미확인";
      let filmingTel = "미확인";
      let filmingEmail = "미확인";
      if (selectedFilmingSite) {
        filmingInst = selectedFilmingSite.name || selectedFilmingSite.institutionName || "미확인";
        filmingDept = selectedFilmingSite.department || "미확인";
        filmingTel = selectedFilmingSite.tel || selectedFilmingSite.phone || "미확인";
        filmingEmail = selectedFilmingSite.email || "미확인";
      }

      const docLines = [];
      if (selectedFilmingSite && selectedFilmingSite.documents) {
        selectedFilmingSite.documents.forEach(d => {
          docLines.push("- " + d.name + " (" + (d.requiredStatus || '미확인') + ")");
        });
      }
      docLines.push("- 사용자 등록 서류: " + userDocuments.length + "건 (" + (userDocuments.map(d => d.fileName).join(", ") || "없음") + ")");

      const inquiryQuestionsText = generateInquiryQuestions(selectedFilmingSite);

      const copyText = "[드론 비행·촬영 신청 준비정보]\n\n" +
"장소: " + placeName + "\n" +
"주소: " + address + "\n" +
"좌표: 위도 " + lat + ", 경도 " + lon + "\n" +
"위치 출처: " + modeName + "\n\n" +
"비행일: " + flightDate + "\n" +
"시간: " + startTime + " ~ " + endTime + "\n" +
"고도: " + altitude + "\n\n" +
"기체 및 자격분류 정보:\n" +
"- 제조사: " + mfr + "\n" +
"- 모델: " + model + "\n" +
"- 공식 표기 항목(sourceFieldLabel): " + sourceField + "\n" +
"- 공식 표기 원문(sourceValueText): " + sourceVal + "\n" +
"- 표기 조건(sourceCondition): " + sourceCond + "\n" +
"- 기체 중량(aircraftWeightKg): " + acw + "\n" +
"- 이륙 중량(takeoffWeightKg): " + tow + "\n" +
"- 최대이륙중량(maxTakeoffWeightKg): " + mtow + "\n" +
"- 자체중량(selfWeightKg): " + selfWeight + "\n" +
"- 조종자 증명 자격코드(qualificationClass): " + qCode + "\n" +
"- 조종자 증명 분류명: " + qClass.name + " (" + qClass.rangeText + ")\n" +
"- 자격 분류 근거(classificationBasis): " + qBasis + "\n" +
"- 검증 상태(verificationStatus): " + vStatus + "\n" +
"- 제원 출처: " + (droneProfile.sourceName || '미확인') + "\n" +
"- 출처 URL: " + (droneProfile.sourceUrl || '미확인') + "\n" +
"- 공식 검증일: " + (droneProfile.verifiedAt || '미확인') + "\n" +
"- 최근 검토일: " + (droneProfile.lastReviewedAt || '미확인') + "\n" +
(droneProfile.hasConditionalWeight ? ("중량 조건 안내: " + droneProfile.conditionalNotice + "\n") : "") +
"비행 목적: " + purpose + "\n" +
"항공촬영 여부: " + (isAerial ? ("신청 준비 (예정기간: " + photoStart + " ~ " + photoEnd + ")") : "미촬영 (단순 비행)") + "\n\n" +
"공역:\n" +
airspaceLines.join("\n") + "\n" +
"공역 조회 시각: " + (airspaceState.lastFetchedAt ? new Date(airspaceState.lastFetchedAt).toLocaleString() : '미확인') + "\n\n" +
"시설 촬영허가:\n" +
"기관: " + filmingInst + "\n" +
"담당부서: " + filmingDept + "\n" +
"전화: " + filmingTel + "\n" +
"이메일: " + filmingEmail + "\n\n" +
"준비서류:\n" +
docLines.join("\n") + "\n\n" +
"문의사항:\n" +
inquiryQuestionsText + "\n\n" +
"※ 본 내용은 신청 준비를 위한 참고 정보이며\n" +
"실제 신청 대상·허가·승인 여부는\n" +
"공식 기관 및 드론원스톱에서 최종 확인해야 합니다.";

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).then(() => {
          showToast("📋 신청 준비정보가 클립보드에 복사되었습니다.");
        }).catch(() => {
          fallbackCopyText(copyText);
        });
      } else {
        fallbackCopyText(copyText);
      }
    }

    function fallbackCopyText(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast("📋 신청 준비정보가 클립보드에 복사되었습니다.");
      } catch (err) {
        showToast("⚠️ 클립보드 복사에 실패했습니다.");
      }
      document.body.removeChild(ta);
    }

    // 19. 앱 시작 경량 초기화 (자동 WFS/Weather 호출 배제)
    // ============================================================
    window.addEventListener("DOMContentLoaded", () => {
      // 1. 체크리스트 초기화 (localStorage)
      initChecklist();

      // 2. 승인준비 프로필 초기화 (localStorage)
      initPermitProfile();

      // 3. UI 시계 및 기본 상태 표출
      const headerStatus = document.getElementById("headerStatus");
      if (headerStatus) {
        headerStatus.innerText = "🟢 정상 작동 중";
      }

      console.log("[App] 초기화 완료 (사용자 위치 선택 대기)");
    });
  

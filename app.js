/****************************************************************
 * ShoeTracker (Web) — บันทึกระยะทางวิ่งแยกตามรองเท้า
 * ข้อมูลเก็บใน localStorage ของเบราว์เซอร์ (ไม่มีเซิร์ฟเวอร์ของตัวเอง)
 * รองรับเชื่อมต่อ Strava ผ่าน Google Apps Script proxy (ดู README)
 ****************************************************************/

/* แก้ไข 2 ค่านี้ก่อนใช้ฟีเจอร์ Strava (ไม่จำเป็นสำหรับการบันทึกรองเท้า/การวิ่งด้วยมือ) */
const CONFIG = {
  STRAVA_CLIENT_ID: "PASTE_YOUR_STRAVA_CLIENT_ID",
  STRAVA_PROXY_ENDPOINT: "PASTE_YOUR_APPS_SCRIPT_PROXY_URL",
};

const STORAGE_KEY = "shoetracker_data_v1";
const STRAVA_TOKEN_KEY = "shoetracker_strava_tokens_v1";
const SYNC_ENDPOINT_KEY = "shoetracker_sync_endpoint";
const SYNC_CODE_KEY = "shoetracker_sync_code";
const SYNC_LAST_KEY = "shoetracker_sync_last";

let cloudPushTimer = null;
let suppressCloudPush = false; // กันไม่ให้ตอน "ดึงจากคลาวด์" แล้วเซฟ ไปสั่งสำรองซ้ำทันที

/* ---------------------------------------------------------------
 * ชั้นข้อมูล (localStorage)
 * ------------------------------------------------------------- */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { shoes: [], runs: [] };
    const parsed = JSON.parse(raw);
    return { shoes: parsed.shoes || [], runs: parsed.runs || [] };
  } catch (e) {
    return { shoes: [], runs: [] };
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    scheduleCloudPush();
    return true;
  } catch (e) {
    alert(
      "บันทึกไม่สำเร็จ: พื้นที่จัดเก็บในเบราว์เซอร์เต็ม " +
        "(มักเกิดจากรูปภาพขนาดใหญ่หรือมีหลายรูป) ลองลบรูปบางรูปหรือข้อมูลเก่าออกแล้วลองใหม่"
    );
    return false;
  }
}

/* ย่อรูปด้วย canvas ก่อนเก็บ เพื่อไม่ให้ localStorage เต็มเร็ว */
function resizeImageToDataURL(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("ไฟล์รูปไม่ถูกต้อง"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height >= width && height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function totalDistance(shoe) {
  const runs = state.data.runs.filter((r) => r.shoeId === shoe.id);
  const sum = runs.reduce((acc, r) => acc + (Number(r.distanceKm) || 0), 0);
  return (Number(shoe.startingDistanceKm) || 0) + sum;
}

function shoeRuns(shoeId) {
  return state.data.runs
    .filter((r) => r.shoeId === shoeId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function unassignedRuns() {
  return state.data.runs.filter((r) => !r.shoeId);
}

/* ---------------------------------------------------------------
 * สถานะแอพ
 * ------------------------------------------------------------- */
const state = {
  data: loadData(),
  currentTab: "shoes",
  selectedShoeId: null,
  editingShoeId: null, // null = กำลังเพิ่มใหม่
  editingPhoto: null, // รูปที่กำลังแก้ในโมดัล (data URL) หรือ null
  runTargetShoeId: null,
};

/* ---------------------------------------------------------------
 * เรนเดอร์: แท็บรองเท้า
 * ------------------------------------------------------------- */
function renderShoeList() {
  const activeEl = document.getElementById("shoeListActive");
  const retiredEl = document.getElementById("shoeListRetired");
  const retiredSection = document.getElementById("retiredSection");

  const active = state.data.shoes
    .filter((s) => !s.isRetired)
    .sort((a, b) => totalDistance(b) - totalDistance(a));
  const retired = state.data.shoes.filter((s) => s.isRetired);

  activeEl.innerHTML = active.length
    ? active.map(shoeCardHtml).join("")
    : `<p class="empty-list">แตะ + เพื่อเพิ่มรองเท้าคู่แรกของคุณ</p>`;

  if (retired.length) {
    retiredSection.classList.remove("hidden");
    retiredEl.innerHTML = retired.map(shoeCardHtml).join("");
  } else {
    retiredSection.classList.add("hidden");
  }

  document.querySelectorAll(".shoe-card").forEach((card) => {
    card.addEventListener("click", () => selectShoe(card.dataset.id));
  });

  const banner = document.getElementById("unassignedBanner");
  const unassigned = unassignedRuns();
  if (unassigned.length) {
    banner.classList.remove("hidden");
    banner.textContent = `การวิ่งที่ยังไม่ระบุรองเท้า (${unassigned.length}) — แตะเพื่อกำหนดรองเท้า`;
  } else {
    banner.classList.add("hidden");
  }
}

function shoeCardHtml(shoe) {
  const selected = shoe.id === state.selectedShoeId ? "selected" : "";
  const thumb = shoe.photo ? `<img class="shoe-thumb" src="${shoe.photo}" alt="">` : "";
  return `
    <div class="shoe-card ${selected}" data-id="${shoe.id}">
      <div class="shoe-card-left">
        ${thumb}
        <div>
          <div class="name">${escapeHtml(shoe.name)}</div>
          ${shoe.brand ? `<div class="brand">${escapeHtml(shoe.brand)}</div>` : ""}
        </div>
      </div>
      <div class="distance">${totalDistance(shoe).toFixed(0)} กม.</div>
    </div>`;
}

function selectShoe(id) {
  state.selectedShoeId = id;
  document.getElementById("shoesLayout").classList.add("showing-detail");
  renderShoeList();
  renderDetail();
}

function renderDetail() {
  const empty = document.getElementById("detailEmpty");
  const content = document.getElementById("detailContent");
  const shoe = state.data.shoes.find((s) => s.id === state.selectedShoeId);

  if (!shoe) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  content.classList.remove("hidden");

  document.getElementById("detailName").textContent = shoe.name;
  document.getElementById("detailBrand").textContent = [shoe.brand, shoe.category]
    .filter(Boolean)
    .join(" · ");
  document.getElementById("detailTotal").textContent = `${totalDistance(shoe).toFixed(1)} กิโลเมตร`;

  const detailPhoto = document.getElementById("detailPhoto");
  if (shoe.photo) {
    detailPhoto.src = shoe.photo;
    detailPhoto.classList.remove("hidden");
  } else {
    detailPhoto.removeAttribute("src");
    detailPhoto.classList.add("hidden");
  }

  document.getElementById("retireShoeBtn").textContent = shoe.isRetired
    ? "ยกเลิกการเลิกใช้งาน"
    : "ทำเครื่องหมายเลิกใช้งาน";

  const runs = shoeRuns(shoe.id);
  const runListEl = document.getElementById("runList");
  runListEl.innerHTML = runs.length
    ? runs.map(runRowHtml).join("")
    : `<p class="empty-list">ยังไม่มีการวิ่งบันทึกไว้</p>`;

  runListEl.querySelectorAll(".run-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("ลบการวิ่งนี้หรือไม่?")) return;
      state.data.runs = state.data.runs.filter((r) => r.id !== btn.dataset.id);
      saveData();
      renderShoeList();
      renderDetail();
    });
  });
}

const SOURCE_ICON = { manual: "✋", strava: "🏃", csv: "📄" };

function runRowHtml(run) {
  const dt = new Date(run.date);
  const dateStr = dt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  return `
    <div class="run-row">
      <div class="source-icon">${SOURCE_ICON[run.source] || "✋"}</div>
      <div class="run-main">
        <div class="run-date">${dateStr}</div>
        ${run.notes ? `<div class="run-notes">${escapeHtml(run.notes)}</div>` : ""}
      </div>
      <div class="run-distance">${Number(run.distanceKm).toFixed(1)} กม.</div>
      <button class="run-delete" data-id="${run.id}" title="ลบ" aria-label="ลบ">🗑</button>
    </div>`;
}

function backToList() {
  document.getElementById("shoesLayout").classList.remove("showing-detail");
}

/* ---------------------------------------------------------------
 * โมดัล: เพิ่ม/แก้ไขรองเท้า
 * ------------------------------------------------------------- */
function openShoeModal(shoeId) {
  state.editingShoeId = shoeId || null;
  const shoe = shoeId ? state.data.shoes.find((s) => s.id === shoeId) : null;

  document.getElementById("shoeModalTitle").textContent = shoe ? "แก้ไขรองเท้า" : "เพิ่มรองเท้า";
  document.getElementById("shoeNameInput").value = shoe ? shoe.name : "";
  document.getElementById("shoeBrandInput").value = shoe ? shoe.brand : "";
  document.getElementById("shoeCategoryInput").value = shoe ? shoe.category : "ถนน";
  document.getElementById("shoeStartInput").value = shoe ? shoe.startingDistanceKm : 0;

  state.editingPhoto = shoe && shoe.photo ? shoe.photo : null;
  document.getElementById("shoePhotoInput").value = "";
  updateShoePhotoPreview();

  document.getElementById("shoeModal").classList.remove("hidden");
}

function updateShoePhotoPreview() {
  const wrap = document.getElementById("shoePhotoPreview");
  const img = document.getElementById("shoePhotoImg");
  if (state.editingPhoto) {
    img.src = state.editingPhoto;
    wrap.classList.remove("hidden");
  } else {
    img.removeAttribute("src");
    wrap.classList.add("hidden");
  }
}

function closeShoeModal() {
  document.getElementById("shoeModal").classList.add("hidden");
}

function saveShoeFromModal() {
  const name = document.getElementById("shoeNameInput").value.trim();
  if (!name) {
    alert("กรุณาใส่ชื่อรองเท้า");
    return;
  }
  const brand = document.getElementById("shoeBrandInput").value.trim();
  const category = document.getElementById("shoeCategoryInput").value;
  const startingDistanceKm = Number(document.getElementById("shoeStartInput").value) || 0;

  if (state.editingShoeId) {
    const shoe = state.data.shoes.find((s) => s.id === state.editingShoeId);
    Object.assign(shoe, { name, brand, category, startingDistanceKm, photo: state.editingPhoto });
  } else {
    state.data.shoes.push({
      id: uid(),
      name,
      brand,
      category,
      startingDistanceKm,
      photo: state.editingPhoto,
      isRetired: false,
      dateAdded: new Date().toISOString(),
    });
  }
  saveData();
  closeShoeModal();
  renderShoeList();
  renderDetail();
  renderSettingsCsvOptions();
}

/* ---------------------------------------------------------------
 * โมดัล: บันทึกการวิ่ง
 * ------------------------------------------------------------- */
function openRunModal(shoeId) {
  state.runTargetShoeId = shoeId;
  document.getElementById("runDateInput").value = toLocalDateTimeInputValue(new Date());
  document.getElementById("runDistanceInput").value = "";
  document.getElementById("runDurationInput").value = "";
  document.getElementById("runNotesInput").value = "";
  document.getElementById("runModal").classList.remove("hidden");
}

function closeRunModal() {
  document.getElementById("runModal").classList.add("hidden");
}

function toLocalDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function saveRunFromModal() {
  const distanceKm = Number(document.getElementById("runDistanceInput").value);
  if (!distanceKm || distanceKm <= 0) {
    alert("กรุณาใส่ระยะทางที่มากกว่า 0");
    return;
  }
  const dateVal = document.getElementById("runDateInput").value;
  const durationMinutes = Number(document.getElementById("runDurationInput").value) || null;
  const notes = document.getElementById("runNotesInput").value.trim();

  state.data.runs.push({
    id: uid(),
    shoeId: state.runTargetShoeId,
    date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
    distanceKm,
    durationMinutes,
    notes: notes || null,
    source: "manual",
    externalId: null,
    createdAt: new Date().toISOString(),
  });
  saveData();
  closeRunModal();
  renderShoeList();
  renderDetail();
}

/* ---------------------------------------------------------------
 * โมดัล: การวิ่งที่ยังไม่ระบุรองเท้า
 * ------------------------------------------------------------- */
function openUnassignedModal() {
  renderUnassignedModal();
  document.getElementById("unassignedModal").classList.remove("hidden");
}

function closeUnassignedModal() {
  document.getElementById("unassignedModal").classList.add("hidden");
}

function renderUnassignedModal() {
  const listEl = document.getElementById("unassignedList");
  const runs = unassignedRuns().sort((a, b) => new Date(b.date) - new Date(a.date));
  const activeShoes = state.data.shoes.filter((s) => !s.isRetired);

  if (!runs.length) {
    listEl.innerHTML = `<p class="empty-list">ไม่มีการวิ่งที่ยังไม่ระบุรองเท้า</p>`;
    return;
  }

  listEl.innerHTML = runs
    .map((run) => {
      const dt = new Date(run.date);
      const dateStr = dt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
      const options = activeShoes
        .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
        .join("");
      return `
        <div class="run-row">
          <div class="run-main">
            <div class="run-date">${dateStr}</div>
            <div class="run-notes">${Number(run.distanceKm).toFixed(1)} กม. ${run.notes ? "· " + escapeHtml(run.notes) : ""}</div>
          </div>
          <select class="run-assign" data-id="${run.id}">
            <option value="">กำหนดรองเท้า…</option>
            ${options}
          </select>
        </div>`;
    })
    .join("");

  listEl.querySelectorAll(".run-assign").forEach((sel) => {
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      const run = state.data.runs.find((r) => r.id === sel.dataset.id);
      run.shoeId = sel.value;
      saveData();
      renderUnassignedModal();
      renderShoeList();
      renderDetail();
    });
  });
}

/* ---------------------------------------------------------------
 * แท็บตั้งค่า
 * ------------------------------------------------------------- */
function renderSettingsCsvOptions() {
  const sel = document.getElementById("csvShoeSelect");
  const shoes = state.data.shoes.filter((s) => !s.isRetired);
  sel.innerHTML = shoes.length
    ? shoes.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")
    : `<option value="">(ยังไม่มีรองเท้า — เพิ่มก่อน)</option>`;
}

function handleCsvImport(file) {
  const shoeId = document.getElementById("csvShoeSelect").value;
  const resultEl = document.getElementById("csvResult");
  if (!shoeId) {
    resultEl.textContent = "กรุณาเพิ่มรองเท้าและเลือกก่อนนำเข้าไฟล์";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = parseCsvRuns(String(reader.result), shoeId);
      state.data.runs.push(...imported);
      saveData();
      resultEl.textContent = `นำเข้าสำเร็จ ${imported.length} รายการ`;
      renderShoeList();
      renderDetail();
    } catch (err) {
      resultEl.textContent = "นำเข้าไม่สำเร็จ: " + err.message;
    }
  };
  reader.readAsText(file);
}

function parseCsvRuns(text, shoeId) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) throw new Error("ไฟล์ว่างเปล่า");

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf("date");
  const distIdx = header.indexOf("distance_km");
  const durIdx = header.indexOf("duration_min");
  const notesIdx = header.indexOf("notes");
  if (dateIdx === -1 || distIdx === -1) {
    throw new Error("ต้องมีคอลัมน์ date และ distance_km");
  }

  const rows = lines.slice(1);
  const result = [];
  for (const line of rows) {
    const cols = line.split(",");
    const dateVal = (cols[dateIdx] || "").trim();
    const distVal = Number((cols[distIdx] || "").trim());
    if (!dateVal || !distVal) continue;
    const parsedDate = new Date(dateVal);
    if (isNaN(parsedDate.getTime())) continue;

    result.push({
      id: uid(),
      shoeId,
      date: parsedDate.toISOString(),
      distanceKm: distVal,
      durationMinutes: durIdx > -1 ? Number((cols[durIdx] || "").trim()) || null : null,
      notes: notesIdx > -1 ? (cols[notesIdx] || "").trim() || null : null,
      source: "csv",
      externalId: null,
      createdAt: new Date().toISOString(),
    });
  }
  return result;
}

/* ---------------------------------------------------------------
 * Strava
 * ------------------------------------------------------------- */
function loadStravaTokens() {
  try {
    const raw = localStorage.getItem(STRAVA_TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStravaTokens(tokens) {
  localStorage.setItem(STRAVA_TOKEN_KEY, JSON.stringify(tokens));
}

function clearStravaTokens() {
  localStorage.removeItem(STRAVA_TOKEN_KEY);
}

function stravaConfigured() {
  return (
    CONFIG.STRAVA_CLIENT_ID &&
    !CONFIG.STRAVA_CLIENT_ID.startsWith("PASTE_") &&
    CONFIG.STRAVA_PROXY_ENDPOINT &&
    !CONFIG.STRAVA_PROXY_ENDPOINT.startsWith("PASTE_")
  );
}

function renderStravaStatus() {
  const tokens = loadStravaTokens();
  const statusEl = document.getElementById("stravaStatus");
  const connectBtn = document.getElementById("stravaConnectBtn");
  const disconnectBtn = document.getElementById("stravaDisconnectBtn");
  const syncBtn = document.getElementById("stravaSyncBtn");

  if (tokens) {
    statusEl.textContent = tokens.athleteName ? `เชื่อมต่อแล้ว (${tokens.athleteName})` : "เชื่อมต่อแล้ว";
    connectBtn.classList.add("hidden");
    disconnectBtn.classList.remove("hidden");
    syncBtn.classList.remove("hidden");
  } else {
    statusEl.textContent = "ยังไม่ได้เชื่อมต่อ";
    connectBtn.classList.remove("hidden");
    disconnectBtn.classList.add("hidden");
    syncBtn.classList.add("hidden");
  }
}

function showStravaError(message) {
  const el = document.getElementById("stravaError");
  if (!message) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = message;
  el.classList.remove("hidden");
}

function connectStrava() {
  if (!stravaConfigured()) {
    showStravaError("ยังไม่ได้ตั้งค่า STRAVA_CLIENT_ID / STRAVA_PROXY_ENDPOINT ใน app.js (ดู README)");
    return;
  }
  const redirectUri = window.location.origin + window.location.pathname;
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", CONFIG.STRAVA_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,activity:read_all,profile:read_all");
  window.location.href = url.toString();
}

async function callStravaProxy(action, params) {
  const res = await fetch(CONFIG.STRAVA_PROXY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // เลี่ยง CORS preflight กับ Apps Script
    body: JSON.stringify({ action, ...params }),
  });
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message || "proxy error");
  return json;
}

async function handleStravaRedirectIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  // เอา ?code=...&scope=... ออกจาก URL ทันทีเพื่อไม่ให้ใช้ซ้ำโดยไม่ตั้งใจ
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);

  if (!stravaConfigured()) return;

  try {
    const json = await callStravaProxy("exchange", { code });
    saveStravaTokens(json.tokens);
    switchTab("settings");
    renderStravaStatus();
  } catch (err) {
    showStravaError("เชื่อมต่อ Strava ไม่สำเร็จ: " + err.message);
  }
}

async function ensureValidStravaToken() {
  let tokens = loadStravaTokens();
  if (!tokens) throw new Error("ยังไม่ได้เชื่อมต่อ Strava");

  const nowSec = Date.now() / 1000;
  if (tokens.expiresAt && nowSec < tokens.expiresAt - 60) {
    return tokens.accessToken;
  }
  const json = await callStravaProxy("refresh", { refreshToken: tokens.refreshToken });
  tokens = { ...tokens, ...json.tokens };
  saveStravaTokens(tokens);
  return tokens.accessToken;
}

async function syncStrava() {
  showStravaError(null);
  const syncBtn = document.getElementById("stravaSyncBtn");
  syncBtn.disabled = true;
  syncBtn.textContent = "กำลังซิงค์…";
  try {
    const accessToken = await ensureValidStravaToken();

    const gearJson = await callStravaProxy("gear", { accessToken });
    const gearList = gearJson.shoes || [];
    const gearIdToShoeId = {};
    for (const gear of gearList) {
      let shoe = state.data.shoes.find(
        (s) => s.name.toLowerCase() === gear.name.toLowerCase()
      );
      if (!shoe) {
        shoe = {
          id: uid(),
          name: gear.name,
          brand: "",
          category: "ถนน",
          startingDistanceKm: 0,
          isRetired: false,
          dateAdded: new Date().toISOString(),
        };
        state.data.shoes.push(shoe);
      }
      gearIdToShoeId[gear.id] = shoe.id;
    }

    const lastSync = localStorage.getItem("shoetracker_strava_last_sync");
    const activitiesJson = await callStravaProxy("activities", {
      accessToken,
      after: lastSync || null,
    });

    const existingIds = new Set(state.data.runs.map((r) => r.externalId).filter(Boolean));
    let added = 0;
    for (const act of activitiesJson.activities || []) {
      const externalId = "strava_" + act.id;
      if (existingIds.has(externalId)) continue;
      state.data.runs.push({
        id: uid(),
        shoeId: act.gear_id ? gearIdToShoeId[act.gear_id] || null : null,
        date: act.start_date_local,
        distanceKm: act.distance / 1000,
        durationMinutes: act.moving_time ? Math.round(act.moving_time / 60) : null,
        notes: act.name || null,
        source: "strava",
        externalId,
        createdAt: new Date().toISOString(),
      });
      added++;
    }
    localStorage.setItem("shoetracker_strava_last_sync", String(Math.floor(Date.now() / 1000)));
    saveData();
    renderShoeList();
    renderDetail();
    renderSettingsCsvOptions();
    showStravaError(null);
    syncBtn.textContent = `ซิงค์ล่าสุด: เพิ่ม ${added} รายการ`;
  } catch (err) {
    showStravaError("ซิงค์ไม่สำเร็จ: " + err.message);
    syncBtn.textContent = "ซิงค์ข้อมูลจาก Strava เดี๋ยวนี้";
  } finally {
    syncBtn.disabled = false;
    setTimeout(() => {
      syncBtn.textContent = "ซิงค์ข้อมูลจาก Strava เดี๋ยวนี้";
    }, 4000);
  }
}

/* ---------------------------------------------------------------
 * ทั่วไป
 * ------------------------------------------------------------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.getElementById("panel-shoes").classList.toggle("hidden", tab !== "shoes");
  document.getElementById("panel-settings").classList.toggle("hidden", tab !== "settings");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "shoetracker-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

/* นำเข้า/กู้คืนข้อมูลจากไฟล์ JSON — รวมกับข้อมูลเดิม จับคู่รองเท้าตามชื่อ
   และกันรายการวิ่งซ้ำด้วย externalId (โครงสร้างเดียวกับไฟล์ที่ปุ่ม "ส่งออก" สร้าง) */
function restoreFromJson(obj) {
  if (!obj || !Array.isArray(obj.shoes) || !Array.isArray(obj.runs)) {
    throw new Error("ไฟล์ไม่ถูกต้อง (ต้องมี shoes และ runs)");
  }
  const nameToId = {};
  state.data.shoes.forEach((s) => {
    nameToId[s.name.toLowerCase()] = s.id;
  });

  const idMap = {};
  let addedShoes = 0;
  obj.shoes.forEach((inS) => {
    const key = (inS.name || "").toLowerCase();
    if (!key) return;
    if (nameToId[key]) {
      idMap[inS.id] = nameToId[key];
    } else {
      const newShoe = {
        id: uid(),
        name: inS.name,
        brand: inS.brand || "",
        category: inS.category || "ถนน",
        startingDistanceKm: Number(inS.startingDistanceKm) || 0,
        photo: inS.photo || null,
        isRetired: !!inS.isRetired,
        dateAdded: inS.dateAdded || new Date().toISOString(),
      };
      state.data.shoes.push(newShoe);
      nameToId[key] = newShoe.id;
      idMap[inS.id] = newShoe.id;
      addedShoes++;
    }
  });

  const existingExt = new Set(state.data.runs.map((r) => r.externalId).filter(Boolean));
  let addedRuns = 0;
  obj.runs.forEach((inR) => {
    if (inR.externalId && existingExt.has(inR.externalId)) return;
    state.data.runs.push({
      id: uid(),
      shoeId: inR.shoeId != null ? idMap[inR.shoeId] || null : null,
      date: inR.date,
      distanceKm: Number(inR.distanceKm) || 0,
      durationMinutes: inR.durationMinutes != null ? Number(inR.durationMinutes) : null,
      notes: inR.notes || null,
      source: inR.source || "manual",
      externalId: inR.externalId || null,
      createdAt: new Date().toISOString(),
    });
    if (inR.externalId) existingExt.add(inR.externalId);
    addedRuns++;
  });
  return { addedShoes, addedRuns };
}

function handleDataImport(file) {
  const resultEl = document.getElementById("importResult");
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(String(reader.result));
      const { addedShoes, addedRuns } = restoreFromJson(obj);
      if (!saveData()) return;
      renderShoeList();
      renderDetail();
      renderSettingsCsvOptions();
      resultEl.textContent =
        `นำเข้าสำเร็จ: เพิ่มรองเท้า ${addedShoes} คู่, การวิ่ง ${addedRuns} รายการ` +
        (addedShoes === 0 && addedRuns === 0 ? " (ข้อมูลนี้มีอยู่แล้ว ไม่มีรายการซ้ำถูกเพิ่ม)" : "");
    } catch (err) {
      resultEl.textContent = "นำเข้าไม่สำเร็จ: " + err.message;
    }
  };
  reader.onerror = () => {
    resultEl.textContent = "อ่านไฟล์ไม่สำเร็จ";
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm("ลบข้อมูลรองเท้าและการวิ่งทั้งหมดในเบราว์เซอร์นี้หรือไม่? ทำย้อนกลับไม่ได้")) return;
  state.data = { shoes: [], runs: [] };
  saveData();
  state.selectedShoeId = null;
  backToList();
  renderShoeList();
  renderDetail();
  renderSettingsCsvOptions();
}

/* ---------------------------------------------------------------
 * ซิงค์ / สำรองข้อมูลออนไลน์ (ผ่าน Apps Script + Google Drive)
 * ------------------------------------------------------------- */
function getSyncConfig() {
  return {
    endpoint: (localStorage.getItem(SYNC_ENDPOINT_KEY) || "").trim(),
    code: (localStorage.getItem(SYNC_CODE_KEY) || "").trim(),
  };
}

function syncConfigured() {
  const cfg = getSyncConfig();
  return Boolean(cfg.endpoint && cfg.code);
}

function setSyncStatus(message, isError) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("sync-error", Boolean(isError));
}

function renderSyncStatus() {
  if (!syncConfigured()) {
    setSyncStatus("ยังไม่ได้ตั้งค่า — ใส่ Apps Script URL และรหัสซิงค์ให้ครบเพื่อเปิดใช้งาน");
    return;
  }
  const last = localStorage.getItem(SYNC_LAST_KEY);
  setSyncStatus(
    last
      ? "พร้อมซิงค์ · สำรองล่าสุด: " + new Date(last).toLocaleString("th-TH")
      : "พร้อมซิงค์ · ยังไม่เคยสำรอง"
  );
}

function scheduleCloudPush() {
  if (suppressCloudPush || !syncConfigured()) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(pushToCloud, 1500);
}

async function pushToCloud() {
  const cfg = getSyncConfig();
  if (!cfg.endpoint || !cfg.code) return;
  setSyncStatus("กำลังสำรองขึ้นคลาวด์…");
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // เลี่ยง CORS preflight กับ Apps Script
      body: JSON.stringify({ action: "save", syncCode: cfg.code, data: state.data }),
    });
    const json = await res.json();
    if (json.status !== "ok") throw new Error(json.message || "สำรองไม่สำเร็จ");
    localStorage.setItem(SYNC_LAST_KEY, json.updatedAt || new Date().toISOString());
    setSyncStatus("สำรองล่าสุด: " + new Date().toLocaleString("th-TH"));
  } catch (err) {
    setSyncStatus("สำรองไม่สำเร็จ: " + err.message, true);
  }
}

async function pullFromCloud() {
  const cfg = getSyncConfig();
  if (!cfg.endpoint || !cfg.code) {
    setSyncStatus("ยังไม่ได้ตั้งค่า Apps Script URL และรหัสซิงค์", true);
    return;
  }
  setSyncStatus("กำลังดึงข้อมูลจากคลาวด์…");
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "load", syncCode: cfg.code }),
    });
    const json = await res.json();
    if (json.status !== "ok") throw new Error(json.message || "ดึงข้อมูลไม่สำเร็จ");

    const cloud = json.data;
    const hasData = cloud && ((cloud.shoes || []).length || (cloud.runs || []).length);
    if (!hasData) {
      setSyncStatus("ยังไม่มีข้อมูลบนคลาวด์สำหรับรหัสนี้ (ลองกด “สำรองขึ้นคลาวด์” จากเครื่องที่มีข้อมูลก่อน)", true);
      return;
    }

    suppressCloudPush = true;
    state.data = { shoes: cloud.shoes || [], runs: cloud.runs || [] };
    saveData();
    suppressCloudPush = false;

    state.selectedShoeId = null;
    backToList();
    renderShoeList();
    renderDetail();
    renderSettingsCsvOptions();
    localStorage.setItem(SYNC_LAST_KEY, json.updatedAt || new Date().toISOString());
    setSyncStatus("ดึงข้อมูลจากคลาวด์สำเร็จ · อัปเดตเมื่อ " + new Date().toLocaleString("th-TH"));
  } catch (err) {
    setSyncStatus("ดึงไม่สำเร็จ: " + err.message, true);
  }
}

function generateSyncCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const arr = new Uint32Array(20);
  (window.crypto || window.msCrypto).getRandomValues(arr);
  for (let i = 0; i < arr.length; i++) code += chars[arr[i] % chars.length];
  return code;
}

/* ---------------------------------------------------------------
 * ผูก event ทั้งหมด
 * ------------------------------------------------------------- */
function bindEvents() {
  document.getElementById("mainTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (btn) switchTab(btn.dataset.tab);
  });

  document.getElementById("addShoeBtn").addEventListener("click", () => openShoeModal(null));
  document.getElementById("shoeModalCancel").addEventListener("click", closeShoeModal);
  document.getElementById("shoeModalSave").addEventListener("click", saveShoeFromModal);

  document.getElementById("shoePhotoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      state.editingPhoto = await resizeImageToDataURL(file, 640, 0.82);
      updateShoePhotoPreview();
    } catch (err) {
      alert("ใช้รูปนี้ไม่ได้: " + err.message);
    }
  });
  document.getElementById("shoePhotoRemove").addEventListener("click", () => {
    state.editingPhoto = null;
    document.getElementById("shoePhotoInput").value = "";
    updateShoePhotoPreview();
  });

  document.getElementById("backBtn").addEventListener("click", backToList);
  document.getElementById("logRunBtn").addEventListener("click", () => openRunModal(state.selectedShoeId));
  document.getElementById("runModalCancel").addEventListener("click", closeRunModal);
  document.getElementById("runModalSave").addEventListener("click", saveRunFromModal);

  document.getElementById("detailMenuBtn").addEventListener("click", () => {
    document.getElementById("detailMenu").classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".menu-wrap")) {
      document.getElementById("detailMenu").classList.add("hidden");
    }
  });
  document.getElementById("editShoeBtn").addEventListener("click", () => {
    document.getElementById("detailMenu").classList.add("hidden");
    openShoeModal(state.selectedShoeId);
  });
  document.getElementById("retireShoeBtn").addEventListener("click", () => {
    document.getElementById("detailMenu").classList.add("hidden");
    const shoe = state.data.shoes.find((s) => s.id === state.selectedShoeId);
    shoe.isRetired = !shoe.isRetired;
    saveData();
    renderShoeList();
    renderDetail();
  });
  document.getElementById("deleteShoeBtn").addEventListener("click", () => {
    document.getElementById("detailMenu").classList.add("hidden");
    if (!confirm("ลบรองเท้านี้และประวัติการวิ่งทั้งหมดของมันหรือไม่?")) return;
    const id = state.selectedShoeId;
    state.data.shoes = state.data.shoes.filter((s) => s.id !== id);
    state.data.runs = state.data.runs.filter((r) => r.shoeId !== id);
    saveData();
    state.selectedShoeId = null;
    backToList();
    renderShoeList();
    renderDetail();
    renderSettingsCsvOptions();
  });

  document.getElementById("unassignedBanner").addEventListener("click", openUnassignedModal);
  document.getElementById("unassignedModalClose").addEventListener("click", closeUnassignedModal);

  document.getElementById("stravaConnectBtn").addEventListener("click", connectStrava);
  document.getElementById("stravaDisconnectBtn").addEventListener("click", () => {
    clearStravaTokens();
    renderStravaStatus();
  });
  document.getElementById("stravaSyncBtn").addEventListener("click", syncStrava);

  document.getElementById("csvFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleCsvImport(file);
  });

  document.getElementById("exportDataBtn").addEventListener("click", exportData);
  document.getElementById("importDataBtn").addEventListener("click", () => {
    document.getElementById("importDataInput").click();
  });
  document.getElementById("importDataInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleDataImport(file);
    e.target.value = "";
  });
  document.getElementById("clearDataBtn").addEventListener("click", clearAllData);

  // ---- ซิงค์ออนไลน์ ----
  const endpointInput = document.getElementById("syncEndpointInput");
  const codeInput = document.getElementById("syncCodeInput");
  endpointInput.addEventListener("input", () => {
    localStorage.setItem(SYNC_ENDPOINT_KEY, endpointInput.value.trim());
    renderSyncStatus();
  });
  codeInput.addEventListener("input", () => {
    localStorage.setItem(SYNC_CODE_KEY, codeInput.value.trim());
    renderSyncStatus();
  });
  document.getElementById("syncGenCodeBtn").addEventListener("click", () => {
    const code = generateSyncCode();
    codeInput.value = code;
    localStorage.setItem(SYNC_CODE_KEY, code);
    renderSyncStatus();
  });
  document.getElementById("syncCopyCodeBtn").addEventListener("click", () => {
    const code = codeInput.value.trim();
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code);
    }
    setSyncStatus("คัดลอกรหัสซิงค์แล้ว — เก็บไว้ให้ดีเหมือนรหัสผ่าน");
  });
  document.getElementById("syncPushBtn").addEventListener("click", () => {
    if (!syncConfigured()) {
      setSyncStatus("ใส่ Apps Script URL และรหัสซิงค์ให้ครบก่อน", true);
      return;
    }
    pushToCloud();
  });
  document.getElementById("syncPullBtn").addEventListener("click", () => {
    if (!syncConfigured()) {
      setSyncStatus("ใส่ Apps Script URL และรหัสซิงค์ให้ครบก่อน", true);
      return;
    }
    const hasLocal = state.data.shoes.length || state.data.runs.length;
    if (hasLocal && !confirm("การดึงจากคลาวด์จะแทนที่ข้อมูลในเบราว์เซอร์นี้ทั้งหมด ต้องการทำต่อหรือไม่?")) {
      return;
    }
    pullFromCloud();
  });
}

function initSyncUI() {
  const cfg = getSyncConfig();
  document.getElementById("syncEndpointInput").value = cfg.endpoint;
  document.getElementById("syncCodeInput").value = cfg.code;
  renderSyncStatus();

  // เบราว์เซอร์ใหม่ (ยังไม่มีข้อมูลในเครื่อง) + ตั้งค่าซิงค์ไว้แล้ว → ดึงข้อมูลให้อัตโนมัติ
  const localEmpty = !state.data.shoes.length && !state.data.runs.length;
  if (syncConfigured() && localEmpty) {
    pullFromCloud();
  }
}

/* ---------------------------------------------------------------
 * เริ่มต้นแอพ
 * ------------------------------------------------------------- */
async function init() {
  bindEvents();
  renderShoeList();
  renderDetail();
  renderSettingsCsvOptions();
  renderStravaStatus();
  initSyncUI();
  await handleStravaRedirectIfPresent();
}

document.addEventListener("DOMContentLoaded", init);

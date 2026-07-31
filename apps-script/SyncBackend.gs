/****************************************************************
 * ShoeTracker — Sync/Backup backend (Google Apps Script)
 *
 * เก็บข้อมูลของแอพเป็นไฟล์ JSON ใน Google Drive ของคุณเอง 1 ไฟล์ต่อ 1
 * "รหัสซิงค์" (sync code) เพื่อให้เปิดเบราว์เซอร์/เครื่องอื่นแล้วใส่รหัส
 * เดียวกัน ก็ดึงข้อมูลชุดเดียวกันได้
 *
 * แยกจากโปรเจกต์ Strava proxy โดยสิ้นเชิง — deploy เป็นโปรเจกต์ใหม่ต่างหาก
 *
 * วิธีใช้:
 *  1) ไปที่ script.google.com → New project → วางโค้ดนี้แทนของเดิม
 *  2) Deploy → New deployment → ประเภท "Web app"
 *       - Execute as: Me
 *       - Who has access: Anyone
 *  3) ครั้งแรกจะขอสิทธิ์เข้าถึง Google Drive (กด Advanced → Go to ... → Allow)
 *  4) คัดลอก Web app URL (ลงท้าย /exec) ไปใส่ในแอพ ช่อง "Apps Script URL"
 *
 * ความปลอดภัย: ใครมี URL + รหัสซิงค์ของคุณ จะเข้าถึงข้อมูลได้ ให้เก็บรหัส
 * ซิงค์เหมือนรหัสผ่าน (แอพจะสุ่มรหัสยาว ๆ ให้อัตโนมัติ)
 ****************************************************************/

var FOLDER_NAME = "ShoeTracker Backups";

function doGet() {
  return json_({ status: "ok", message: "ShoeTracker sync backend is running" });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var code = sanitize_(body.syncCode);
    if (!code) return json_({ status: "error", message: "missing syncCode" });

    if (body.action === "save") {
      writeData_(code, body.data);
      return json_({ status: "ok", updatedAt: new Date().toISOString() });
    }
    if (body.action === "load") {
      var r = readData_(code);
      return json_({ status: "ok", data: r.data, updatedAt: r.updatedAt });
    }
    // ผสานข้อมูลฝั่งเซิร์ฟเวอร์แบบ atomic (อยู่ใต้ lock อยู่แล้ว) — กันหลายเครื่องทับกัน
    if (body.action === "sync") {
      var cur = readData_(code).data;
      var merged = mergeData_(cur, body.data);
      writeData_(code, merged);
      return json_({ status: "ok", data: merged, updatedAt: new Date().toISOString() });
    }
    return json_({ status: "error", message: "unknown action: " + body.action });
  } catch (err) {
    return json_({ status: "error", message: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// อนุญาตเฉพาะตัวอักษร/ตัวเลข/-/_ กันไม่ให้รหัสไปยุ่งกับชื่อไฟล์
function sanitize_(code) {
  if (!code) return "";
  return String(code).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

function folder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function fileName_(code) {
  return "shoetracker_" + code + ".json";
}

function writeData_(code, data) {
  var folder = folder_();
  var name = fileName_(code);
  var payload = JSON.stringify({ updatedAt: new Date().toISOString(), data: data });
  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    it.next().setContent(payload);
  } else {
    folder.createFile(name, payload, "application/json");
  }
}

function readData_(code) {
  var folder = folder_();
  var it = folder.getFilesByName(fileName_(code));
  if (!it.hasNext()) return { data: null, updatedAt: null };
  var content = it.next().getBlob().getDataAsString();
  try {
    var obj = JSON.parse(content);
    return { data: obj.data, updatedAt: obj.updatedAt };
  } catch (e) {
    return { data: null, updatedAt: null };
  }
}

/* ---- ผสานข้อมูล 2 ชุด: เลือกเรคคอร์ดที่ updatedAt ใหม่กว่า + เคารพ tombstone ---- */
function mergeData_(a, b) {
  a = a || {};
  b = b || {};
  var dShoes = mergeDeleted_((a.deleted || {}).shoes, (b.deleted || {}).shoes);
  var dRuns = mergeDeleted_((a.deleted || {}).runs, (b.deleted || {}).runs);
  // ตัด tombstone ที่เก่ากว่า 60 วันทิ้ง เพื่อไม่ให้ข้อมูลบวมไปเรื่อย ๆ
  var cutoff = Date.now() - 60 * 24 * 3600 * 1000;
  dShoes = prune_(dShoes, cutoff);
  dRuns = prune_(dRuns, cutoff);
  return dedupe_({
    shoes: mergeCol_(a.shoes, b.shoes, dShoes),
    runs: mergeCol_(a.runs, b.runs, dRuns),
    deleted: { shoes: dShoes, runs: dRuns }
  });
}

/* กันซ้ำ: รวมรองเท้าชื่อซ้ำ (ชี้ runs ไปคู่ที่เก็บไว้) + รวมการวิ่ง externalId ซ้ำ */
function dedupe_(data) {
  var shoes = (data.shoes || []).slice();
  var runs = (data.runs || []).slice();
  var i;

  // รองเท้า: รวมตามชื่อ เก็บคู่ที่ dateAdded เก่าสุด
  shoes.sort(function (x, y) { return new Date(x.dateAdded || 0) - new Date(y.dateAdded || 0); });
  var nameToId = {}, idRemap = {}, keptShoes = [];
  for (i = 0; i < shoes.length; i++) {
    var s = shoes[i];
    var key = String(s.name || "").toLowerCase().replace(/^\s+|\s+$/g, "");
    if (!key) { keptShoes.push(s); continue; }
    if (nameToId[key]) { idRemap[s.id] = nameToId[key]; }
    else { nameToId[key] = s.id; idRemap[s.id] = s.id; keptShoes.push(s); }
  }
  for (i = 0; i < runs.length; i++) {
    var r = runs[i];
    if (r.shoeId && idRemap[r.shoeId] && idRemap[r.shoeId] !== r.shoeId) r.shoeId = idRemap[r.shoeId];
  }

  // การวิ่ง: รวมตาม externalId แบบมาตรฐาน (ว่าง = กรอกมือ ไม่รวม)
  var byExt = {}, keptRuns = [];
  for (i = 0; i < runs.length; i++) {
    var rr = runs[i];
    var k = normExt_(rr.externalId);
    if (!k) { keptRuns.push(rr); continue; }
    var ex = byExt[k];
    byExt[k] = ex ? betterRun_(ex, rr) : rr;
  }
  for (var e in byExt) if (byExt.hasOwnProperty(e)) { byExt[e].externalId = e; keptRuns.push(byExt[e]); }

  return { shoes: keptShoes, runs: keptRuns, deleted: data.deleted || { shoes: {}, runs: {} } };
}

function betterRun_(a, b) {
  var as = a.shoeId ? 1 : 0, bs = b.shoeId ? 1 : 0;
  if (as !== bs) return as > bs ? a : b;
  return (Number(b.updatedAt) || 0) > (Number(a.updatedAt) || 0) ? b : a;
}

function normExt_(ext) {
  if (ext == null || ext === "") return "";
  return String(ext).replace(/^strava[a-z]*_/i, "strava_");
}

function mergeDeleted_(a, b) {
  var out = {};
  var k;
  a = a || {};
  b = b || {};
  for (k in a) if (a.hasOwnProperty(k)) out[k] = a[k];
  for (k in b) if (b.hasOwnProperty(k)) { if (out[k] == null || out[k] < b[k]) out[k] = b[k]; }
  return out;
}

function prune_(map, cutoff) {
  var out = {};
  for (var k in map) if (map.hasOwnProperty(k)) { if (map[k] >= cutoff) out[k] = map[k]; }
  return out;
}

function mergeCol_(arrA, arrB, tomb) {
  var byId = {};
  function consider(rec) {
    if (!rec || rec.id == null) return;
    var u = Number(rec.updatedAt) || 0;
    var t = tomb[rec.id];
    if (t != null && t >= u) return; // ถูกลบหลังเวอร์ชันนี้
    var ex = byId[rec.id];
    if (!ex || (Number(ex.updatedAt) || 0) < u) byId[rec.id] = rec;
  }
  var i;
  arrA = arrA || [];
  arrB = arrB || [];
  for (i = 0; i < arrA.length; i++) consider(arrA[i]);
  for (i = 0; i < arrB.length; i++) consider(arrB[i]);
  var out = [];
  for (var id in byId) if (byId.hasOwnProperty(id)) out.push(byId[id]);
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
